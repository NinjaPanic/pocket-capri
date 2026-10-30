"""Tests du chemin de la voix (sans micro, sans carte graphique, sans réseau).

    .venv\\Scripts\\python -m unittest discover -s tests -v
"""

import asyncio
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BRAIN))
# jamais sa vraie mémoire : le serveur importé par les tests travaille dans un dossier jetable
os.environ.setdefault("CAPRI_DATA", tempfile.mkdtemp(prefix="capri-test-"))

from capri_brain import voice  # noqa: E402
from capri_brain.llm import LLM, LLMError  # noqa: E402
from capri_brain.memory import Memory  # noqa: E402
from capri_brain.perf import Perf, Turn  # noqa: E402

FRAME = b"\x00" * voice.FRAME_BYTES


class FakeVad:
    """Probabilité de voix pilotée par le test : 1 = il parle, 0 = silence."""

    def __init__(self):
        self.script: list[float] = []

    def __call__(self, frame):
        return self.script.pop(0) if self.script else 0.0


def segmenter(**cfg) -> tuple[voice.Segmenter, FakeVad]:
    seg = voice.Segmenter.__new__(voice.Segmenter)
    fake = FakeVad()
    # même état qu'un vrai segmenteur, sans charger Silero
    seg.vad = fake
    seg.start_frames, seg.cfg = 3, {"end_silence": 0.6, "end_silence_long": 1.3, "pre_transcribe_silence": 0.28, **cfg}
    seg.max_frames = int(20 / voice.FRAME_SECONDS)
    from collections import deque
    seg.preroll, seg.frames = deque(maxlen=10), []
    seg.voiced = seg.silent = 0
    seg.active, seg._pending = False, b""
    seg.segment, seg.paused, seg.extend, seg.voice_frames, seg.draft_ready = 0, False, False, 0, False
    return seg, fake


def run(seg, fake, probs):
    fake.script = list(probs)
    events = []
    for _ in probs:
        events += seg.feed(FRAME)
    return events


class SegmenterTest(unittest.TestCase):
    def test_pause_then_end_reuses_draft(self):
        seg, fake = segmenter()
        events = run(seg, fake, [1] * 20 + [0] * 9)
        kinds = [e for e, _ in events]
        self.assertEqual(kinds[:2], ["start", "voiced"])
        self.assertIn("pause", kinds)
        self.assertNotIn("end", kinds)  # 0,28 s de silence : pas encore la fin
        seg.draft_ready = True  # le brouillon est revenu, la phrase est finie
        events = run(seg, fake, [0] * 12)
        end = [p for e, p in events if e == "end"]
        self.assertEqual(len(end), 1)
        self.assertTrue(end[0][2], "le brouillon doit être réutilisable")

    def test_speech_resumes_invalidates_draft(self):
        seg, fake = segmenter()
        events = run(seg, fake, [1] * 20 + [0] * 9 + [1] * 10 + [0] * 25)
        kinds = [e for e, _ in events]
        self.assertIn("resume", kinds)
        # le 2e silence relance un brouillon ; sans réponse, on attend jusqu'au silence long
        self.assertNotIn("end", kinds)
        seg.draft_ready = True
        end = [p for e, p in run(seg, fake, [0]) if e == "end"]
        self.assertTrue(end and end[0][2])

    def test_unfinished_sentence_waits_longer(self):
        seg, fake = segmenter()
        run(seg, fake, [1] * 20 + [0] * 9)
        seg.draft_ready, seg.extend = True, True  # « …et » : il cherche la suite
        self.assertFalse([e for e, _ in run(seg, fake, [0] * 20) if e == "end"])
        self.assertTrue([e for e, _ in run(seg, fake, [0] * 15) if e == "end"])

    def test_no_draft_answer_falls_back_to_long_silence(self):
        seg, fake = segmenter()
        events = run(seg, fake, [1] * 20 + [0] * int(1.3 / voice.FRAME_SECONDS) + [0])
        self.assertTrue([e for e, _ in events if e == "end"])


class TextTest(unittest.TestCase):
    def test_unfinished(self):
        for text in ["Je voulais te dire que", "Mets la musique et", "Euh…", "I was thinking about the", "Capri, tu peux, euh"]:
            self.assertTrue(voice.unfinished(text), text)
        for text in ["Mets la musique.", "Ça va ?", "Tu te souviens de mon jeu préféré ?", "Merci beaucoup"]:
            self.assertFalse(voice.unfinished(text), text)

    def test_first_chunk_is_short(self):
        sp = voice.SentenceSplitter()
        out = sp.feed("Ouais, enfin je veux dire, ça dépend surtout de ce que tu veux en faire au juste")
        self.assertTrue(out, "la 1re virgule après ~18 caractères doit lancer la voix")
        self.assertLess(len(out[0]), 40)
        rest = sp.feed(" vraiment. Et la suite") + sp.flush()
        self.assertEqual(" ".join(out + rest).replace("  ", " "),
                         "Ouais, enfin je veux dire, ça dépend surtout de ce que tu veux en faire au juste vraiment. Et la suite")

    def test_sentences_in_order(self):
        sp = voice.SentenceSplitter()
        said = sp.feed("Salut toi. ") + sp.feed("Je t'attendais. Bon") + sp.flush()
        self.assertEqual(said, ["Salut toi.", "Je t'attendais.", "Bon"])

    def test_echo(self):
        v = voice.Voice.__new__(voice.Voice)
        from collections import deque
        v.recent_said = deque(maxlen=12)
        v.said("Bon, j'ai mis ta musique, mais franchement tes goûts me laissent perplexe.")
        self.assertTrue(v.is_echo("mais franchement tes goûts me laissent"))
        self.assertFalse(v.is_echo("attends, mets plutôt du jazz"))
        self.assertFalse(v.is_echo("non c'est pas ça que je voulais"))


class LLMPriorityTest(unittest.TestCase):
    def make(self):
        llm = LLM({"llm": {"provider": "ollama", "ollama": {"url": "http://x", "model": "m", "keep_alive": "1m", "num_ctx": 1}},
                   "memory": {"embed_model": "e"}})
        llm.quiet_after = 0.2

        async def fake(messages, temperature, json_mode, max_tokens=None, tools=None):
            for i in range(30):
                await asyncio.sleep(0.02)
                yield f"{messages[0]['content']}{i} "
        llm._ollama_stream = fake
        return llm

    def test_background_waits_and_yields(self):
        llm = self.make()

        async def scenario():
            order = []

            async def fg():
                async for _ in llm.stream([{"content": "fg"}]):
                    pass
                order.append("fg")

            async def bg():
                try:
                    await llm.complete([{"content": "bg"}], background=True)
                    order.append("bg")
                except LLMError:
                    order.append("bg-interrompue")

            t1 = asyncio.create_task(fg())
            await asyncio.sleep(0.01)
            t2 = asyncio.create_task(bg())
            await asyncio.gather(t1, t2)
            return order

        self.assertEqual(asyncio.run(scenario()), ["fg", "bg"])  # la réflexion attend la fin de la conversation

    def test_foreground_preempts_background(self):
        llm = self.make()

        async def scenario():
            async def bg():
                try:
                    await llm.complete([{"content": "bg"}], background=True)
                    return "fini"
                except LLMError:
                    return "interrompue"

            t = asyncio.create_task(bg())
            await asyncio.sleep(0.15)
            async for _ in llm.stream([{"content": "fg"}]):
                break
            return await t

        self.assertEqual(asyncio.run(scenario()), "interrompue")
        self.assertEqual(llm.foreground, 0)


class HistoryWindowTest(unittest.TestCase):
    def test_window_start_is_stable(self):
        """La fenêtre d'historique avance par blocs : le début reste le même plusieurs messages de suite."""
        from capri_brain import server
        with tempfile.TemporaryDirectory() as d:
            mem = Memory(Path(d) / "t.db")
            fake = type("C", (), {})()
            fake.memory, fake.cfg = mem, {"memory": {"history_turns": 12}}
            starts = []
            for i in range(60):
                mem.add_message("user" if i % 2 == 0 else "assistant", f"m{i}", "t")
                starts.append(server.Capri._history(fake)[0]["content"])
            changes = sum(a != b for a, b in zip(starts[24:], starts[25:]))
            self.assertLessEqual(changes, 5)  # 35 messages : ~4 changements au lieu de 35
            self.assertTrue(all(24 <= len(server.Capri._history(fake)) <= 32 for _ in [0]))
            mem.db.close()


class PerfTest(unittest.TestCase):
    def test_turn_stats(self):
        with tempfile.TemporaryDirectory() as d:
            perf = Perf(Path(d) / "p.jsonl")
            for ms in (100, 200, 300):
                t = Turn("voix", time.perf_counter() - ms / 1000)
                t.mark("premier_son_joue")
                perf.finish(t)
            stats = perf.stats("voix")["premier_son_joue"]
            self.assertEqual(stats["n"], 3)
            self.assertAlmostEqual(stats["mediane"], 200, delta=30)
            self.assertEqual(len(Perf(Path(d) / "p.jsonl").turns), 3)  # relu après redémarrage


if __name__ == "__main__":
    unittest.main()

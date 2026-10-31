"""Quota en ligne plein : la conversation passe par le modèle local, ses réflexions de fond attendent."""

import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain.llm import LLM, LLMError, _QuotaFull, _seconds  # noqa: E402


def make_llm(cloud_ok: bool) -> tuple[LLM, list[str]]:
    llm = LLM({"llm": {"provider": "groq", "ollama": {"url": "http://x", "model": "m", "keep_alive": "4h", "num_ctx": 1}},
               "memory": {"embed_model": "e"}})
    calls: list[str] = []

    async def cloud(*a, **k):
        calls.append("cloud")
        if not cloud_ok:
            raise _QuotaFull("Limite de Groq atteinte", 40)
        yield "en ligne"

    async def local(*a, **k):
        calls.append("local:" + k.get("keep_alive", ""))
        yield "local"

    llm._cloud_stream, llm._ollama_stream = cloud, local
    return llm, calls


class QuotaTest(unittest.TestCase):
    def test_conversation_falls_back_then_stays_local(self):
        llm, calls = make_llm(cloud_ok=False)
        self.assertEqual(asyncio.run(llm.complete([])), "local")
        self.assertEqual(asyncio.run(llm.complete([])), "local")
        self.assertEqual(calls, ["cloud", "local:3m", "local:3m"], "pas de nouvel essai en ligne tant que c'est plein")

    def test_background_waits(self):
        llm, calls = make_llm(cloud_ok=False)
        llm.quiet_after = 0
        with self.assertRaises(LLMError):
            asyncio.run(llm.complete([], background=True))
        llm2, _ = make_llm(cloud_ok=True)
        llm2.quiet_after = 0
        llm2.cloud_tokens_left, llm2.cloud_reset_at = 1500, float("inf")
        with self.assertRaises(LLMError):
            asyncio.run(llm2.complete([], background=True))

    def test_durations(self):
        self.assertAlmostEqual(_seconds("45.3s"), 45.3)
        self.assertAlmostEqual(_seconds("24m28.8s"), 1468.8)
        self.assertAlmostEqual(_seconds("120ms"), 0.12)
        self.assertEqual(_seconds("7"), 7)


if __name__ == "__main__":
    unittest.main()

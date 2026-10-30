"""Mesure de bout en bout : on lui parle (vraies phrases synthétisées, envoyées au rythme d'un micro) et on
chronomètre le moment où sa voix revient. À lancer contre un cerveau de TEST (copie de la mémoire, autre port) :

    set CAPRI_DATA=C:\\chemin\\copie-data & set CAPRI_PORT=8775 & .venv\\Scripts\\python -m capri_brain
    .venv\\Scripts\\python tools\\bench_conversation.py --port 8775 --runs 3

Résultat : médiane et pire cas, par scénario, de « fin de ta phrase → premier son reçu ».
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np

BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BRAIN))

SCENARIOS = {
    "simple": "Capri, ça va ?",
    "souvenir": "Capri, tu te souviens de ce que je t'ai dit sur mon projet ?",
    "longue": "Capri, explique-moi en détail comment fonctionne une carte graphique.",
}
INTERRUPT = "Capri, attends, plutôt : il est quelle heure ?"


def speech(text: str) -> bytes:
    """La phrase dite par la voix locale, en PCM 16 kHz comme un micro."""
    from capri_brain.voice import Mouth
    mouth = Mouth({"tts_voice": "ff_siwis", "langue": "fr"}, BRAIN / "models")
    pcm, sr = mouth.speak(text, "neutre")
    a = np.frombuffer(pcm, np.int16).astype(np.float32)
    idx = np.arange(0, len(a), sr / 16000)
    return np.interp(idx, np.arange(len(a)), a).astype(np.int16).tobytes()


class Mic:
    """Comme un vrai micro : un paquet de 32 ms en continu, du silence quand on ne parle pas."""

    def __init__(self, ws):
        self.ws, self.queue = ws, []
        self.task = asyncio.get_running_loop().create_task(self.run())

    async def run(self):
        step, t = 1024, time.perf_counter()
        while True:
            chunk = self.queue.pop(0) if self.queue else b"\0" * step
            await self.ws.send(chunk)
            t += 0.032
            await asyncio.sleep(max(0, t - time.perf_counter()))

    async def say(self, pcm: bytes) -> float:
        """La phrase part au rythme réel ; renvoie l'heure où elle a fini d'être dite."""
        step = 1024
        self.queue += [pcm[i:i + step].ljust(step, b"\0") for i in range(0, len(pcm), step)]
        while self.queue:
            await asyncio.sleep(0.005)
        return time.perf_counter()


async def wait_for(ws, kinds: set[str], timeout: float = 60) -> tuple[str, float, dict]:
    deadline = time.perf_counter() + timeout
    while True:
        msg = await asyncio.wait_for(ws.recv(), max(0.1, deadline - time.perf_counter()))
        if isinstance(msg, bytes):
            continue
        data = json.loads(msg)
        if data.get("type") in kinds:
            return data["type"], time.perf_counter(), data


async def drain(ws, quiet: float = 4.0) -> None:
    """Attend qu'elle ait fini (plus rien pendant `quiet` secondes)."""
    while True:
        try:
            await asyncio.wait_for(ws.recv(), quiet)
        except asyncio.TimeoutError:
            return


async def main() -> None:
    import websockets
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8775)
    ap.add_argument("--runs", type=int, default=3)
    a = ap.parse_args()
    clips = {name: speech(text) for name, text in SCENARIOS.items()}
    interrupt = speech(INTERRUPT)
    results: dict[str, list] = {}
    async with websockets.connect(f"ws://127.0.0.1:{a.port}/ws", max_size=2**24) as ws:
        await ws.send(json.dumps({"type": "config", "name": "bench", "speaker": True}))
        await wait_for(ws, {"hello"})
        mic = Mic(ws)
        import httpx
        for _ in range(60):  # sa voix et son modèle doivent être chargés
            h = httpx.get(f"http://127.0.0.1:{a.port}/api/health").json()
            if h.get("voice") == "prête" and h.get("status") == "prête":
                break
            await asyncio.sleep(2)
        await drain(ws, 3)
        seen = -1  # numéro de la dernière réponse vue : un son d'une ancienne réponse ne compte pas
        for run in range(a.runs):
            for name, pcm in clips.items():
                end = await mic.say(pcm)
                heard = first_text = first_audio = None
                try:
                    while first_audio is None:
                        kind, t, data = await wait_for(ws, {"heard", "delta", "audio", "error"}, 60)
                        if kind == "heard" and data.get("ignored"):
                            print(f"  {name}: ignorée ({data.get('text')!r})")
                            break
                        if kind == "heard":
                            heard = t - end
                        elif kind == "delta" and first_text is None:
                            first_text = t - end
                        elif kind == "audio" and data["id"] > seen:
                            first_audio = t - end
                            seen = data["id"]
                except asyncio.TimeoutError:
                    print(f"  {name}: pas de réponse")
                results.setdefault(name, []).append((heard, first_text, first_audio))
                fmt = lambda v: f"{v*1000:5.0f}" if v is not None else "  -  "
                print(f"run {run} {name:9s} entendue {fmt(heard)} ms | 1er texte {fmt(first_text)} ms | 1er son {fmt(first_audio)} ms")
                if name == "longue" and first_audio is not None:
                    # elle parle : on la coupe
                    await asyncio.sleep(1.5)
                    end = await mic.say(interrupt)
                    stop = new_audio = None
                    try:
                        while new_audio is None:
                            kind, t, data = await wait_for(ws, {"stop_audio", "audio", "duck", "heard"}, 60)
                            if kind == "duck":
                                results.setdefault("baisse_voix_avant_fin", []).append((None, None, t - end))
                            if kind == "stop_audio" and stop is None:
                                stop = t - end
                            if kind == "heard" and data.get("ignored"):
                                print("  interruption ignorée :", data.get("text"))
                                break
                            if kind == "audio" and data["id"] > seen:
                                new_audio = t - end
                                seen = data["id"]
                    except asyncio.TimeoutError:
                        pass
                    results.setdefault("interruption", []).append((stop, None, new_audio))
                    print(f"      interruption : voix coupée {fmt(stop)} ms | nouvelle réponse {fmt(new_audio)} ms")
                await drain(ws)
    print("\nmédiane / pire (ms) — fin de ta phrase → premier son reçu")
    for name, rows in results.items():
        vals = [r[2] for r in rows if r[2] is not None]
        if vals:
            print(f"  {name:22s} {statistics.median(vals)*1000:6.0f} / {max(vals)*1000:6.0f}   (n={len(vals)})")
        stops = [r[0] for r in rows if r[0] is not None and name == "interruption"]
        if stops:
            print(f"  {'voix coupée':22s} {statistics.median(stops)*1000:6.0f} / {max(stops)*1000:6.0f}")


if __name__ == "__main__":
    asyncio.run(main())

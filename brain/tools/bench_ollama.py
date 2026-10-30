"""Mesure la vitesse réelle de son modèle local (Ollama) avec sa vraie personnalité en prompt.

    .venv\\Scripts\\python tools\\bench_ollama.py            (modèle et num_ctx de config.toml)
    .venv\\Scripts\\python tools\\bench_ollama.py --ctx 4096

Affiche : chargement, lecture du prompt (froid / préfixe en cache), premier token, tokens/s,
et la part du modèle réellement sur la carte graphique (sinon tout est lent).
Ne touche ni à sa mémoire ni à ses réglages.
"""

import argparse
import json
import statistics
import sys
import time
import tomllib
from pathlib import Path

import httpx

BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BRAIN))
from capri_brain.persona import build_system_prompt  # noqa: E402

QUESTIONS = ["Ça va ?", "Tu fais quoi ce soir ?", "Explique-moi en deux phrases ce qu'est un GPU.",
             "Tu te souviens de mon jeu préféré ?", "Raconte-moi une blague courte."]


def run(http: httpx.Client, url: str, body: dict) -> dict:
    t0 = time.perf_counter()
    first = None
    with http.stream("POST", f"{url}/api/chat", json=body) as r:
        for line in r.iter_lines():
            if not line:
                continue
            data = json.loads(line)
            if first is None and data.get("message", {}).get("content"):
                first = time.perf_counter() - t0
            if data.get("done"):
                return {"wall": time.perf_counter() - t0, "ttft": first or 0.0,
                        "load": data.get("load_duration", 0) / 1e9,
                        "prompt_n": data.get("prompt_eval_count", 0), "prompt_s": data.get("prompt_eval_duration", 0) / 1e9,
                        "gen_n": data.get("eval_count", 0), "gen_s": data.get("eval_duration", 1) / 1e9}
    raise RuntimeError("pas de fin de réponse")


def main() -> None:
    cfg = tomllib.loads((BRAIN / "config.toml").read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=cfg["llm"]["ollama"]["model"])
    ap.add_argument("--ctx", type=int, default=cfg["llm"]["ollama"]["num_ctx"])
    ap.add_argument("--url", default=cfg["llm"]["ollama"]["url"])
    a = ap.parse_args()
    system = build_system_prompt((BRAIN.parent / "capri.txt").read_text(encoding="utf-8"), voice=True, name="", lang="fr")
    http = httpx.Client(timeout=600)
    base = {"model": a.model, "stream": True, "think": False, "keep_alive": "10m",
            "options": {"num_ctx": a.ctx, "temperature": 0.65, "num_predict": 120}}

    rows = []
    for i, q in enumerate(QUESTIONS):
        res = run(http, a.url, {**base, "messages": [{"role": "system", "content": system}, {"role": "user", "content": q}]})
        rows.append(res)
        print(f"{i}: ttft {res['ttft']*1000:6.0f} ms | prompt {res['prompt_n']:5d} tok en {res['prompt_s']*1000:6.0f} ms "
              f"| {res['gen_n']:3d} tok à {res['gen_n']/max(res['gen_s'],1e-6):5.1f} tok/s | chargement {res['load']:.2f} s")
        if i == 1:
            # un autre prompt entre deux (comme le module d'actions) : le cache du préfixe survit-il ?
            run(http, a.url, {**base, "messages": [{"role": "user", "content": "Réponds juste: ok"}]})
    ps = http.get(f"{a.url}/api/ps").json().get("models", [])
    for m in ps:
        gpu = m.get("size_vram", 0) / max(m.get("size", 1), 1)
        print(f"\n{m['name']}: {m['size']/2**30:.2f} Go dont {gpu*100:.0f} % sur la carte graphique, contexte {m.get('context_length')}")
    warm = rows[1:]
    print(f"\nmédiane ttft (chaud) : {statistics.median(r['ttft'] for r in warm)*1000:.0f} ms ; "
          f"vitesse : {statistics.median(r['gen_n']/max(r['gen_s'],1e-6) for r in warm):.1f} tok/s")


if __name__ == "__main__":
    main()

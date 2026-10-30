"""Mesure de la réactivité de Capri, étape par étape, pour savoir ce qui la ralentit vraiment.

Chaque échange a une chronologie (secondes depuis la fin de ta phrase) :
    fin_parole → transcrit → contexte → modele_envoye → premier_token → premiere_phrase
    → premier_son_pret → premier_son_joue → fin_generation
On garde les 300 derniers échanges en mémoire et dans data/perf.jsonl (seulement des durées
et des tailles : jamais le texte de vos conversations).
"""

import json
import logging
import statistics
import subprocess
import threading
import time
from collections import deque
from pathlib import Path

log = logging.getLogger("capri")

# ordre d'affichage des étapes
STAGES = ["transcrit", "contexte", "modele_envoye", "premier_token", "premiere_phrase",
          "premier_son_pret", "premier_son_joue", "fin_generation"]


class Turn:
    """La chronologie d'un échange. `t0` = fin de ta phrase (ou envoi du message écrit)."""

    def __init__(self, kind: str, t0: float | None = None):
        self.kind = kind  # "voix", "texte", "initiative"
        self.t0 = t0 or time.perf_counter()
        self.marks: dict[str, float] = {}
        self.info: dict = {}

    def mark(self, stage: str) -> None:
        self.marks.setdefault(stage, time.perf_counter() - self.t0)

    def as_dict(self) -> dict:
        return {"ts": time.time(), "kind": self.kind, **{k: round(v * 1000) for k, v in self.marks.items()}, **self.info}


class Perf:
    def __init__(self, path: Path):
        self.path = path
        self.turns: deque[dict] = deque(maxlen=300)
        self.system: deque[dict] = deque(maxlen=120)  # mémoire, processeur, carte graphique
        try:
            for line in path.read_text(encoding="utf-8").splitlines()[-300:]:
                self.turns.append(json.loads(line))
        except (OSError, json.JSONDecodeError):
            pass
        self._sampling = False

    def finish(self, turn: Turn | None) -> None:
        if turn is None or "fini" in turn.info:
            return
        turn.info["fini"] = True
        row = turn.as_dict()
        self.turns.append(row)
        parts = " · ".join(f"{k} {row[k]}" for k in STAGES if k in row)
        log.info("Réactivité (%s, ms depuis la fin de ta phrase) : %s", turn.kind, parts)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            if self.path.stat().st_size > 2_000_000:  # on ne garde que la fin
                lines = self.path.read_text(encoding="utf-8").splitlines()[-300:]
                self.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        except OSError:
            pass

    def stats(self, kind: str | None = None, last: int = 100) -> dict:
        """Médiane et 95e centile de chaque étape sur les derniers échanges."""
        rows = [r for r in self.turns if kind is None or r.get("kind") == kind][-last:]
        out = {}
        for stage in STAGES + ["stt_ms", "tok_s", "prompt_ms", "rappel_ms"]:
            values = sorted(r[stage] for r in rows if isinstance(r.get(stage), (int, float)))
            if values:
                out[stage] = {"n": len(values), "mediane": round(statistics.median(values), 1),
                              "p95": round(values[min(len(values) - 1, int(len(values) * 0.95))], 1)}
        return out

    # --- ressources de la machine ------------------------------------------------

    def sample_system(self) -> dict:
        """Mémoire vive, processeur, et carte graphique (via nvidia-smi s'il est là)."""
        import psutil
        row = {"ts": time.time(), "cpu": psutil.cpu_percent(None), "ram_go": round(psutil.virtual_memory().used / 2**30, 2),
               "cerveau_ram_mo": round(psutil.Process().memory_info().rss / 2**20)}
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used,memory.total,utilization.gpu",
                                  "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=3,
                                 creationflags=0x08000000).stdout.strip().split(",")
            row.update({"vram_mo": int(out[0]), "vram_total_mo": int(out[1]), "gpu": int(out[2])})
        except Exception:
            pass
        self.system.append(row)
        return row

    def start_sampling(self, every: float = 30.0) -> None:
        """Un relevé toutes les `every` secondes, dans un fil à part (rien de lourd)."""
        if self._sampling:
            return
        self._sampling = True

        def loop():
            while True:
                try:
                    row = self.sample_system()
                    # la carte graphique presque pleine : Windows déborde sur la mémoire vive et tout devient 4× plus lent
                    if row.get("vram_total_mo") and row["vram_mo"] > row["vram_total_mo"] * 0.94:
                        log.warning("Carte graphique presque pleine (%s / %s Mo) : risque de lenteur", row["vram_mo"], row["vram_total_mo"])
                except Exception:
                    pass
                time.sleep(every)

        threading.Thread(target=loop, daemon=True, name="perf").start()

    def summary(self) -> dict:
        sys_rows = list(self.system)
        resources = {}
        for key in ("vram_mo", "ram_go", "cpu", "gpu", "cerveau_ram_mo"):
            vals = [r[key] for r in sys_rows if key in r]
            if vals:
                resources[key] = {"moyenne": round(sum(vals) / len(vals), 1), "max": max(vals), "dernier": vals[-1]}
        return {"voix": self.stats("voix"), "texte": self.stats("texte"), "tous": self.stats(),
                "ressources": resources, "derniers": list(self.turns)[-15:]}

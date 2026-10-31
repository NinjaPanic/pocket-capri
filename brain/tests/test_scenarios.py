"""Tests des petites scènes rares : délais, jamais deux fois de suite, dates qui comptent une seule fois."""

import random
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain import scenarios  # noqa: E402

CTX = {"memory": "il prépare un examen", "app": "Spotify", "days": 12}


class ScenesTest(unittest.TestCase):
    def setUp(self):
        random.seed(1)

    def test_rare(self):
        picks = sum(scenarios.pick({}, CTX, 0.0) is not None for _ in range(2000))
        self.assertTrue(200 < picks < 500, picks)  # ~15 % des occasions quand elle est discrète

    def test_cooldown_and_no_repeat(self):
        state = {}
        for name in scenarios.SCENES:
            if name != "anniversaire":
                scenarios.mark(state, name, CTX)
        self.assertTrue(all(scenarios.pick(state, CTX, 1.0) is None for _ in range(200)), "toutes en délai : rien")
        state = {"scenes": {}, "last_scene": "copies"}
        names = {p[0] for p in (scenarios.pick(state, CTX, 1.0) for _ in range(500)) if p}
        self.assertNotIn("copies", names)

    def test_needs(self):
        names = {p[0] for p in (scenarios.pick({}, {"memory": "", "app": "", "days": 3}, 1.0) for _ in range(500)) if p}
        self.assertNotIn("souvenir_ancien", names)
        self.assertNotIn("observe_fenetre", names)

    def test_milestone_once(self):
        state = {}
        ctx = {**CTX, "days": 30}
        self.assertEqual(scenarios.pick(state, ctx, 0.0)[0], "anniversaire")  # passe toujours, même discrète
        scenarios.mark(state, "anniversaire", ctx)
        self.assertTrue(all((p is None or p[0] != "anniversaire") for p in (scenarios.pick(state, ctx, 1.0) for _ in range(300))))

    def test_steps_are_valid(self):
        for name, scene in scenarios.SCENES.items():
            for step in scene["steps"]:
                self.assertIn(step[0], {"glitch", "geste", "pause", "dit", "demande", "voler", "effet"}, name)
                if step[0] in ("dit", "demande"):
                    step[1].format(**CTX)  # aucune variable manquante


if __name__ == "__main__":
    unittest.main()

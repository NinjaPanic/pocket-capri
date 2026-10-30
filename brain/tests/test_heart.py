"""Tests de ses émotions et de votre relation (data/coeur.json, ici dans un dossier jetable)."""

import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain.heart import EMOTIONS, Heart  # noqa: E402


class HeartTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "coeur.json"

    def tearDown(self):
        self.dir.cleanup()

    def test_emotion_has_a_cause_and_shows(self):
        h = Heart(self.path)
        h.feel("clics")
        self.assertEqual(h.face(), "irritation")
        self.assertIn("agacée", h.describe())
        self.assertIn("cliquée dessus", h.describe())

    def test_emotions_settle_back(self):
        h = Heart(self.path)
        h.feel("lancee")
        h.state["updated"] -= 3600  # une heure plus tard
        h.decay()
        self.assertAlmostEqual(h.state["emotions"]["surprise"], EMOTIONS["surprise"][0], places=2)
        self.assertNotEqual(h.face(), "surprise")

    def test_persists_across_restarts(self):
        h = Heart(self.path)
        h.feel("caresse")
        h.grow("complicite", 0.1)
        again = Heart(self.path)
        self.assertGreater(again.state["emotions"]["tendresse"], EMOTIONS["tendresse"][0] + 0.2)
        self.assertAlmostEqual(again.state["relation"]["complicite"], 0.3, places=2)

    def test_no_random_changes(self):
        """Sans cause, rien ne bouge : deux lectures de suite donnent le même état."""
        h = Heart(self.path)
        first = h.summary()["emotions"]
        self.assertEqual(first, h.summary()["emotions"])
        self.assertEqual(h.describe(), Heart(self.path).describe())

    def test_jealousy_setting(self):
        calm = Heart(self.path, {"jalousie": 0.0})
        calm.feel("jeu_lance")
        jealous = Heart(Path(self.dir.name) / "b.json", {"jalousie": 1.0})
        jealous.feel("jeu_lance")
        self.assertLess(calm.state["emotions"]["jalousie"], jealous.state["emotions"]["jalousie"])

    def test_talk_factor(self):
        bored = Heart(self.path)
        bored.feel("silence_long", 3)
        annoyed = Heart(Path(self.dir.name) / "b.json")
        annoyed.feel("clics", 2)
        self.assertLess(bored.talk_factor(), 1.0, "elle s'ennuie : elle vient plus tôt")
        self.assertGreater(annoyed.talk_factor(), 1.0, "agacée : elle se fait rare")

    def test_relation_text_and_hours(self):
        h = Heart(self.path)
        h.state["heures"][21] = 40
        h.state["heures"][14] = 2
        self.assertIn("21 h", h.relation_text())
        h.state["last_seen_day"] = ""
        before = h.state["relation"]["habitude"]
        h.talked()
        h.talked()
        self.assertAlmostEqual(h.state["relation"]["habitude"], before + 0.03, places=3)  # une fois par jour


if __name__ == "__main__":
    unittest.main()

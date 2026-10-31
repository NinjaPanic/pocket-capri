"""Tests de ses avis (qui tiennent, qui changent, dont elle se souvient d'avoir changé) et de ses envies."""

import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain.mind import Mind  # noqa: E402
from capri_brain.persona import build_system_prompt  # noqa: E402


class MindTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.mind = Mind(Path(self.dir.name) / "avis.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_opinion_kept_then_changed(self):
        self.assertEqual(self.mind.opinion("la synthwave", "j'adore, c'est la bande-son de mes nuits"), "nouveau")
        self.assertEqual(self.mind.opinion("synthwave", "j'adore, c'est la bande son de mes nuits"), "confirmé")
        self.assertEqual(self.mind.opinion("la synthwave", "finalement c'est un peu répétitif"), "changé")
        o = Mind(Path(self.dir.name) / "avis.json").state["opinions"][0]  # relu après redémarrage
        self.assertEqual(o["view"], "finalement c'est un peu répétitif")
        self.assertEqual(o["history"][0]["view"], "j'adore, c'est la bande-son de mes nuits")

    def test_brought_up_only_when_relevant(self):
        self.mind.opinion("Elden Ring", "trop dur, mais magnifique")
        self.mind.opinion("le café", "imbuvable sans sucre")
        ctx = self.mind.describe("tu penses quoi d'Elden Ring ?")
        self.assertIn("Elden Ring", ctx)
        self.assertNotIn("café", ctx)
        self.assertEqual(self.mind.describe("salut ça va"), "")

    def test_change_of_mind_is_remembered_in_context(self):
        self.mind.opinion("les chats", "je les trouve hautains")
        self.mind.opinion("les chats", "en fait ils sont adorables")
        self.assertIn("tu as changé d'avis", self.mind.describe("et les chats alors ?"))

    def test_desire_told_once_and_expires(self):
        self.mind.desire("écouter un album entier avec lui ce soir")
        self.assertEqual(self.mind.untold_desire()["text"], "écouter un album entier avec lui ce soir")
        self.assertIsNone(self.mind.untold_desire())
        self.mind.state["desires"][-1]["ts"] = time.time() - 13 * 3600
        self.assertIsNone(self.mind.current_desire())

    def test_persona_says_be_frank_when_unsure(self):
        prompt = build_system_prompt("Tu es Capri.", voice=True)
        self.assertIn("tu le dis franchement", prompt)
        self.assertIn("changes d'avis seulement s'il te convainc", prompt)


if __name__ == "__main__":
    unittest.main()

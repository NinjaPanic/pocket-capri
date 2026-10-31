"""Tests de sa curiosité (sans réseau : la lecture Wikipédia est simulée)."""

import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain.curiosity import Curiosity  # noqa: E402

PAGE = {"title": "Synthwave", "text": "x" * 300, "url": "https://fr.wikipedia.org/wiki/Synthwave"}


class CuriosityTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.c = Curiosity(Path(self.dir.name) / "d.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_daily_limit_counts_failures_too(self):
        self.assertTrue(self.c.can_explore(2))
        self.c.add("synthwave", "un de tes goûts", PAGE, "Résumé.", 4)
        self.c.count_attempt()  # une page introuvable compte aussi
        self.assertFalse(self.c.can_explore(2))
        self.assertFalse(self.c.can_explore(0), "0 = jamais")

    def test_his_topics_come_first(self):
        self.c.propose("les volcans")
        self.assertEqual(self.c.pick_topic([]), ("les volcans", "il te l'a proposé"))
        self.assertNotEqual(self.c.pick_topic([])[1], "il te l'a proposé")

    def test_share_best_once_with_source(self):
        self.c.add("a", "x", PAGE, "Bof.", 2)
        self.assertIsNone(self.c.unshared(), "un sujet qui l'a peu intéressée n'est pas partagé")
        self.c.add("b", "x", PAGE, "Génial.", 5)
        best = self.c.unshared()
        self.assertEqual(best["summary"], "Génial.")
        self.assertEqual(best["sources"], [PAGE["url"]])
        self.assertIsNone(self.c.unshared())
        self.assertEqual(len(Curiosity(Path(self.dir.name) / "d.json").summary()["discoveries"]), 2)

    def test_old_discoveries_are_not_shared(self):
        item = self.c.add("a", "x", PAGE, "Vieux.", 5)
        item["ts"] = time.time() - 5 * 86400
        self.assertIsNone(self.c.unshared())


if __name__ == "__main__":
    unittest.main()

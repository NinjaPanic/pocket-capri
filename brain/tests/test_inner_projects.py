"""Tests des activités (durée, interruption, reprise) et des projets personnels."""

import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain.inner import InnerLife  # noqa: E402


class InnerTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.inner = InnerLife(Path(self.dir.name) / "vie.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_activity_progress_and_resume_after_interruption(self):
        first = self.inner.pick_activity()
        self.inner.state["since"] = time.time() - self.inner.state["duration"] / 2  # à moitié
        self.assertAlmostEqual(self.inner.progress(), 0.5, places=1)
        self.inner.talked()  # il lui parle : elle met son activité de côté
        self.assertEqual(self.inner.state["interrupted"]["activity"], first)
        self.assertEqual(self.inner.pick_activity(), first)  # et la reprend où elle en était
        self.assertAlmostEqual(self.inner.progress(), 0.5, places=1)
        self.assertIsNone(self.inner.state["interrupted"])

    def test_project_lifecycle(self):
        p = self.inner.add_project("Collection de glitchs", "Rassembler mes glitchs préférés", ["lister", "trier", "conclure"], "elle")
        self.assertEqual(self.inner.active_projects(), [p])
        self.inner.advance_project(p, "J'ai listé mes idées.")
        self.inner.advance_project(p, "J'ai trié.")
        self.assertIsNone(self.inner.unshared_project())
        self.inner.advance_project(p, "Fini.", "Mon top 3 des glitchs.")
        self.assertEqual(p["status"], "terminé")
        self.assertEqual(self.inner.unshared_project()["result"], "Mon top 3 des glitchs.")
        self.assertIsNone(self.inner.unshared_project(), "partagé une seule fois")
        self.assertEqual(self.inner.state["moments"][-1]["kind"], "projet")
        again = InnerLife(Path(self.dir.name) / "vie.json")
        self.assertEqual(again.summary()["projects"][0]["status"], "terminé")


if __name__ == "__main__":
    unittest.main()

"""Tests de sa mémoire à long terme : résumés de vos journées (base jetable)."""

import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain.memory import Memory  # noqa: E402


class SummariesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.mem = Memory(Path(self.dir.name) / "t.db")

    def tearDown(self):
        self.mem.db.close()
        self.dir.cleanup()

    def add(self, when: datetime, role: str, text: str):
        with self.mem.db:
            self.mem.db.execute("INSERT INTO messages (ts, role, content, mood, client) VALUES (?, ?, ?, NULL, 't')",
                                (when.timestamp(), role, text))

    def test_past_days_only_once(self):
        yesterday = datetime.now() - timedelta(days=1)
        self.add(yesterday, "user", "J'ai un examen demain")
        self.add(yesterday, "assistant", "Courage !")
        self.add(datetime.now(), "user", "Salut")  # aujourd'hui : pas encore résumé (la journée n'est pas finie)
        day = yesterday.strftime("%Y-%m-%d")
        self.assertEqual(self.mem.days_to_summarize(), [day])
        self.assertEqual([m["content"] for m in self.mem.messages_of_day(day)], ["J'ai un examen demain", "Courage !"])
        self.mem.add_summary(day, "Il m'a parlé de son examen.", [1.0, 0.0, 0.0])
        self.assertEqual(self.mem.days_to_summarize(), [])
        self.assertEqual(self.mem.summary_of(day), "Il m'a parlé de son examen.")

    def test_search_finds_similar_day(self):
        self.mem.add_summary("2026-10-01", "On a parlé de musique.", [1.0, 0.0, 0.0])
        self.mem.add_summary("2026-10-02", "On a parlé de son travail.", [0.0, 1.0, 0.0])
        found = self.mem.search_summaries([0.9, 0.1, 0.0], k=1)
        self.assertEqual(found[0]["day"], "2026-10-01")
        self.assertEqual(self.mem.search_summaries([0.0, 0.0, 1.0]), [], "rien de ressemblant : rien")


if __name__ == "__main__":
    unittest.main()

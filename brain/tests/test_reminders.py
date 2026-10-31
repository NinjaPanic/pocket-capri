"""Tests des rappels (fichier jetable)."""

import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain import actions, reminders  # noqa: E402


class RemindersTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        reminders.PATH = Path(self.dir.name) / "rappels.json"

    def tearDown(self):
        self.dir.cleanup()

    def test_create_in_minutes_and_ring_once(self):
        out = actions.run("creer_rappel", {"texte": "appeler maman", "dans_minutes": 20})
        self.assertIn("appeler maman", out)
        self.assertEqual(reminders.due(), [])
        item = reminders.due(time.time() + 21 * 60)[0]
        reminders.fired(item)
        self.assertEqual(reminders.upcoming(), [])
        self.assertEqual(reminders.history()[0]["texte"], "appeler maman")

    def test_hour_in_the_past_means_tomorrow(self):
        now = datetime(2026, 10, 31, 9, 30)
        at = reminders._when(heure="08:00", now=now)
        self.assertEqual(at, datetime(2026, 11, 1, 8, 0))
        self.assertEqual(reminders._when(heure="18h", now=now), datetime(2026, 10, 31, 18, 0))
        self.assertEqual(reminders._when(heure="18:15", jour="demain", now=now), datetime(2026, 11, 1, 18, 15))

    def test_daily_repeats_and_skips_missed_days(self):
        reminders.creer("médicaments", heure="09:00", repetition="quotidienne")
        item = reminders.upcoming()[0]
        item["due"] = time.time() - 3 * 86400  # PC éteint trois jours
        reminders.fired(item)
        nxt = reminders.upcoming()[0]
        self.assertGreater(nxt["due"], time.time())
        self.assertLess(nxt["due"], time.time() + 86400 + 60)

    def test_weekdays_skip_weekend(self):
        friday = datetime(2026, 10, 30, 9, 0).timestamp()
        self.assertEqual(datetime.fromtimestamp(reminders._next(friday, "semaine")).weekday(), 0)

    def test_cancel_and_snooze(self):
        reminders.creer("sortir le chien", dans_minutes=5)
        self.assertIn("Annulé", actions.run("annuler_rappel", {"texte": "chien"}))
        self.assertEqual(reminders.upcoming(), [])
        reminders.creer("pause", dans_minutes=1)
        reminders.fired(reminders.upcoming()[0])
        self.assertIn("Reporté", actions.run("reporter_rappel", {"minutes": 10}))
        self.assertEqual(reminders.upcoming()[0]["texte"], "pause")

    def test_voice_hint_reaches_planner(self):
        self.assertTrue(actions.HINT.search(actions.plain("rappelle-moi d'appeler maman dans 20 minutes")))
        self.assertTrue(actions.HINT.search(actions.plain("remind me to stretch at 5")))

    def test_bad_time(self):
        self.assertTrue(reminders.creer("x").startswith("ÉCHEC"))


if __name__ == "__main__":
    unittest.main()

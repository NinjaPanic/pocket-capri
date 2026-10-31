"""Tests de son envie de le connaître : ce qu'elle sait de sa vie, ce qu'elle va lui demander."""

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain import knowing  # noqa: E402

MEMS = ["L'utilisateur aime les jeux de rallye.", "L'utilisateur a un ami qui s'appelle Mathoste.",
        "L'utilisateur travaille comme développeur."]


class KnowingTest(unittest.TestCase):
    def test_known_topics_are_not_asked(self):
        missing = knowing.unknown(MEMS, "", {})
        self.assertNotIn("jeux", missing)
        self.assertNotIn("travail", missing)
        self.assertIn("prenom", missing, "« un ami qui s'appelle… » ne lui apprend pas SON prénom")
        self.assertNotIn("prenom", knowing.unknown(MEMS, "Quentin", {}))

    def test_name_first_then_no_repeat_for_two_days(self):
        key, prompt = knowing.pick_question(MEMS, "", {})
        self.assertEqual(key, "prenom")
        self.assertIn("une seule question", prompt)
        asked = {k: time.time() for k in knowing.TOPICS}
        self.assertIsNone(knowing.pick_question(MEMS, "", asked))
        self.assertEqual(knowing.hint(MEMS, "", asked), "")

    def test_hint_names_real_gaps(self):
        hint = knowing.hint(MEMS, "Quentin", {})
        self.assertIn("UNE", hint)
        self.assertNotIn("ses jeux préférés", hint)


if __name__ == "__main__":
    unittest.main()

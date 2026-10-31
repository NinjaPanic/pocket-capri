"""Ses tics : une phrase déjà dite dans ses dernières réponses n'est ni redite, ni laissée dans l'historique.
Cas réel du 31 octobre (« J'ai juste tapé "test" — c'est bon ! Je suis assise sur ton bureau, j'écoute. »)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain import actions  # noqa: E402
from capri_brain.persona import QuestionGate, has_tic, repeated_sentences, tic_phrases  # noqa: E402

PAST = ["J’ai juste tapé “test” — c’est bon! Je suis assise sur ton bureau, j’écoute.",
        "Ah bon? J’ai juste tapé “test” — c’est bon! Je suis assise sur ton bureau, j’écoute.",
        "Tu sais quoi? J’ai déjà fait “test” dans le chat avec Mathoste… et j’écoute ton silence depuis 12 minutes."]


class RepetitionTest(unittest.TestCase):
    def test_tics_found(self):
        tics = repeated_sentences(PAST)
        self.assertTrue(any("assise sur ton bureau" in t for t in tics))
        self.assertFalse(repeated_sentences(["Salut toi, ça va ?", "Bon, je file regarder ta musique."]))

    def test_repeated_sentence_dropped_rest_kept(self):
        g = QuestionGate(True, already_said=PAST)
        out = g.feed("J’ai déjà fait “test” dans le chat avec Mathoste… et j’écoute ton silence depuis 13 minutes. "
                     "Bon, je vais faire une sieste. ") + g.flush()
        self.assertEqual(out.strip(), "Bon, je vais faire une sieste.")
        self.assertGreater(g.dropped, 0)

    def test_short_words_are_not_tics(self):
        g = QuestionGate(True, already_said=["Ah bon ? Ok. Merci."])
        self.assertEqual((g.feed("Ah bon ? ") + g.flush()).strip(), "Ah bon ?")

    def test_word_tics(self):
        """Cas réel (batterie du 31/10) : « glitch-musique », « faire exploser » dans presque chaque réponse."""
        replies = ["Un glitch-musique spécial pour les jours comme ça, je vais le faire exploser dans ton bureau.",
                   "Je suis plus drôle parce que je peux faire exploser des glitch-musiques.",
                   "Oui, j'ai encore le glitch-musique dans les oreilles.",
                   "Chats, et j'ai un glitch-musique qui fait NOVA quand un chien aboie, ça va exploser."]
        tics = tic_phrases(replies)
        self.assertTrue(any("glitch-musique" in t for t in tics), tics)
        self.assertFalse(any(t in ("dans", "pour", "chien") for t in tics), tics)
        self.assertFalse(has_tic("Rien à voir.", tics))

    def test_liked_songs_reach_the_planner(self):
        self.assertTrue(actions.HINT.search(actions.plain("Capri, tu peux aller dans mes titres likés ?")))
        self.assertIn("titres_likes", actions.TOOLS["controler_appli"].description)


if __name__ == "__main__":
    unittest.main()

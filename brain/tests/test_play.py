"""« On fait un mini-jeu ? » : elle propose ses vrais jeux, choisit quand il la laisse faire, relance pour une revanche."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain import server  # noqa: E402

Capri = next(getattr(server, n) for n in dir(server) if hasattr(getattr(server, n), "_game_choice"))


class FakeMemory:
    def __init__(self, last: str):
        self.last = last

    def recent_messages(self, n):
        return [{"role": "user", "content": "…"}, {"role": "assistant", "content": self.last}]


def choice(last: str, text: str):
    me = type("Me", (), {})()
    me.memory = FakeMemory(last)
    return Capri._game_choice(me, text)


class PlayTest(unittest.TestCase):
    def test_play_ask(self):
        for t in ["Capri, on peut faire un mini-jeu ?", "tu veux jouer ?", "play a game?"]:
            self.assertTrue(server.PLAY_ASK.search(t), t)
        for t in ["je joue à Valorant ce soir", "j'ai de bons réflexes"]:
            self.assertFalse(server.PLAY_ASK.search(t), t)

    def test_she_picks_when_asked(self):
        offered = "Cache-cache, ou réflexes ? Moi je dis cache-cache."
        self.assertIn(choice(offered, "lequel tu préfères toi ?"), {"game_hide", "game_reflex"})
        self.assertIn(choice(offered, "vas-y choisis"), {"game_hide", "game_reflex"})
        self.assertIsNone(choice(offered, "Golf ce soir"))
        self.assertIsNone(choice("On a parlé de musique.", "lequel tu préfères ?"))

    def test_rematch_same_game(self):
        self.assertEqual(choice("Trouvée en 12 s ! Bien joué au cache-cache.", "on rejoue ?"), "game_hide")
        self.assertEqual(choice("5/8 aux réflexes. Pas mal.", "revanche !"), "game_reflex")


if __name__ == "__main__":
    unittest.main()

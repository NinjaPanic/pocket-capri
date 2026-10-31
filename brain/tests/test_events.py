"""Tests du moteur d'événements (ce qu'elle sent sur le PC) et de la reconnaissance des jeux."""

import asyncio
import os
import sys
import tempfile
import time
import unittest
from collections import deque
from pathlib import Path

BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BRAIN))
os.environ.setdefault("CAPRI_DATA", tempfile.mkdtemp(prefix="capri-test-"))

from capri_brain import actions, server  # noqa: E402
from capri_brain.senses import Event, game_name  # noqa: E402


class FakeProc:
    def __init__(self, name, exe):
        self._name, self._exe = name, exe

    def name(self):
        return self._name

    def exe(self):
        return self._exe


def fake_capri():
    c = server.Capri.__new__(server.Capri)
    c.events, c.last_reaction, c.last_spoken_event = deque(), {}, 0.0
    c.clients = {"ws": object()}
    c.voice_cfg, c.cfg, c.voice, c.system = {"langue": "fr"}, {"vie": {"liberer_gpu_en_jeu": False}}, None, ""
    c.lock = asyncio.Lock()
    c.sent, c.said = [], []
    from capri_brain.heart import Heart
    c.heart = Heart(Path(tempfile.mkdtemp(prefix="capri-test-")) / "coeur.json")
    from capri_brain.inner import InnerLife
    c.inner = InnerLife(Path(tempfile.mkdtemp(prefix="capri-test-")) / "vie.json")

    async def broadcast(msg, speakers_only=False):
        c.sent.append(msg)

    async def initiate(event):
        c.said.append(event)
        return True

    c.broadcast, c.initiate = broadcast, initiate
    c.spawn = lambda coro: asyncio.get_running_loop().create_task(coro)
    c.llm = type("L", (), {"ensure_loaded": staticmethod(lambda s: asyncio.sleep(0)), "unload": staticmethod(lambda: asyncio.sleep(0))})()
    return c


class EventEngineTest(unittest.TestCase):
    def setUp(self):
        actions.QUIET_UNTIL = 0.0
        server.life.busy = lambda: False

    def run_engine(self, c):
        async def go():
            await c.react_to_events()
            await asyncio.sleep(0.01)
        asyncio.run(go())

    def test_body_reaction_and_cooldown(self):
        c = fake_capri()
        c.events.append(Event("reseau_perdu"))
        self.run_engine(c)
        self.assertEqual([m["type"] for m in c.sent], ["notice"])
        c.events.append(Event("reseau_perdu"))
        self.run_engine(c)
        self.assertEqual(len(c.sent), 1, "le même événement juste après : pas de deuxième réaction")

    def test_quiet_mode_silences_everything(self):
        c = fake_capri()
        actions.QUIET_UNTIL = time.time() + 60
        c.events.extend([Event("reseau_perdu"), Event("longue_session", {"heures": 3})])
        self.run_engine(c)
        self.assertEqual(c.sent, [])
        self.assertEqual(c.said, [])

    def test_stale_events_are_dropped(self):
        c = fake_capri()
        c.events.append(Event("reseau_perdu", ts=time.time() - 3600))
        self.run_engine(c)
        self.assertEqual(c.sent, [])

    def test_waits_while_talking(self):
        c = fake_capri()

        async def go():
            async with c.lock:  # il lui parle
                c.events.append(Event("reseau_revenu"))
                await c.react_to_events()
                self.assertEqual(c.sent, [])
            await c.react_to_events()  # juste après : elle y repense
        asyncio.run(go())
        self.assertEqual([m["type"] for m in c.sent], ["notice"])

    def test_game_flow(self):
        c = fake_capri()
        c.events.append(Event("jeu_lance", {"jeu": "drivetogether"}))
        self.run_engine(c)
        self.assertIn({"type": "discreet", "on": True}, c.sent)
        c.events.append(Event("jeu_ferme", {"jeu": "drivetogether", "minutes": 45}, 3, ttl=3600))
        self.run_engine(c)
        self.assertIn({"type": "discreet", "on": False}, c.sent)
        self.assertEqual(len(c.said), 1, "après une vraie partie elle demande comment c'était")
        self.assertIn("drivetogether", c.said[0])
        self.assertEqual(c.inner.state["moments"][-1]["kind"], "jeu", "la partie entre dans votre histoire")

    def test_spoken_reactions_are_spaced(self):
        c = fake_capri()
        c.events.append(Event("longue_session", {"heures": 2.5}))
        c.events.append(Event("jeu_ferme", {"jeu": "x", "minutes": 30}, 3, ttl=3600))
        self.run_engine(c)
        self.assertEqual(len(c.said), 1, "au plus une prise de parole spontanée toutes les 4 minutes")


class GameNameTest(unittest.TestCase):
    def test_detection(self):
        self.assertEqual(game_name(FakeProc("DriveTogether-Win64-Shipping.exe",
                                            r"C:\Users\Q\Downloads\Drive\DriveTogether\Binaries\Win64\DriveTogether-Win64-Shipping.exe")),
                         "drivetogether")
        self.assertEqual(game_name(FakeProc("eldenring.exe", r"D:\Steam\steamapps\common\ELDEN RING\Game\eldenring.exe")), "elden ring")
        self.assertIsNone(game_name(FakeProc("brave.exe", r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe")))
        self.assertIsNone(game_name(FakeProc("wallpaper32.exe", r"C:\Steam\steamapps\common\wallpaper_engine\wallpaper32.exe")))
        self.assertIsNone(game_name(FakeProc("steam.exe", r"C:\Steam\steam.exe")))


if __name__ == "__main__":
    unittest.main()

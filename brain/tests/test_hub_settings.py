"""Chaque réglage du hub est-il vraiment branché ? On le change par la même route que le hub (PUT /api/reglages)
et on vérifie que l'objet que lit son code (voix, vie, mains, personnalité) a changé, sans redémarrage.
Dossier de données jetable : jamais sa vraie mémoire."""

import asyncio
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BRAIN))
os.environ.setdefault("CAPRI_DATA", tempfile.mkdtemp(prefix="capri-test-"))

from capri_brain import actions, server  # noqa: E402


class FakeRequest:
    def __init__(self, data):
        self.data = data

    async def json(self):
        return self.data


def put(section, key, value):
    resp = asyncio.run(server.put_settings(FakeRequest({"section": section, "key": key, "value": value})))
    return getattr(resp, "status_code", 200)


class HubSettingsTest(unittest.TestCase):
    def test_every_hub_field_is_wired_live(self):
        hub = (BRAIN / "capri_brain" / "static" / "hub.js").read_text(encoding="utf-8")
        block = hub[hub.index("const SETTINGS"):]
        block = block[:block.index("];\n")]
        sections = re.findall(r'\[\s*"[^"]+",\s*"[^"]*",\s*"(\w+)",\s*\[(.*?)\]\],', block, re.S)
        capri = server.capri
        # ce que lit vraiment son code, section par section
        live = {"vie": lambda: capri.cfg["vie"], "voix": lambda: capri.voice_cfg, "mains": lambda: actions.SETTINGS,
                "personnalite": lambda: capri.heart.settings}
        checked = 0
        for section, fields in sections:
            for key, kind in re.findall(r'\["([\w.]+)",\s*"[^"]*",\s*"[^"]*",\s*"(\w+)"', fields):
                if section == "avatar":
                    self.assertIn(key, server.AVATAR_KEYS, f"{key} : le hub l'envoie, le cerveau le refuse")
                    continue
                value = {"bool": False, "number": 3, "range": 0.35}[kind]
                self.assertEqual(put(section, key, value), 200, f"{section}.{key} refusé")
                self.assertEqual(live[section]()[key], value, f"{section}.{key} enregistré mais pas appliqué")
                checked += 1
        self.assertGreater(checked, 15)

    def test_voice_object_shares_settings(self):
        """Sa voix (Voice) lit le même dictionnaire que celui modifié par le hub."""
        self.assertIs(server.capri.voice_cfg, server.CONFIG["voice"])
        self.assertIs(server.capri.heart.settings, server.CONFIG["personnalite"])
        self.assertIs(actions.SETTINGS, server.CONFIG["mains"])


if __name__ == "__main__":
    unittest.main()

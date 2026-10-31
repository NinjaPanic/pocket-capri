"""Ses mains sur tout le PC : commandes PowerShell (toujours validées), réglages, écran, session.
Rien ici ne verrouille, n'éteint ni ne touche au presse-papiers : seules des commandes sans effet sont lancées."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from capri_brain import actions  # noqa: E402


class PcControlTest(unittest.TestCase):
    def test_command_runs_and_returns_output(self):
        out = actions.run("commande", {"commande": "Write-Output 'salut Capri é'"})
        self.assertIn("salut Capri é", out)
        self.assertIn("Code de sortie 1", actions.run("commande", {"commande": "exit 1"}))

    def test_command_always_confirmed(self):
        args = {"commande": "Get-Date"}
        self.assertTrue(actions.needs_confirmation("commande", args))
        old = dict(actions.SETTINGS)
        try:
            actions.SETTINGS["confirmer"] = False  # même quand il a dit d'agir sans demander
            self.assertTrue(actions.needs_confirmation("commande", args))
            self.assertFalse(actions.needs_confirmation("alimentation", {"action": "verrouiller"}))
            self.assertTrue(actions.needs_confirmation("alimentation", {"action": "deconnecter"}))
        finally:
            actions.SETTINGS.clear()
            actions.SETTINGS.update(old)
        self.assertIn("en administrateur", actions.describe("commande", {"commande": "Clear-DnsClientCache", "admin": True}))

    def test_tools_listed_for_the_planner(self):
        names = {t["function"]["name"] for t in actions.TOOL_SCHEMAS}
        self.assertTrue({"commande", "parametres_windows", "ecran", "presse_papiers", "capture_ecran", "alimentation"} <= names)
        for t in ["verrouille mon PC", "c'est quoi mon adresse IP", "ouvre les paramètres wifi", "baisse la luminosité",
                  "fais une capture d'écran", "lock my pc"]:
            self.assertTrue(actions.HINT.search(actions.plain(t)), t)

    def test_settings_pages(self):
        self.assertEqual(actions._best_match("wifi", actions.SETTINGS_PAGES), "wifi")
        self.assertEqual(actions._best_match("gestionnaire_taches", actions.SETTINGS_PAGES), "gestionnaire_taches")


if __name__ == "__main__":
    unittest.main()

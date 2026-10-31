"""Ce que ses mains ont fait, en anglais pour l'affichage (le hub, quand elle est réglée en anglais).

Les résultats des outils restent en français pour le modèle (ses notes internes) ; seul ce qu'on montre est traduit.
Une règle par phrase connue (dans l'ordre) ; ce qui n'est pas reconnu garde quelques mots-clés traduits.
"""

import re

_RULES: list[tuple[str, str]] = [
    (r"^« (.+?) » était déjà ouvert : remis au premier plan( \(il était réduit\))?\.", r"“\1” was already open: brought to the front\2."),
    (r"\(il était réduit\)", "(it was minimised)"),
    (r"^Dans (.+?), bouton « (.+?) » pressé\.", r"In \1, pressed “\2”."),
    (r"^Dans (.+?), page « (.+?) » ouverte\.", r"In \1, opened “\2”."),
    (r"^« (.+?) » est lancé\.", r"“\1” launched."),
    (r"^« (.+?) » est fermé\.", r"“\1” closed."),
    (r"^(.+?) est ouvert dans le navigateur\.", r"\1 opened in the browser."),
    (r"^Recherche « (.+?) » ouverte \((.+?)\)\.", r"Search “\1” opened (\2)."),
    (r"^Dossier (.+?) ouvert\.", r"Folder \1 opened."),
    (r"^Navigateur ouvert\.", "Browser opened."),
    (r"^Volume réglé à (\d+) %\.", r"Volume set to \1%."),
    (r"^Volume monté\.", "Volume up."),
    (r"^Volume baissé\.", "Volume down."),
    (r"^Volume actuel : (\d+) %( \(coupé\))?\.", lambda m: f"Volume: {m[1]}%{' (muted)' if m[2] else ''}."),
    (r"^Son coupé\.", "Sound muted."),
    (r"^Son remis, volume à (\d+) %\.", r"Sound back on, volume \1%."),
    (r"^PC verrouillé\.", "PC locked."),
    (r"^Extinction dans 30 secondes.*", "Shutting down in 30 seconds (say “cancel” to stop it)."),
    (r"^Redémarrage dans 30 secondes.*", "Restarting in 30 seconds (say “cancel” to stop it)."),
    (r"^Mise en veille prolongée\.", "Hibernating."),
    (r"^Mise en veille\.", "Going to sleep."),
    (r"^Session fermée\.", "Signed out."),
    (r"^Extinction annulée\.", "Shutdown cancelled."),
    (r"^Fenêtre « (.+?) » au premier plan\.", r"Window “\1” brought to the front."),
    (r"^Fenêtre « (.+?) » : (.+?) fait\.", r"Window “\1”: \2 done."),
    (r"^Clic sur (.+?) « (.+?) »\.", r"Clicked \1 “\2”."),
    (r"^Clic à la position \((.+?)\) de la capture\.", r"Clicked at (\1) on the screenshot."),
    (r"^Touches (.+?) appuyées\.", r"Pressed \1."),
    (r"^Défilement vers le haut\.", "Scrolled up."),
    (r"^Défilement vers le bas\.", "Scrolled down."),
    (r"^Luminosité à (\d+) %\.", r"Brightness \1%."),
    (r"^Écran éteint.*", "Screen off (it wakes up when you move the mouse)."),
    (r"^Ouvert : (.+?)\.", r"Opened: \1."),
    (r"^Copié dans le presse-papiers\.", "Copied to the clipboard."),
    (r"^Presse-papiers : ", "Clipboard: "),
    (r"^Capture enregistrée : ", "Screenshot saved: "),
    (r"^Fait en administrateur\. ", "Done as administrator. "),
    (r"^Code de sortie (\d+)\. ", r"Exit code \1. "),
    (r"^Fait\. ", "Done. "),
    (r"\(aucune sortie\)", "(no output)"),
    (r"^Rappel n°(\d+) enregistré pour (.+?) : « (.+?) »\.", r"Reminder #\1 set for \2: “\3”."),
    (r"^Reporté : « (.+?) » (.+?)\.", r"Snoozed: “\1” \2."),
    (r"^Aucun rappel prévu\.", "No reminders."),
    (r"^Rappels prévus :", "Reminders:"),
    (r"^Annulé : ", "Cancelled: "),
    (r"^Mode « ne pas déranger » terminé.*", "Do-not-disturb is over."),
    (r"^Tu lui montres (?:la fenêtre )?« (.+?) ».*", r"Showing “\1”."),
    (r"^Sur Spotify, « (.+?) » lancé\.", r"On Spotify, playing “\1”."),
    (r"^ÉCHEC : rien trouvé sur Spotify pour « (.+?) ».*", r"FAILED: nothing found on Spotify for “\1” (the search is open)."),
    (r"^ÉCHEC : Spotify ne s'ouvre pas.*", "FAILED: Spotify won't open."),
    (r"^ÉCHEC : aucun programme nommé « (.+?) » trouvé sur ce PC\.", r"FAILED: no program called “\1” on this PC."),
    (r"^ÉCHEC : « (.+?) » n'est pas ouvert\.", r"FAILED: “\1” isn't open."),
    (r"^ÉCHEC : aucune fenêtre « (.+?) »\.", r"FAILED: no “\1” window."),
    (r"^ÉCHEC : fenêtre « (.+?) » introuvable ou réduite\.", r"FAILED: window “\1” not found or minimised."),
    (r"^ÉCHEC : dossier « (.+?) » introuvable\.", r"FAILED: folder “\1” not found."),
    (r"^ÉCHEC : la commande a pris trop de temps.*", "FAILED: the command took too long and was stopped."),
    (r"^ÉCHEC : la demande d'administrateur a été refusée.*", "FAILED: the administrator request was refused."),
    (r"^ÉCHEC : cet écran ne se règle pas.*", "FAILED: this screen can't be adjusted from Windows."),
    (r"^ÉCHEC : réglage du volume impossible\.", "FAILED: couldn't change the volume."),
    (r"^REFUSÉ : c'est un champ de mot de passe.*", "REFUSED: that's a password field."),
    (r"^REFUSÉ : cette fenêtre ressemble à une page de connexion.*", "REFUSED: that looks like a sign-in page."),
    (r"^REFUSÉ : c'est une fenêtre de Capri elle-même\.", "REFUSED: that's one of Capri's own windows."),
    (r"^REFUSÉ : « (.+?) » est un processus système.*", r"REFUSED: “\1” is a system process."),
    (r"^ÉCHEC : ", "FAILED: "),
    (r"^REFUSÉ : ", "REFUSED: "),
    (r"« (.*?) »", r"“\1”"),
    # quelques mots qui restent (boutons, dates des rappels)
    (r"“Lecture”", "“Play”"), (r"“Suivant”", "“Next”"), (r"“Précédent”", "“Previous”"), (r"“J'aime”", "“Like”"),
    (r"\baujourd'hui à ", "today at "), (r"\bdemain à ", "tomorrow at "), (r"\bdans (\d+) minutes?", r"in \1 min"),
    (r" \(tous les jours\)", " (every day)"),
]
_COMPILED = [(re.compile(rx), rep) for rx, rep in _RULES]


def english(text: str) -> str:
    """Chaque ligne du résultat, traduite si on la reconnaît."""
    out = []
    for line in text.split("\n"):
        for rx, rep in _COMPILED:
            line = rx.sub(rep, line)
        out.append(line)
    return "\n".join(out)

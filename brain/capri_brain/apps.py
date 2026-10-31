"""Actions toutes prêtes sur les programmes courants (Discord, Spotify, navigateurs) et sur n'importe quelle fenêtre.

Pour Discord et Spotify, elle appuie directement sur le bouton dans la fenêtre (via l'accessibilité de Windows) :
pas besoin de lui donner le focus, et si la fenêtre est réduite elle l'affiche un instant sans l'activer, puis la
remet comme elle était. Pour les navigateurs, ce sont des raccourcis clavier (la fenêtre passe au premier plan).
"""

import ctypes
import logging
import re
import time

from . import eyes, hands

log = logging.getLogger("capri")
user32 = ctypes.windll.user32

# appli → action → boutons à presser (nom exact, en anglais ou en français) ou raccourci clavier
RECIPES: dict[str, dict[str, dict]] = {
    "discord": {
        "micro": {"buttons": r"Mute|Unmute|Rendre muet|Désactiver le micro|Réactiver le micro|Activer le micro"},
        "sourdine": {"buttons": r"Deafen|Undeafen|Mettre en sourdine|Désactiver la sourdine|Rendre sourd|Ne plus être sourd"},
        "raccrocher": {"buttons": r"Disconnect|Se déconnecter|Quitter le salon vocal"},
        "camera": {"buttons": r"Turn On Camera|Turn Off Camera|Activer la caméra|Désactiver la caméra"},
    },
    "spotify": {
        "lecture_pause": {"buttons": r"Play|Pause|Lecture"},
        "suivant": {"buttons": r"Next|Suivant"},
        "precedent": {"buttons": r"Previous|Précédent"},
        "aleatoire": {"buttons": r"Enable shuffle|Enable smart shuffle|Disable shuffle|Activer la lecture aléatoire|"
                                 r"Activer la lecture aléatoire intelligente|Désactiver la lecture aléatoire"},
        "repeter": {"buttons": r"Enable repeat|Enable repeat one|Disable repeat|Activer la répétition|"
                               r"Activer la répétition d'un titre|Désactiver la répétition"},
        # « like la musique » : la chanson EN COURS rejoint ses titres likés (jamais « ajouter à une playlist »)
        "j_aime": {"buttons": r"Add to Liked Songs|Remove from Liked Songs|Save to Your Library|Remove from Your Library|"
                              r"Ajouter aux Titres likés|Ajouter à Titres likés|Retirer des Titres likés"},
        # « va dans mes titres likés » : ouvre la page, sans rien modifier
        "titres_likes": {"uri": "spotify:collection:tracks"},
    },
    "navigateur": {
        "nouvel_onglet": {"keys": "ctrl+t"}, "fermer_onglet": {"keys": "ctrl+w"}, "rouvrir_onglet": {"keys": "ctrl+maj+t"},
        "onglet_suivant": {"keys": "ctrl+tab"}, "onglet_precedent": {"keys": "ctrl+maj+tab"},
        "retour": {"keys": "alt+gauche"}, "avancer": {"keys": "alt+droite"}, "recharger": {"keys": "f5"},
        "plein_ecran": {"keys": "f11"}, "zoom_plus": {"keys": "ctrl+="}, "zoom_moins": {"keys": "ctrl+-"},
        "pause_video": {"keys": "k"}, "muet_video": {"keys": "m"},
    },
}
BROWSERS = ("brave", "chrome", "msedge", "firefox", "opera")
WINDOW_ACTIONS = ("premier_plan", "reduire", "agrandir", "restaurer", "fermer")


def _app_of(appli: str) -> str:
    a = appli.lower().strip()
    if a in BROWSERS or a in ("navigateur", "internet", "youtube", "web"):
        return "navigateur"
    return a


def _find(appli: str):
    if _app_of(appli) == "navigateur":
        return next((w for w in eyes.windows() if w.app.lower() in BROWSERS), None)
    return eyes.find_window(appli)


def press_button(win: eyes.Window, pattern: str) -> str | None:
    """Presse le premier bouton dont le nom correspond exactement. Renvoie son nom, ou None."""
    import uiautomation as auto
    exact = re.compile(rf"^(?:{pattern})$", re.I)
    was_min = bool(user32.IsIconic(win.hwnd))
    if was_min:
        user32.ShowWindow(win.hwnd, 4)  # SW_SHOWNOACTIVATE : visible sans lui voler le focus
        time.sleep(0.6)
    try:
        for attempt in range(2):
            if attempt:  # rien trouvé : l'appli n'avait pas fini de préparer son contenu, on lui laisse le temps
                eyes._awake.discard(win.hwnd)
                time.sleep(1.5)
            eyes._wake_chromium(win.hwnd)
            if (name := _press(win, exact)) is not None:
                return name
        return None
    finally:
        if was_min:
            time.sleep(0.3)
            user32.ShowWindow(win.hwnd, 7)  # SW_SHOWMINNOACTIVE : réduite à nouveau


def _press(win: eyes.Window, exact: re.Pattern) -> str | None:
    import uiautomation as auto
    with eyes._lock, auto.UIAutomationInitializerInThread():
        root = auto.ControlFromHandle(win.hwnd)
        start = time.time()
        for ctrl, _ in auto.WalkControl(root, maxDepth=60):
            if time.time() - start > 5:
                break
            try:
                if ctrl.ControlTypeName not in ("ButtonControl", "CheckBoxControl", "ToggleButtonControl"):
                    continue
                name = (ctrl.Name or "").strip()
            except Exception:
                continue
            if not exact.match(name):
                continue
            for how in ("GetInvokePattern", "GetTogglePattern", "GetLegacyIAccessiblePattern"):
                try:
                    pat = getattr(ctrl, how)()
                    {"GetInvokePattern": lambda: pat.Invoke(), "GetTogglePattern": lambda: pat.Toggle(),
                     "GetLegacyIAccessiblePattern": lambda: pat.DoDefaultAction()}[how]()
                    return name
                except Exception:
                    continue
    return None


def _fold(text: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def play_search(recherche: str) -> str:
    """« Mets Blinding Lights » : cherche sur Spotify et lance le résultat qui correspond le mieux, en commençant par le
    « meilleur résultat » en haut de la page. Jamais un autre bouton que « Lecture » / « Lire : … » d'un résultat."""
    import os
    from urllib.parse import quote
    import uiautomation as auto
    win = eyes.find_window("spotify")
    if not win:
        os.startfile("spotify:")  # Spotify se lance
        for _ in range(16):
            time.sleep(0.5)
            if win := eyes.find_window("spotify"):
                break
        else:
            return "ÉCHEC : Spotify ne s'ouvre pas (il est bien installé ?)."
        time.sleep(2)
    os.startfile("spotify:search:" + quote(recherche))
    words = [w for w in re.findall(r"\w+", _fold(recherche)) if len(w) > 1]
    retyped = False
    for attempt in range(4):
        time.sleep(1.6 if attempt == 0 else 1.2)
        eyes._awake.discard(win.hwnd)
        eyes._wake_chromium(win.hwnd)
        best, best_score = None, 0
        with eyes._lock, auto.UIAutomationInitializerInThread():
            root = auto.ControlFromHandle(win.hwnd)
            start, title = time.time(), None  # titre du dernier résultat vu (« Plus d'options pour … »)
            for ctrl, depth in auto.WalkControl(root, maxDepth=60):
                if time.time() - start > 6:
                    break
                try:
                    kind, name = ctrl.ControlTypeName, (ctrl.Name or "").strip()
                except Exception:
                    continue
                if not retyped and kind == "ComboBoxControl" and re.search(r"écouter|listen|search|recherch", name, re.I):
                    # le lien de recherche de Spotify remplace les espaces par des « + » dans le champ : on y remet le
                    # vrai texte (Spotify relance la recherche avec)
                    try:
                        ctrl.GetValuePattern().SetValue(recherche)
                        retyped = True
                    except Exception:
                        pass
                    continue
                if kind != "ButtonControl":
                    continue
                f = _fold(name)
                if m := re.match(r"^(?:plus d'options pour|more options for)\s+(.+)", f):
                    title = m.group(1)
                    continue
                if m := re.match(r"^(?:play|lire|ecouter)\s*:?\s+(.+)", f):
                    found = m.group(1)  # une ligne de résultat : son titre est dans le nom du bouton
                elif re.fullmatch(r"play|lire|lecture", f) and title and depth >= 18:
                    found = title  # la carte « meilleur résultat » : un bouton « Lecture » juste après son titre
                else:
                    continue
                score = sum(w in found for w in words)
                if score > best_score:  # à égalité, le premier : le meilleur résultat est en haut de la page
                    best, best_score = (ctrl, found), score
            if retyped and attempt == 0:
                continue  # la recherche vient d'être relancée avec le bon texte : on relit la page à jour
            if best and best_score >= max(1, (len(words) + 1) // 2):
                ctrl, label = best
                for how in ("GetInvokePattern", "GetLegacyIAccessiblePattern"):
                    try:
                        pat = getattr(ctrl, how)()
                        pat.Invoke() if how == "GetInvokePattern" else pat.DoDefaultAction()
                        return f"Sur Spotify, « {label} » lancé."
                    except Exception:
                        continue
    return f"ÉCHEC : rien trouvé sur Spotify pour « {recherche} » (la recherche est ouverte : lis la fenêtre et clique)."


def control(appli: str, action: str) -> str:
    action = action.lower().strip().replace(" ", "_").replace("é", "e").replace("è", "e")
    win = _find(appli)
    if not win:
        return f"ÉCHEC : « {appli} » n'est pas ouvert."
    if action in WINDOW_ACTIONS:
        if action == "premier_plan":
            eyes.focus(win)
            hands.target(win)
        elif action == "fermer":
            user32.PostMessageW(win.hwnd, 0x0010, 0, 0)  # WM_CLOSE : comme cliquer sur la croix
        else:
            user32.ShowWindow(win.hwnd, {"reduire": 6, "agrandir": 3, "restaurer": 9}[action])
        return f"Fenêtre « {win.title} » : {action.replace('_', ' ')} fait."
    recipe = RECIPES.get(_app_of(appli), {}).get(action)
    if not recipe:
        known = ", ".join(list(RECIPES.get(_app_of(appli), {})) + list(WINDOW_ACTIONS))
        return f"ÉCHEC : action « {action} » inconnue pour {appli} (connues : {known}). Sinon, lis la fenêtre et clique."
    if "uri" in recipe:
        import os
        os.startfile(recipe["uri"])  # lien interne de l'appli : ouvre la page directement
        return f"Dans {win.app}, page « {action.replace('_', ' ')} » ouverte."
    if "keys" in recipe:
        eyes.focus(win)
        hands.target(win)
        return hands.press(recipe["keys"]).replace("Touches", f"Dans « {win.title} », touches")
    pressed = press_button(win, recipe["buttons"])
    if not pressed and _app_of(appli) == "spotify" and action in ("lecture_pause", "suivant", "precedent"):
        from .actions import media  # les touches multimédia marchent toujours
        return media(action)
    if not pressed:
        return (f"ÉCHEC : bouton introuvable dans {win.app} pour « {action} » (pas en appel vocal ? fenêtre "
                "différente ?). Lis la fenêtre pour voir ce qui est possible.")
    return f"Dans {win.app}, bouton « {pressed} » pressé."

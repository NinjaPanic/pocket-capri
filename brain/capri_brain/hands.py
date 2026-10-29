"""Les mains de Capri sur la souris et le clavier (Windows).

Garde-fous :
- jamais rien écrit dans un champ de mot de passe ;
- envoyer un message, acheter, payer, publier ou supprimer attend un « oui » de l'utilisateur ;
- si l'utilisateur bouge la souris pendant qu'elle pilote, elle s'arrête : il a repris la main.
"""

import ctypes
import ctypes.wintypes as wt
import re
import time

from . import eyes

user32 = ctypes.windll.user32

# --- Bas niveau : SendInput -------------------------------------------------

_ULONG_PTR = ctypes.c_size_t


class _KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", _ULONG_PTR)]


class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", _ULONG_PTR)]


class _INPUT(ctypes.Structure):
    class _U(ctypes.Union):
        _fields_ = [("ki", _KEYBDINPUT), ("mi", _MOUSEINPUT), ("pad", ctypes.c_byte * 32)]
    _anonymous_ = ("u",)
    _fields_ = [("type", wt.DWORD), ("u", _U)]


def _send(*inputs: _INPUT) -> None:
    arr = (_INPUT * len(inputs))(*inputs)
    user32.SendInput(len(inputs), arr, ctypes.sizeof(_INPUT))


def _key(vk: int = 0, scan: int = 0, flags: int = 0) -> _INPUT:
    i = _INPUT(type=1)
    i.ki = _KEYBDINPUT(vk, scan, flags, 0, 0)
    return i


def _mouse(flags: int, data: int = 0) -> _INPUT:
    i = _INPUT(type=0)
    i.mi = _MOUSEINPUT(0, 0, data & 0xFFFFFFFF, flags, 0, 0)
    return i


VK = {"entree": 0x0D, "enter": 0x0D, "entrer": 0x0D, "echap": 0x1B, "esc": 0x1B, "escape": 0x1B, "tab": 0x09,
      "espace": 0x20, "space": 0x20, "retour": 0x08, "backspace": 0x08, "suppr": 0x2E, "delete": 0x2E,
      "haut": 0x26, "up": 0x26, "bas": 0x28, "down": 0x28, "gauche": 0x25, "left": 0x25, "droite": 0x27, "right": 0x27,
      "debut": 0x24, "home": 0x24, "fin": 0x23, "end": 0x23, "pageup": 0x21, "pagedown": 0x22,
      "ctrl": 0x11, "control": 0x11, "alt": 0x12, "maj": 0x10, "shift": 0x10, "win": 0x5B, "windows": 0x5B,
      **{f"f{n}": 0x6F + n for n in range(1, 13)}}
_EXTENDED = {0x26, 0x28, 0x25, 0x27, 0x24, 0x23, 0x21, 0x22, 0x2E, 0x5B}


def _vk(name: str) -> int | None:
    name = name.strip().lower().replace("é", "e").replace("è", "e").replace("ê", "e")
    if name in VK:
        return VK[name]
    if len(name) == 1:
        return user32.VkKeyScanW(ord(name)) & 0xFF
    return None


def press(combo: str) -> str:
    """« ctrl+t », « entree », « alt+tab »… (plusieurs combinaisons séparées par des espaces)."""
    for part in combo.split():
        keys = [_vk(k) for k in part.split("+")]
        if None in keys or not keys:
            return f"ÉCHEC : touche inconnue dans « {part} »."
        down = [_key(k, flags=1 if k in _EXTENDED else 0) for k in keys]
        up = [_key(k, flags=(1 if k in _EXTENDED else 0) | 2) for k in reversed(keys)]
        _send(*down, *up)
        time.sleep(0.08)
    return f"Touches {combo} appuyées."


def type_text(text: str) -> None:
    for ch in text:
        if ch == "\n":
            _send(_key(0x10), _key(0x0D), _key(0x0D, flags=2), _key(0x10, flags=2))  # Maj+Entrée : nouvelle ligne
        else:
            _send(_key(0, ord(ch), 4), _key(0, ord(ch), 4 | 2))  # KEYEVENTF_UNICODE : accents compris
        # Le Bloc-notes de Windows 11 (et d'autres applis WinUI) perd des lettres en dessous de ~25 ms.
        time.sleep(0.03)


def cursor() -> tuple[int, int]:
    p = wt.POINT()
    user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


def click_at(x: int, y: int, double: bool = False, right: bool = False) -> None:
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.05)
    down, up = (0x0008, 0x0010) if right else (0x0002, 0x0004)
    for _ in range(2 if double else 1):
        _send(_mouse(down), _mouse(up))
        time.sleep(0.06)
    MOVED["pos"] = (int(x), int(y))


def scroll(direction: str, amount: int = 5) -> str:
    sign = 1 if direction.lower().startswith(("haut", "up")) else -1
    _send(_mouse(0x0800, sign * 120 * max(1, min(int(amount), 30))))
    return f"Défilement vers le {'haut' if sign > 0 else 'bas'}."


# --- Reprise de la main par l'utilisateur ------------------------------------

MOVED: dict = {"pos": None}


def start_session() -> None:
    MOVED["pos"] = cursor()


def user_took_over() -> bool:
    """Vrai si la souris a bougé depuis la dernière action de Capri (c'est donc lui)."""
    if MOVED["pos"] is None:
        return False
    x, y = cursor()
    return abs(x - MOVED["pos"][0]) + abs(y - MOVED["pos"][1]) > 60


# --- Garde-fous -------------------------------------------------------------

MESSAGING = re.compile(r"discord|whatsapp|telegram|messenger|signal|slack|teams|outlook|thunderbird|"
                       r"gmail|mail|instagram|twitter|x\.com|reddit|snapchat", re.I)
RISKY_NAME = re.compile(r"\b(envoy|send|publi|post|tweet|acheter|achat|buy|pay|commander|order|checkout|"
                        r"supprim|delete|effac|remove|vider|uninstall|d[ée]sinstall|confirm|valider)", re.I)
# Texte tapé dans une appli de messagerie, pas encore envoyé : l'envoi (Entrée, clic) demandera un « oui ».
DRAFT: dict = {"app": None}


def _fg_label() -> str:
    w = eyes.find_window(None)
    return f"{w.title} {w.app}" if w else ""


def risk(name: str, args: dict) -> str | None:
    """Raison de demander confirmation avant ce geste, ou None s'il est sans risque."""
    if name == "cliquer":
        el = eyes.element(args.get("element", 0))
        if el and RISKY_NAME.search(el.name):
            return f"cliquer sur « {el.name} »"
        if DRAFT["app"]:
            return f"cliquer dans {DRAFT['app']}, ce qui pourrait envoyer le message tapé"
    if name == "cliquer_position" and DRAFT["app"]:
        return f"cliquer dans {DRAFT['app']}, ce qui pourrait envoyer le message tapé"
    if name == "touches":
        keys = str(args.get("touches", "")).lower()
        if DRAFT["app"] and re.search(r"(^|\s|\+)(entree|entrée|enter|entrer)\b", keys) and "maj" not in keys and "shift" not in keys:
            return f"appuyer sur Entrée dans {DRAFT['app']}, ce qui envoie le message"
        if re.search(r"\b(suppr|delete)\b", keys) and "maj" in keys:
            return "supprimer définitivement (Maj+Suppr)"
    if name == "ecrire" and str(args.get("texte", "")).endswith("\n") and MESSAGING.search(_fg_label()):
        return "écrire et envoyer ce message"
    return None


# --- Gestes (appelés par les outils) ------------------------------------------

def act_click(element: int, double: bool = False, droit: bool = False) -> str:
    el = eyes.element(element)
    if not el:
        return "ÉCHEC : élément inconnu, relis la fenêtre (lire_fenetre) pour avoir des numéros à jour."
    target(eyes.LAST["window"])
    if problem := ensure_target():
        return problem
    click_at(*el.center, double=double, right=droit)
    time.sleep(0.5)
    return f"Clic sur {el.kind} « {el.name} »."


def act_click_position(x: float, y: float, double: bool = False) -> str:
    point = eyes.shot_point(x, y)
    if not point:
        return "ÉCHEC : pas de capture récente, regarde d'abord l'écran (regarder_ecran)."
    click_at(*point, double=double)
    time.sleep(0.5)
    return f"Clic à la position ({x:.0f}, {y:.0f}) de la capture."


def act_type(texte: str, element: int | None = None) -> str:
    if element:
        el = eyes.element(element)
        if not el:
            return "ÉCHEC : élément inconnu, relis la fenêtre."
        target(eyes.LAST["window"])
    if problem := ensure_target():
        return problem
    if element:
        if el.password:
            return "REFUSÉ : c'est un champ de mot de passe, tu n'écris jamais de mot de passe."
        click_at(*el.center)
        time.sleep(0.2)
    label = _fg_label()
    if re.search(r"mot de passe|password|connexion|sign in|login", label, re.I) and not element:
        return "REFUSÉ : cette fenêtre ressemble à une page de connexion, tu n'y tapes rien."
    type_text(texte)
    if m := MESSAGING.search(label):
        DRAFT["app"] = None if texte.endswith("\n") else m.group(0)
    # en entier ou annoncé comme coupé ici seulement : sinon le module croit qu'il manque la fin et la retape
    shown = texte if len(texte) <= 200 else texte[:200] + "… (la suite aussi)"
    return (f"Texte tapé en entier ({len(texte)} caractères), ajouté là où était le curseur, "
            f"sans rien effacer de ce qu'il y avait avant : « {shown} ».")


def act_keys(touches: str) -> str:
    if problem := ensure_target():
        return problem
    result = press(touches)
    if re.search(r"alt\+tab|win", touches.lower()):
        time.sleep(0.3)
        target(eyes.find_window(None))
    if re.search(r"(entree|entrée|enter|entrer)", touches.lower()):
        DRAFT["app"] = None
    time.sleep(0.4)
    return result


def act_focus(nom: str) -> str:
    win = eyes.find_window(nom)
    if not win:
        return f"ÉCHEC : aucune fenêtre « {nom} »."
    eyes.focus(win)
    target(win)
    MOVED["pos"] = cursor()
    return f"Fenêtre « {win.title} » au premier plan."


# --- Fenêtre ciblée : elle ne tape et n'appuie sur des touches que dans la fenêtre qu'elle a choisie ---

TARGET: dict = {"win": None}
_NEVER = {"capri", "electron"}  # ses propres fenêtres


def target(win) -> None:
    TARGET["win"] = win


def ensure_target() -> str | None:
    """Ramène la fenêtre ciblée au premier plan ; renvoie un motif d'échec si c'est impossible."""
    win = TARGET["win"]
    if not win or not user32.IsWindow(win.hwnd):
        return ("ÉCHEC : aucune fenêtre ciblée. Utilise d'abord activer_fenetre ou lire_fenetre "
                "sur la fenêtre où agir.")
    if win.app.lower() in _NEVER:
        return "REFUSÉ : c'est une fenêtre de Capri elle-même."
    if user32.GetForegroundWindow() != win.hwnd:
        eyes.focus(win)
        if user32.GetForegroundWindow() != win.hwnd:
            return f"ÉCHEC : impossible de mettre « {win.title} » au premier plan, rien n'a été tapé."
    return None

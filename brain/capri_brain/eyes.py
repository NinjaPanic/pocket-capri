"""Les yeux de Capri : ce qu'elle voit des fenêtres ouvertes (Windows).

Deux façons de voir, de la plus précise à la plus large :
- lire une fenêtre via l'accessibilité de Windows : le texte affiché et les éléments cliquables, numérotés
  (c'est exact et rapide, ça marche pour Discord, les navigateurs, l'explorateur…) ;
- une capture d'écran, que le modèle (qui voit les images) regarde quand le texte ne suffit pas.
"""

import base64
import ctypes
import ctypes.wintypes as wt
import io
import logging
import re
import threading
import time
from dataclasses import dataclass

import psutil

log = logging.getLogger("capri")

# Coordonnées en vrais pixels, pour que ce qu'elle lit et là où elle clique correspondent.
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except OSError:
    pass

user32 = ctypes.windll.user32


# --- Fenêtres ---------------------------------------------------------------

@dataclass
class Window:
    hwnd: int
    title: str
    app: str
    rect: tuple[int, int, int, int]
    minimized: bool

    def line(self, n: int) -> str:
        return f"{n}. « {self.title} » ({self.app}){' [réduite]' if self.minimized else ''}"


_HIDDEN_APPS = {"textinputhost", "applicationframehost", "shellexperiencehost", "searchhost",
                "startmenuexperiencehost", "systemsettings", "lockapp"}


def _app_name(hwnd: int) -> str:
    pid = wt.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        return psutil.Process(pid.value).name().removesuffix(".exe").removesuffix(".EXE")
    except psutil.Error:
        return "?"


def _title(hwnd: int) -> str:
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def _rect(hwnd: int) -> tuple[int, int, int, int]:
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def windows() -> list[Window]:
    """Fenêtres visibles de l'utilisateur, de la plus au premier plan à la plus en arrière."""
    found: list[Window] = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def visit(hwnd, _):
        if not user32.IsWindowVisible(hwnd) or user32.GetWindow(hwnd, 4):  # 4 = a un propriétaire (popup)
            return True
        title = _title(hwnd).strip()
        if not title or title in ("Program Manager", "Capri"):
            return True
        cloaked = ctypes.c_int(0)
        ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(cloaked), 4)  # fenêtre d'un autre bureau
        app = _app_name(hwnd)
        if cloaked.value or app.lower() in _HIDDEN_APPS:
            return True
        found.append(Window(hwnd, title, app, _rect(hwnd), bool(user32.IsIconic(hwnd))))
        return True

    user32.EnumWindows(visit, 0)
    return found


# Noms qu'on dit en français → nom du programme Windows.
ALIASES = {"explorateur": "explorer", "fichiers": "explorer", "dossier": "explorer", "bloc-notes": "notepad",
           "bloc notes": "notepad", "calculatrice": "calculator", "parametres": "settings", "paramètres": "settings",
           "gestionnaire des taches": "taskmgr", "gestionnaire des tâches": "taskmgr", "terminal": "windowsterminal"}
_BROWSERS = ("brave", "chrome", "msedge", "firefox", "opera")


def find_window(name: str | None) -> Window | None:
    """La fenêtre qui correspond au nom (titre ou programme) ; sans nom, celle au premier plan."""
    wins = windows()
    if not wins:
        return None
    if not name:
        fg = user32.GetForegroundWindow()
        return next((w for w in wins if w.hwnd == fg), wins[0])
    want = name.lower().strip()
    for fr, real in ALIASES.items():
        if fr in want:
            want = real
            break
    for test in (lambda w: want == w.app.lower(), lambda w: want in w.title.lower(),
                 lambda w: want in w.app.lower(), lambda w: all(p in (w.title + " " + w.app).lower() for p in want.split())):
        if hit := next((w for w in wins if test(w)), None):
            return hit
    if want in ("navigateur", "internet", "browser", "web"):
        return next((w for w in wins if w.app.lower() in _BROWSERS), None)
    return None


def focus(win: Window) -> None:
    if user32.IsIconic(win.hwnd):
        user32.ShowWindow(win.hwnd, 9)  # SW_RESTORE
    # Windows refuse souvent de donner le premier plan : une touche Alt « fantôme » débloque.
    user32.keybd_event(0x12, 0, 0, 0)
    user32.keybd_event(0x12, 0, 2, 0)
    user32.SetForegroundWindow(win.hwnd)
    time.sleep(0.25)


# --- Lecture par accessibilité ---------------------------------------------

@dataclass
class Element:
    n: int
    kind: str
    name: str
    center: tuple[int, int]
    password: bool = False
    value: str = ""


# Ce qu'elle a lu en dernier : les numéros des éléments servent ensuite à cliquer ou écrire.
LAST: dict = {"window": None, "elements": {}, "at": 0.0}
_lock = threading.Lock()

_CLICKABLE = {"ButtonControl", "HyperlinkControl", "EditControl", "ListItemControl", "MenuItemControl",
              "TabItemControl", "CheckBoxControl", "RadioButtonControl", "ComboBoxControl", "TreeItemControl",
              "SplitButtonControl", "DataItemControl"}
_KIND = {"ButtonControl": "bouton", "HyperlinkControl": "lien", "EditControl": "champ", "ListItemControl": "élément",
         "MenuItemControl": "menu", "TabItemControl": "onglet", "CheckBoxControl": "case", "RadioButtonControl": "option",
         "ComboBoxControl": "liste", "TreeItemControl": "élément", "SplitButtonControl": "bouton",
         "DataItemControl": "ligne"}


_awake: set[int] = set()


def _wake_chromium(hwnd: int) -> None:
    """Les applis Chromium/Electron (Discord, navigateurs…) n'exposent leur contenu qu'à la demande :
    on le leur demande, et la première fois on leur laisse le temps de construire l'arbre."""
    widgets = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def visit(h, _):
        buf = ctypes.create_unicode_buffer(64)
        user32.GetClassNameW(h, buf, 64)
        if buf.value.startswith("Chrome_RenderWidgetHostHWND"):
            widgets.append(h)
        return True

    user32.EnumChildWindows(hwnd, visit, 0)
    for h in widgets:
        user32.SendMessageTimeoutW(h, 0x003D, 0, -4, 2, 500, None)  # WM_GETOBJECT, OBJID_CLIENT
    if widgets and hwnd not in _awake:
        _awake.add(hwnd)
        time.sleep(1.0)


def read_window(win: Window, max_chars: int = 6000, max_elements: int = 120, budget: float = 4.0) -> str:
    """Le texte visible d'une fenêtre et ses éléments cliquables, numérotés [n]."""
    import uiautomation as auto
    if win.minimized:
        focus(win)
        win = Window(win.hwnd, win.title, win.app, _rect(win.hwnd), False)
    _wake_chromium(win.hwnd)
    with _lock, auto.UIAutomationInitializerInThread():
        root = auto.ControlFromHandle(win.hwnd)
        if root is None:
            return "ÉCHEC : fenêtre illisible."
        left, top, right, bottom = win.rect
        lines: list[str] = []
        elements: dict[int, Element] = {}
        seen: set[str] = set()
        size = 0
        start = time.time()
        for ctrl, depth in auto.WalkControl(root, maxDepth=40):
            if time.time() - start > budget or size > max_chars:
                lines.append("… (fenêtre trop longue, lecture coupée)")
                break
            try:
                kind = ctrl.ControlTypeName
                if ctrl.IsOffscreen and kind != "DocumentControl":
                    continue
                name = (ctrl.Name or "").strip().replace("\n", " ")
                r = ctrl.BoundingRectangle
            except Exception:
                continue
            if r.width() <= 1 or r.height() <= 1 or r.right < left or r.left > right or r.bottom < top or r.top > bottom:
                continue
            value = ""
            if kind in ("EditControl", "ComboBoxControl"):
                try:
                    value = (ctrl.GetValuePattern().Value or "")[:200]
                except Exception:
                    pass
            if kind in _CLICKABLE and len(elements) < max_elements and (name or kind == "EditControl"):
                n = len(elements) + 1
                pw = bool(getattr(ctrl, "IsPassword", False))
                elements[n] = Element(n, _KIND[kind], name[:120], (r.xcenter(), r.ycenter()), pw, value)
                extra = " (mot de passe)" if pw else f" contient « {value} »" if value else ""
                line = f"[{n}] {_KIND[kind]} « {name[:120]} »{extra}"
            elif kind in ("TextControl", "DocumentControl", "HeaderControl", "TitleBarControl") and name:
                key = name[:80]
                if key in seen:
                    continue
                seen.add(key)
                line = name[:400]
            else:
                continue
            lines.append(line)
            size += len(line)
        LAST.update(window=win, elements=elements, at=time.time())
        from . import hands
        hands.target(win)
    head = f"Fenêtre « {win.title} » ({win.app})."
    if not lines:
        return head + " Aucun texte lisible : cette fenêtre (jeu, vidéo, image…) demande une capture d'écran."
    return head + " Contenu, de haut en bas ([n] = élément utilisable) :\n" + "\n".join(lines)


def element(n: int) -> Element | None:
    if time.time() - LAST["at"] > 300:
        return None
    return LAST["elements"].get(int(n))


# --- Capture d'écran --------------------------------------------------------

# Dernière capture : sa zone à l'écran, pour transformer une position sur l'image en position réelle.
SHOT: dict = {"box": None, "at": 0.0}


def screenshot(win: Window | None = None, max_side: int = 1280) -> tuple[str, tuple[int, int, int, int]]:
    """Capture (JPEG en base64) d'une fenêtre, ou de tout l'écran principal."""
    import mss
    from PIL import Image
    with mss.mss() as sct:
        if win and not win.minimized:
            l, t, r, b = win.rect
            mon = sct.monitors[0]
            l, t = max(l, mon["left"]), max(t, mon["top"])
            r, b = min(r, mon["left"] + mon["width"]), min(b, mon["top"] + mon["height"])
            box = {"left": l, "top": t, "width": max(1, r - l), "height": max(1, b - t)}
        else:
            box = sct.monitors[1]
        raw = sct.grab(box)
    img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    area = (box["left"], box["top"], box["width"], box["height"])
    SHOT.update(box=area, at=time.time())
    return base64.b64encode(buf.getvalue()).decode(), area


def shot_point(x: float, y: float) -> tuple[int, int] | None:
    """Position (0 à 1000 sur chaque axe de la dernière capture) → pixel réel à l'écran."""
    if not SHOT["box"] or time.time() - SHOT["at"] > 300:
        return None
    l, t, w, h = SHOT["box"]
    return int(l + max(0, min(1000, x)) / 1000 * w), int(t + max(0, min(1000, y)) / 1000 * h)


_SPACES = re.compile(r"\s+")


def summary() -> str:
    wins = windows()
    if not wins:
        return "Aucune fenêtre ouverte."
    return "Fenêtres ouvertes (la 1re est au premier plan) :\n" + "\n".join(
        w.line(i + 1) for i, w in enumerate(wins[:25]))

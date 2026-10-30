"""Ce que Capri ressent du PC lui-même : processeur qui chauffe, batterie, chargeur, réseau, clé USB, manette,
jeu lancé ou fermé, longue session de travail.

Relevés légers (psutil et Windows) toutes les 10 s, jamais de capture d'écran ni de lecture du contenu des
fenêtres : seulement le nom du programme au premier plan, pour reconnaître un jeu. Chaque changement devient un
`Event` ; c'est le cerveau qui décide s'il y réagit, comment, et quand (seuils de durée, délais, priorités).
"""

import ctypes
from pathlib import Path
import logging
import time
from dataclasses import dataclass, field

import psutil

log = logging.getLogger("capri")

# Où vivent les jeux (chemins d'installation) et quelques noms connus. Ce qui n'en fait pas partie n'est pas un jeu.
GAME_PATHS = ("steamapps\\common", "epic games", "riot games", "gog galaxy\\games", "ubisoft game launcher\\games",
              "ea games", "battle.net", "xboxgames", "\\games\\")
GAME_NAMES = {"minecraft", "javaw", "valorant", "league of legends", "fortnite", "robloxplayerbeta", "overwatch",
              "cs2", "dota2", "gta5", "eldenring", "genshinimpact", "rocketleague", "apex_legends"}
LAUNCHERS = {"steam", "steamwebhelper", "epicgameslauncher", "riotclientservices", "battle.net", "galaxyclient",
             "ubisoftconnect", "eadesktop", "wallpaper32", "wallpaper64", "ui32", "crashreportclient"}


@dataclass
class Event:
    """Quelque chose s'est passé sur le PC. `importance` 1 (anecdote) à 3 (mérite qu'elle en parle)."""
    kind: str
    data: dict = field(default_factory=dict)
    importance: int = 1
    ts: float = field(default_factory=time.time)
    ttl: float = 120.0  # au-delà, c'est trop tard pour y réagir

    @property
    def stale(self) -> bool:
        return time.time() - self.ts > self.ttl


def _online() -> bool:
    """Connexion à Internet selon Windows (aucune requête envoyée)."""
    flags = ctypes.c_uint(0)
    try:
        return bool(ctypes.windll.wininet.InternetGetConnectedState(ctypes.byref(flags), 0))
    except OSError:
        return True


class _XInputState(ctypes.Structure):
    _fields_ = [("packet", ctypes.c_uint), ("buttons", ctypes.c_ushort), ("lt", ctypes.c_ubyte), ("rt", ctypes.c_ubyte),
                ("lx", ctypes.c_short), ("ly", ctypes.c_short), ("rx", ctypes.c_short), ("ry", ctypes.c_short)]


def _pads() -> int:
    """Nombre de manettes Xbox (ou compatibles) branchées."""
    try:
        xinput = ctypes.windll.xinput1_4
    except OSError:
        return 0
    state = _XInputState()
    return sum(xinput.XInputGetState(i, ctypes.byref(state)) == 0 for i in range(4))


def _foreground_process() -> psutil.Process | None:
    user32 = ctypes.windll.user32
    hwnd = user32.GetForegroundWindow()
    pid = ctypes.c_ulong(0)
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        return psutil.Process(pid.value) if pid.value else None
    except psutil.Error:
        return None


def game_name(proc: psutil.Process | None) -> str | None:
    """Le nom du jeu si ce programme en est un (d'après où il est installé), sinon None."""
    if proc is None:
        return None
    try:
        name = proc.name().lower().removesuffix(".exe")
        path = proc.exe().lower()
    except psutil.Error:
        return None
    if name in LAUNCHERS:
        return None
    parts = path.replace("/", "\\").split("\\")
    # moteurs de jeu reconnaissables où qu'ils soient installés : Unreal (…\Binaries\Win64\X-Win64-Shipping.exe)
    # et Unity (UnityPlayer.dll à côté de l'exécutable)
    unreal = name.endswith("-shipping") or "\\binaries\\win64\\" in path
    unity = Path(path).with_name("UnityPlayer.dll").exists() if path else False
    if name in GAME_NAMES or unreal or unity or any(p in path for p in GAME_PATHS):
        # le dossier du jeu est souvent plus parlant que l'exécutable (« DriveTogether-Win64-Shipping »)
        if "common" in parts and parts.index("common") + 1 < len(parts):
            return parts[parts.index("common") + 1]
        if "binaries" in parts and parts.index("binaries") > 0:
            return parts[parts.index("binaries") - 1]
        return name.split("-")[0]
    return None


class Senses:
    """Relevés toutes les 10 s ; renvoie les événements nouveaux. Rien n'est envoyé ailleurs."""

    def __init__(self):
        psutil.cpu_percent(None)  # le premier appel sert de référence
        self.hot_since: float | None = None
        self.hot_told = False
        self.battery = psutil.sensors_battery()
        self.online = True
        self.offline_checks = 0
        self.drives = self._removable()
        self.pads = _pads()
        self.game: tuple[str, float, int] | None = None  # (nom, depuis, pid)
        self.game_candidate: tuple[str, float, int] | None = None
        self.active_since = time.time()
        self.session_told = 0.0

    @staticmethod
    def _removable() -> set[str]:
        try:
            return {p.mountpoint for p in psutil.disk_partitions(all=False) if "removable" in p.opts}
        except Exception:
            return set()

    def poll(self, idle_seconds: float) -> list[Event]:
        events: list[Event] = []
        now = time.time()

        # le processeur chauffe : seulement s'il reste à fond plus d'une minute et demie
        cpu = psutil.cpu_percent(None)
        if cpu > 85:
            self.hot_since = self.hot_since or now
            if now - self.hot_since > 90 and not self.hot_told:
                self.hot_told = True
                events.append(Event("cpu_chaud", {"cpu": round(cpu)}, 2))
        elif cpu < 60:
            self.hot_since, self.hot_told = None, False

        # batterie et chargeur (un PC fixe n'en a pas : rien)
        battery = psutil.sensors_battery()
        if battery and self.battery:
            if battery.power_plugged != self.battery.power_plugged:
                events.append(Event("chargeur_branche" if battery.power_plugged else "chargeur_debranche",
                                    {"pourcent": round(battery.percent)}, 1))
            if not battery.power_plugged and battery.percent <= 15 < self.battery.percent:
                events.append(Event("batterie_faible", {"pourcent": round(battery.percent)}, 3, ttl=600))
        self.battery = battery or self.battery

        # Internet : coupé deux relevés de suite (20 s) pour ne pas réagir à un simple hoquet
        online = _online()
        if not online:
            self.offline_checks += 1
            if self.offline_checks == 2 and self.online:
                self.online = False
                events.append(Event("reseau_perdu", {}, 2))
        else:
            if not self.online:
                events.append(Event("reseau_revenu", {}, 2))
            self.online, self.offline_checks = True, 0

        # clé USB / carte SD
        drives = self._removable()
        for d in sorted(drives - self.drives):
            events.append(Event("usb_branche", {"lecteur": d.rstrip("\\")}, 2))
        for d in sorted(self.drives - drives):
            events.append(Event("usb_retire", {"lecteur": d.rstrip("\\")}, 1))
        self.drives = drives

        pads = _pads()
        if pads > self.pads:
            events.append(Event("manette_branchee", {}, 1))
        self.pads = pads

        # un jeu au premier plan depuis une minute : lancé ; son processus disparu : fermé
        fg = _foreground_process()
        name = game_name(fg)
        if self.game:
            gname, since, pid = self.game
            if not psutil.pid_exists(pid):
                self.game = None
                events.append(Event("jeu_ferme", {"jeu": gname, "minutes": round((now - since) / 60)}, 3, ttl=3600))
        elif name and fg:
            if self.game_candidate and self.game_candidate[2] == fg.pid:
                if now - self.game_candidate[1] > 60:
                    self.game = self.game_candidate
                    self.game_candidate = None
                    events.append(Event("jeu_lance", {"jeu": self.game[0]}, 2))
            else:
                self.game_candidate = (name, now, fg.pid)
        else:
            self.game_candidate = None

        # longue session devant le PC (sans pause de plus de 5 min), hors jeu
        if idle_seconds > 300:
            self.active_since = now
        elif not self.game and now - self.active_since > 2 * 3600 and now - self.session_told > 2 * 3600:
            self.session_told = now
            events.append(Event("longue_session", {"heures": round((now - self.active_since) / 3600, 1)}, 2, ttl=900))

        for e in events:
            log.info("Senti sur le PC : %s %s", e.kind, e.data)
        return events

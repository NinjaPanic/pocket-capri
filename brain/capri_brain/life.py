"""Ce que Capri perçoit d'elle-même, sans qu'on lui parle (Windows).

- La présence de l'utilisateur : temps depuis la dernière touche ou le dernier mouvement de souris.
- S'il est occupé : jeu en plein écran, présentation, mode « Ne pas déranger » de Windows.
"""

import ctypes
import logging
import os
import re
import time
from collections import deque
from dataclasses import dataclass

log = logging.getLogger("capri")





class _LastInput(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


def idle_seconds() -> float:
    """Secondes depuis la dernière action clavier/souris de l'utilisateur."""
    info = _LastInput(ctypes.sizeof(_LastInput), 0)
    if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
        return 0.0
    return ((ctypes.windll.kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF) / 1000


def busy() -> bool:
    """Vrai pendant un jeu en plein écran, une présentation ou le « Ne pas déranger » de Windows."""
    state = ctypes.c_int(0)
    try:
        if ctypes.windll.shell32.SHQueryUserNotificationState(ctypes.byref(state)) != 0:
            return False
    except OSError:
        return False
    # 2 occupé (plein écran), 3 jeu Direct3D plein écran, 4 présentation, 6 heures calmes
    return state.value in (2, 3, 4, 6)

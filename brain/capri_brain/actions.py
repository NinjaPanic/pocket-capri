"""Les mains de Capri : ce qu'elle peut réellement faire sur le PC (Windows).

Chaque action est un outil que le modèle peut appeler. Les actions qui peuvent faire perdre
quelque chose (fermer un programme, éteindre le PC…) ne s'exécutent qu'après un « oui ».
"""

import ctypes
import logging
import os
import re
import subprocess
import time
import unicodedata
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus

import psutil

log = logging.getLogger("capri")


def plain(text: str) -> str:
    text = unicodedata.normalize("NFD", str(text).lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in text if unicodedata.category(c) != "Mn")).strip()


# --- Programmes -------------------------------------------------------------

# Noms courants → commande Windows (pour ce qui n'a pas de raccourci dans le menu Démarrer).
BUILTIN = {
    "bloc notes": "notepad", "notepad": "notepad", "calculatrice": "calc", "calc": "calc",
    "paint": "mspaint", "explorateur": "explorer", "explorateur de fichiers": "explorer",
    "gestionnaire des taches": "taskmgr", "invite de commandes": "cmd", "terminal": "wt",
    "powershell": "powershell", "parametres": "ms-settings:", "reglages": "ms-settings:",
    "panneau de configuration": "control", "outil capture": "ms-screenclip:",
    "capture d ecran": "ms-screenclip:", "horloge": "ms-clock:", "meteo": "bingweather:",
    "microsoft store": "ms-windows-store:", "vs code": "code", "vscode": "code", "store": "ms-windows-store:",
}

_START_MENUS = [
    Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "Microsoft/Windows/Start Menu/Programs",
    Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
    Path.home() / "Desktop",
    Path(os.environ.get("PUBLIC", r"C:\Users\Public")) / "Desktop",
]
_SKIP = re.compile(r"uninstall|desinstall|readme|help|aide|manual|website|site web", re.I)


def _shortcuts() -> dict[str, Path]:
    found: dict[str, Path] = {}
    for root in _START_MENUS:
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if p.suffix.lower() in (".lnk", ".url") and not _SKIP.search(p.stem):
                found.setdefault(plain(p.stem), p)
    return found


def _best_match(name: str, choices) -> str | None:
    """Le choix qui ressemble le plus au nom demandé (exact, puis début, puis contenu)."""
    want = plain(name)
    if not want:
        return None
    choices = list(choices)
    if want in choices:
        return want
    for test in (lambda c: c.startswith(want), lambda c: want in c,
                 lambda c: all(w in c for w in want.split()), lambda c: c and c in want):
        hits = sorted((c for c in choices if test(c)), key=len)
        if hits:
            return hits[0]
    return None


def _window_ids() -> set[int]:
    from . import eyes
    return {w.hwnd for w in eyes.windows()}


def _await_window(before: set[int], timeout: float = 8.0) -> str:
    """Attend la fenêtre du programme qu'on vient de lancer : c'est là qu'elle agira ensuite."""
    from . import eyes, hands
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(0.3)
        fresh = [w for w in eyes.windows() if w.hwnd not in before]
        if fresh:
            time.sleep(0.6)  # le temps que la fenêtre soit prête à recevoir le clavier
            eyes.focus(fresh[0])
            hands.target(fresh[0])
            return f" Sa fenêtre « {fresh[0].title} » est au premier plan."
    return " (Aucune nouvelle fenêtre vue : il était peut-être déjà ouvert, ou il s'ouvre en arrière-plan.)"


def _running_window(nom: str):
    """La fenêtre d'un programme déjà lancé (par son nom de programme, pas un titre d'onglet au hasard)."""
    from . import eyes
    want = plain(nom)
    alias = BUILTIN.get(_best_match(nom, BUILTIN) or "", "")
    names = {want, plain(alias)} - {""}
    for w in eyes.windows():
        app = plain(w.app)
        if app in names or any(n and (app.startswith(n) or n.startswith(app)) and len(app) > 2 for n in names):
            return w
    return None


def open_app(nom: str) -> str:
    # déjà lancé : on le ramène à l'écran (même s'il était réduit) au lieu d'en ouvrir un deuxième
    if (win := _running_window(nom)) is not None:
        from . import eyes, hands
        eyes.focus(win)
        hands.target(win)
        return f"« {win.title} » était déjà ouvert : remis au premier plan{' (il était réduit)' if win.minimized else ''}."
    if plain(nom) in ("navigateur", "internet", "browser", "le navigateur", "web"):
        webbrowser.open("https://www.google.com")
        return "Navigateur ouvert."
    key = _best_match(nom, BUILTIN)
    if key:
        before = _window_ids()
        os.startfile(BUILTIN[key]) if ":" in BUILTIN[key] else subprocess.Popen(BUILTIN[key], shell=True)
        return f"« {nom} » est lancé." + _await_window(before)
    shortcuts = _shortcuts()
    key = _best_match(nom, shortcuts)
    if not key:
        return f"ÉCHEC : aucun programme nommé « {nom} » trouvé sur ce PC."
    before = _window_ids()
    os.startfile(shortcuts[key])
    return f"« {shortcuts[key].stem} » est lancé." + _await_window(before)


def _processes(nom: str) -> tuple[str, list[psutil.Process]]:
    procs: dict[str, list[psutil.Process]] = {}
    for p in psutil.process_iter(["name"]):
        n = p.info["name"] or ""
        if n.lower().endswith(".exe"):
            procs.setdefault(plain(n[:-4]), []).append(p)
    # « bloc-notes » → notepad, etc.
    alias = BUILTIN.get(_best_match(nom, BUILTIN) or "", "")
    key = _best_match(alias, procs) if alias and ":" not in alias else None
    key = key or _best_match(nom, procs)
    return (key or "", procs.get(key, []) if key else [])


PROTECTED = {"explorer", "svchost", "csrss", "winlogon", "lsass", "services", "system", "dwm",
             "python", "pythonw", "ollama", "ollama app", "llama server", "electron", "capri", "smss",
             "wininit", "fontdrvhost"}


def close_app_check(nom: str) -> str | None:
    key, procs = _processes(nom)
    if not procs:
        return f"ÉCHEC : « {nom} » n'est pas ouvert."
    if key in PROTECTED:
        return f"REFUSÉ : « {key} » est un processus système ou fait partie de Capri, on n'y touche pas."
    return None


def close_app(nom: str) -> str:
    if problem := close_app_check(nom):
        return problem
    key, procs = _processes(nom)
    for p in procs:
        try:
            p.terminate()
        except psutil.Error:
            pass
    _, alive = psutil.wait_procs(procs, timeout=3)
    return f"« {key} » est fermé." if not alive else f"« {key} » ne s'est pas entièrement fermé."


# --- Web --------------------------------------------------------------------

SEARCH = {
    "google": "https://www.google.com/search?q={}",
    "youtube": "https://www.youtube.com/results?search_query={}",
    "wikipedia": "https://fr.wikipedia.org/w/index.php?search={}",
    "images": "https://www.google.com/search?tbm=isch&q={}",
    "maps": "https://www.google.com/maps/search/{}",
    "amazon": "https://www.amazon.fr/s?k={}",
}


def open_site(adresse: str) -> str:
    url = adresse.strip()
    if not re.match(r"^https?://", url, re.I):
        if " " in url or "." not in url:
            return search_web(url)
        url = "https://" + url
    webbrowser.open(url)
    return f"{url} est ouvert dans le navigateur."


def search_web(recherche: str, site: str = "google") -> str:
    tpl = SEARCH.get(plain(site), SEARCH["google"])
    webbrowser.open(tpl.format(quote_plus(recherche)))
    return f"Recherche « {recherche} » ouverte ({site})."


# --- Dossiers ---------------------------------------------------------------

def _folders() -> dict[str, Path]:
    home = Path.home()
    one = Path(os.environ.get("OneDrive", home / "OneDrive"))
    def pick(*names):
        for n in names:
            for base in (home, one):
                if (base / n).is_dir():
                    return base / n
        return home / names[0]
    return {
        "bureau": pick("Desktop", "Bureau"), "documents": pick("Documents"),
        "telechargements": pick("Downloads"), "images": pick("Pictures", "Images"),
        "musique": pick("Music", "Musique"), "videos": pick("Videos", "Vidéos"),
        "dossier personnel": home, "capri": Path(__file__).resolve().parents[2],
    }


def open_folder(nom: str) -> str:
    folders = _folders()
    key = _best_match(nom.replace("mes ", ""), folders)
    if key:
        os.startfile(folders[key])
        return f"Dossier {folders[key]} ouvert."
    path = Path(os.path.expandvars(nom)).expanduser()
    if path.is_dir():
        os.startfile(path)
        return f"Dossier {path} ouvert."
    return f"ÉCHEC : dossier « {nom} » introuvable."


# --- Son et médias ----------------------------------------------------------

_KEYS = {"lecture_pause": 0xB3, "suivant": 0xB0, "precedent": 0xB1, "stop": 0xB2,
         "muet": 0xAD, "baisser": 0xAE, "monter": 0xAF}


def _press(vk: int) -> None:
    ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
    ctypes.windll.user32.keybd_event(vk, 0, 2, 0)


def _volume_ctl():
    from pycaw.pycaw import AudioUtilities
    return AudioUtilities.GetSpeakers().EndpointVolume


def volume(action: str, niveau: int | None = None) -> str:
    action = plain(action).replace(" ", "_")
    try:
        import comtypes
        comtypes.CoInitialize()
        ctl = _volume_ctl()
        now = round(ctl.GetMasterVolumeLevelScalar() * 100)
        if action in ("regler", "mettre", "fixer") and niveau is not None:
            target = max(0, min(100, int(niveau)))
        elif action == "monter":
            target = min(100, now + int(niveau or 10))
        elif action == "baisser":
            target = max(0, now - int(niveau or 10))
        elif action in ("couper", "muet"):
            ctl.SetMute(1, None)
            return "Son coupé."
        elif action in ("remettre", "reactiver", "demuet"):
            ctl.SetMute(0, None)
            return f"Son remis, volume à {now} %."
        else:
            return f"Volume actuel : {now} %{' (coupé)' if ctl.GetMute() else ''}."
        ctl.SetMute(0, None)
        ctl.SetMasterVolumeLevelScalar(target / 100, None)
        return f"Volume réglé à {target} %."
    except Exception as e:  # pas de carte son, pycaw absent…
        log.info("Volume via pycaw impossible (%s), touches multimédia à la place", e)
        if action in ("couper", "muet"):
            _press(_KEYS["muet"])
            return "Son coupé."
        if action in ("monter", "baisser"):
            for _ in range(max(1, int(niveau or 10) // 2)):
                _press(_KEYS[action])
            return f"Volume {'monté' if action == 'monter' else 'baissé'}."
        return "ÉCHEC : réglage du volume impossible."


def media(action: str) -> str:
    key = plain(action).replace(" ", "_")
    key = {"pause": "lecture_pause", "lecture": "lecture_pause", "play": "lecture_pause",
           "reprendre": "lecture_pause", "next": "suivant", "precedente": "precedent",
           "previous": "precedent"}.get(key, key)
    if key in ("j_aime", "like", "aleatoire", "repeter"):  # boutons de Spotify, pas des touches multimédia
        from . import apps
        return apps.control("spotify", "j_aime" if key == "like" else key)
    if key not in ("lecture_pause", "suivant", "precedent", "stop"):
        return f"ÉCHEC : action média inconnue « {action} »."
    _press(_KEYS[key])
    return {"lecture_pause": "Lecture/pause envoyé.", "suivant": "Piste suivante.",
            "precedent": "Piste précédente.", "stop": "Lecture arrêtée."}[key]


# --- Système ----------------------------------------------------------------

def system_info() -> str:
    cpu = psutil.cpu_percent(interval=0.3)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage(os.environ.get("SystemDrive", "C:") + "\\")
    lines = [f"Processeur utilisé à {cpu:.0f} %",
             f"mémoire vive à {ram.percent:.0f} % ({ram.used / 2**30:.1f} Go sur {ram.total / 2**30:.0f} Go)",
             f"disque système : {disk.free / 2**30:.0f} Go libres sur {disk.total / 2**30:.0f} Go"]
    if (bat := psutil.sensors_battery()) is not None:
        lines.append(f"batterie à {bat.percent:.0f} %{' en charge' if bat.power_plugged else ''}")
    top = sorted(psutil.process_iter(["name", "memory_info"]),
                 key=lambda p: p.info["memory_info"].rss if p.info["memory_info"] else 0, reverse=True)[:3]
    lines.append("programmes les plus gourmands en mémoire : " +
                 ", ".join(f"{p.info['name']} ({p.info['memory_info'].rss / 2**20:.0f} Mo)" for p in top))
    return " ; ".join(lines) + "."


def power(action: str) -> str:
    action = plain(action)
    if action in ("verrouiller", "verrouille", "lock"):
        ctypes.windll.user32.LockWorkStation()
        return "PC verrouillé."
    cmd = {"eteindre": "shutdown /s /t 30", "redemarrer": "shutdown /r /t 30",
           "veille": "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
           "annuler": "shutdown /a"}.get(action)
    if not cmd:
        return f"ÉCHEC : action « {action} » inconnue."
    subprocess.Popen(cmd, shell=True)
    return {"eteindre": "Extinction dans 30 secondes (dis « annule » pour l'arrêter).",
            "redemarrer": "Redémarrage dans 30 secondes (dis « annule » pour l'arrêter).",
            "veille": "Mise en veille.", "annuler": "Extinction annulée."}[action]


# --- Catalogue des outils (format OpenAI / Ollama) --------------------------

@dataclass
class Tool:
    fn: callable
    description: str
    params: dict
    required: list
    risky: callable = None  # (args) -> bool : demande un « oui » avant d'agir

    def schema(self, name: str) -> dict:
        return {"type": "function", "function": {
            "name": name, "description": self.description,
            "parameters": {"type": "object", "properties": self.params, "required": self.required}}}


def _s(desc: str, enum: list | None = None) -> dict:
    return {"type": "string", "description": desc, **({"enum": enum} if enum else {})}


TOOLS: dict[str, Tool] = {
    "ouvrir_programme": Tool(open_app, "Lance un programme ou un jeu installé sur le PC (Spotify, Discord, Steam, bloc-notes, calculatrice…).",
                             {"nom": _s("Nom du programme, tel que l'utilisateur le dit")}, ["nom"]),
    "fermer_programme": Tool(close_app, "Ferme un programme ouvert.",
                             {"nom": _s("Nom du programme à fermer")}, ["nom"], risky=lambda a: True),
    "ouvrir_site": Tool(open_site, "Ouvre un site web dans le navigateur.",
                        {"adresse": _s("Adresse du site, par ex. youtube.com")}, ["adresse"]),
    "rechercher_web": Tool(search_web, "Lance une recherche dans le navigateur (Google, YouTube…). Tu ne vois pas les résultats.",
                           {"recherche": _s("Ce qu'il faut chercher"),
                            "site": _s("Où chercher", list(SEARCH))}, ["recherche"]),
    "ouvrir_dossier": Tool(open_folder, "Ouvre un dossier dans l'explorateur de fichiers.",
                           {"nom": _s("bureau, documents, téléchargements, images, musique, vidéos, ou un chemin")}, ["nom"]),
    "volume": Tool(volume, "Règle le volume du son du PC, ou le consulte.",
                   {"action": _s("Ce qu'il faut faire", ["regler", "monter", "baisser", "couper", "remettre", "consulter"]),
                    "niveau": {"type": "integer", "description": "Pourcentage : niveau visé pour « regler », ou de combien monter/baisser (10 par défaut)"}},
                   ["action"]),
    "musique": Tool(media, "Contrôle la musique ou la vidéo en cours (Spotify, YouTube…).",
                    {"action": _s("Commande", ["lecture_pause", "suivant", "precedent", "stop"])}, ["action"]),
    "etat_du_pc": Tool(system_info, "Donne l'état du PC : processeur, mémoire, disque, programmes gourmands.", {}, []),
    "alimentation": Tool(power, "Verrouille, met en veille, éteint ou redémarre le PC, ou annule une extinction prévue.",
                         {"action": _s("Action", ["verrouiller", "veille", "eteindre", "redemarrer", "annuler"])}, ["action"],
                         risky=lambda a: plain(a.get("action", "")) in ("veille", "eteindre", "redemarrer")),
}

TOOL_SCHEMAS = [tool.schema(name) for name, tool in TOOLS.items()]


def describe(name: str, args: dict) -> str:
    """Phrase courte décrivant l'action, pour la demande de confirmation."""
    if name == "controler_appli":
        return f"fermer la fenêtre de « {args.get('appli', '?')} »"
    if name == "fermer_programme":
        return f"fermer « {args.get('nom', '?')} »"
    if name == "alimentation":
        return {"veille": "mettre le PC en veille", "eteindre": "éteindre le PC",
                "redemarrer": "redémarrer le PC"}.get(plain(args.get("action", "")), name)
    if reason := hands.risk(name, args or {}):
        return reason
    return f"{name} {args}"


def run(name: str, args: dict) -> str:
    tool = TOOLS.get(name)
    if not tool:
        return f"ÉCHEC : outil « {name} » inconnu."
    args = {k: v for k, v in (args or {}).items() if k in tool.params and v not in (None, "")}
    missing = [k for k in tool.required if k not in args]
    if missing:
        return f"ÉCHEC : il manque {', '.join(missing)}."
    try:
        result = tool.fn(**args)
    except Exception as e:
        log.exception("Action %s échouée", name)
        result = f"ÉCHEC : {e.__class__.__name__}: {e}"
    log.info("Action %s %s → %s", name, args, result)
    return result


SETTINGS: dict = {}  # section [mains] des réglages (le hub la modifie)


def needs_confirmation(name: str, args: dict) -> bool:
    if not SETTINGS.get("confirmer", True):
        # il a choisi qu'elle agisse sans demander ; éteindre ou redémarrer le PC reste confirmé
        # (une phrase mal entendue au micro ne doit pas couper son travail)
        return name == "alimentation" and plain((args or {}).get("action", "")) in ("eteindre", "redemarrer")
    if hands.risk(name, args or {}):
        return True
    tool = TOOLS.get(name)
    if not tool or not tool.risky or not tool.risky(args or {}):
        return False
    # Inutile de demander « tu es sûr ? » pour un programme qui n'est même pas ouvert.
    return not (name == "fermer_programme" and close_app_check(str((args or {}).get("nom", ""))))


YES = re.compile(r"^\W*(oui|ouais|ouai|yes|ok|okay|d'accord|dac|vas[- ]y|go|fais[- ]le|confirme|bien s[uû]r|carr[ée]ment|exact|c'est [çc]a)\b", re.I)


# Mots qui laissent penser que l'utilisateur demande une action (filtre rapide avant le vrai choix).
HINT = re.compile(r"\b(ouvr|lanc|demarr|ferm|quitt|mont|baiss|augment|diminu|coupe|couper|volume|son|musique|pause|"
                  r"repren|suivant|precedent|chanson|morceau|cherch|recherch|google|youtube|site|dossier|"
                  r"eteins|eteindre|redemarr|veille|verrouill|rame|lent|processeur|ram|memoire vive|"
                  r"met|mets|joue|stop|annul|spotify|discord|steam|navigateur|programme|appli|jeu|derang|tranquille|"
                  r"silence|calme|message|ecrit|reparl|regard|vois|voir|vu|lis|lire|ecran|fenetre|onglet|clique|tape|"
                  r"ecris|ecrire|repond|envoi|video|page|va sur|trouve|fais|montre|affiche|quoi sur|mute|sourdine|deafen|onglet|reduis|agrandis|"
                  r"repos|tais|chut|reviens|reparle|rappel|minuteur|alarme|reveille|remind|timer|alarm|aller dans|va dans|playlist|titres? like|liked|"
                  # « réessaie », « rouvre », « ça a pas marché » : refaire ce qui a raté
                  r"reessa|recommenc|refai|retent|rouvr|pas marche|bloc.?notes?|notepad|ecriv|"
                  # en anglais
                  r"open|launch|start|close|quit|turn (up|down|off)|volume|sound|music|song|play|resume|next|previous|skip|"
                  r"search|look up|website|folder|shut ?down|restart|lock|slow|lag|cpu|browser|program|app|game|"
                  r"disturb|leave me alone|quiet|write|type|read|look|see|watch|screen|window|tab|click|reply|send|"
                  r"go to|find|show|mute|deafen|minimi|maximi|rest time|shut up|come back|retry|try again|again|didn.?t work)", re.I)

PLANNER_PROMPT = """Tu es le module qui pilote le PC Windows de l'utilisateur pour Capri, son IA compagne. Tu vois les fenêtres et tu contrôles la souris et le clavier grâce à tes outils.
Lis le dernier message de l'utilisateur. S'il demande d'agir sur le PC ou de regarder ce qu'il y a à l'écran, accomplis-le avec tes outils, étape par étape : après chaque outil tu reçois son résultat, puis tu choisis l'étape suivante.
Méthode :
- Pour savoir ce qu'il y a dans une fenêtre (messages, résultats YouTube, page web…), utilise lire_fenetre : c'est rapide et exact. Utilise regarder_ecran pour les images, vidéos, jeux, ou si lire_fenetre ne donne rien d'utile.
- Avant de cliquer ou d'écrire, lis la fenêtre pour avoir les numéros [n] à jour. Après un clic qui change la page, relis-la.
- Les raccourcis aident : ctrl+l (barre d'adresse), ctrl+t (nouvel onglet), ctrl+f (chercher), alt+tab, echap.
- N'invente jamais un numéro d'élément. Si tu es bloqué après plusieurs essais, arrête.
- Un texte à écrire de sa part : écris-le comme Capri, une jeune femme, à la première personne, en le tutoyant, avec son style taquin et attaché (jamais « (e) » ni « (ne) »), dans la langue de l'utilisateur. Tape-le en une seule fois, puis ne le retape pas.
- Quand c'est fait (ou impossible), n'appelle plus d'outil et réponds seulement : fini.
Sinon (simple discussion, question sur un sujet, avis), n'appelle aucun outil et réponds seulement : aucune.
Exemples : « ouvre Spotify » → ouvrir_programme(nom="Spotify") ; « mets le son à 30 » → volume(action="regler", niveau=30) ; « chanson suivante » → musique(action="suivant") ; « cherche des crêpes sur YouTube » → rechercher_web(recherche="crêpes", site="youtube") ; « lance la première vidéo » → lire_fenetre(nom="YouTube") puis cliquer(element=le numéro du premier titre de vidéo) ; « j'ai des messages sur Discord ? » → lire_fenetre(nom="Discord") ; « qu'est-ce qu'il y a sur mon écran ? » → regarder_ecran() ; « mon PC rame » → etat_du_pc() ; « laisse-moi tranquille une heure » → ne_pas_deranger(minutes=60) ; « Capri, temps de repos » ou « pause Capri » → ne_pas_deranger(minutes=120) ; « c'est bon tu peux revenir » → ne_pas_deranger(minutes=0) ; « on m'a écrit quoi sur Discord ? » → lire_fenetre(nom="Discord") ; « mute-moi sur Discord » → controler_appli(appli="discord", action="micro") ; « mets-moi en sourdine » → controler_appli(appli="discord", action="sourdine") ; « like cette musique » → controler_appli(appli="spotify", action="j_aime") ; « va dans mes titres likés » ou « ouvre ma playlist titres likés » → controler_appli(appli="spotify", action="titres_likes") ; « ferme cet onglet » → controler_appli(appli="navigateur", action="fermer_onglet") ; « réduis Spotify » → controler_appli(appli="spotify", action="reduire") ; « réessaie », « refais-le », « try again », « ça a pas marché » → refais la dernière demande d'action de l'utilisateur, même si Capri prétend l'avoir déjà faite ; « open notepad and write hi » → ouvrir_programme(nom="bloc-notes") puis ecrire(texte="hi") ; « turn the volume down » → volume(action="baisser") ; « rappelle-moi d'appeler maman dans 20 minutes » → creer_rappel(texte="appeler maman", dans_minutes=20) ; « rappelle-moi tous les jours à 9 h de prendre mes médicaments » → creer_rappel(texte="prendre tes médicaments", heure="09:00", repetition="quotidienne") ; « redis-le-moi dans 10 minutes » (juste après un rappel) → reporter_rappel(minutes=10) ; « annule le rappel pour maman » → annuler_rappel(texte="maman") ; « j'ai quoi comme rappels ? » → lister_rappels() ; « tu aimes la musique ? » → aucune ; « do you like music? » → aucune."""


def note(results: list[str]) -> str:
    """Ce que Capri apprend de ses mains, juste avant de répondre (à reformuler, jamais à citer)."""
    facts = "\n".join(f"- {r}" for r in results)
    return ("[NOTE INTERNE, invisible pour lui, ne la cite pas] Ce que tes mains viennent réellement de faire "
            "sur le PC pour ce message :\n" + facts +
            "\nRéponds en le disant avec tes mots, en UNE phrase courte, sans question ni proposition. Si quelque chose a échoué ou a été refusé, "
            "dis-le franchement. Ne prétends rien de plus que cette note, et n'invente aucun chiffre. Ce qui n'est pas "
            "dans cette liste, tu ne l'as PAS fait : rien effacé, rien fermé, rien envoyé, rien coloré.")


# Ce qu'elle dit en commençant à agir : sa voix part pendant que ses mains travaillent, pas après.
_ASIDE_KIND = {"ouvrir_programme": "ouvrir", "ouvrir_site": "ouvrir", "ouvrir_dossier": "ouvrir", "fermer_programme": "fermer",
               "rechercher_web": "chercher", "lire_fenetre": "regarder", "voir_fenetres": "regarder",
               "regarder_ecran": "regarder", "etat_du_pc": "regarder", "ecrire": "ecrire"}
ASIDES = {
    "fr": {"ouvrir": ["J'ouvre ça.", "Je te l'ouvre.", "C'est parti, j'ouvre."], "fermer": ["Je ferme ça.", "Hop, je ferme."],
           "chercher": ["Je cherche.", "Je te trouve ça."], "regarder": ["Attends, je regarde.", "Je jette un œil."],
           "ecrire": ["J'écris.", "Je tape ça."], "autre": ["Je m'en occupe.", "Deux secondes."]},
    "en": {"ouvrir": ["Opening it.", "On it, opening that.", "Here, let me open it."], "fermer": ["Closing it.", "Shutting that."],
           "chercher": ["Looking it up.", "Let me find that."], "regarder": ["Hang on, let me look.", "Let me take a look."],
           "ecrire": ["Typing it.", "Writing it now."], "autre": ["On it.", "One sec."]},
}


def aside(name: str, lang: str) -> str:
    import random
    return random.choice(ASIDES["en" if lang == "en" else "fr"][_ASIDE_KIND.get(name, "autre")])


def nothing_done(asked: bool = True) -> str:
    """Le message parlait du PC mais ses mains n'ont rien fait : qu'elle ne prétende pas le contraire."""
    note = ("[NOTE INTERNE, invisible pour lui, ne la cite pas] Pour ce message, tes mains n'ont RIEN fait sur le PC : "
            "aucun programme ouvert, rien écrit, rien cliqué, aucune musique lancée. Ne dis pas que tu le fais ou que tu "
            "l'as fait.")
    if asked:
        note += " S'il te demandait d'agir sur le PC, avoue franchement que ça n'a pas marché cette fois, en une phrase."
    return note


# --- Vie : ne pas déranger, messages Discord --------------------------------

QUIET_UNTIL = 0.0


def quiet() -> bool:
    """Vrai tant que l'utilisateur a demandé de ne pas être dérangé."""
    return time.time() < QUIET_UNTIL


def do_not_disturb(minutes: int = 60) -> str:
    global QUIET_UNTIL
    minutes = max(0, min(int(minutes), 24 * 60))
    QUIET_UNTIL = time.time() + minutes * 60
    if not minutes:
        return "Mode « ne pas déranger » terminé : tu peux de nouveau prendre la parole de toi-même."
    return (f"Mode « ne pas déranger » activé pour {minutes} minutes : tu ne prendras pas la parole de toi-même "
            "d'ici là.")


TOOLS["ne_pas_deranger"] = Tool(do_not_disturb, "Empêche Capri de parler spontanément (remarques, accueil) pendant un moment, ou lève cette consigne (0 minute).",
                                {"minutes": {"type": "integer", "description": "Durée en minutes (60 par défaut, 0 pour arrêter le mode)"}}, [])
TOOL_SCHEMAS[:] = [tool.schema(name) for name, tool in TOOLS.items()]


# --- Yeux et mains : fenêtres, souris, clavier ---------------------------------

from . import eyes, hands  # noqa: E402


def look_windows() -> str:
    return eyes.summary()


def read_window(nom: str = "") -> str:
    win = eyes.find_window(nom or None)
    if not win:
        return f"ÉCHEC : aucune fenêtre « {nom} »."
    try:
        return eyes.read_window(win)
    except Exception:
        # Discord et les navigateurs refusent parfois la lecture pendant qu'ils changent de page : on réessaie
        time.sleep(0.8)
        return eyes.read_window(eyes.find_window(nom or None) or win)


def look_screen(nom: str = "") -> str:
    win = eyes.find_window(nom) if nom else None
    if nom and not win:
        return f"ÉCHEC : aucune fenêtre « {nom} »."
    if win and win.minimized:
        eyes.focus(win)
        win = eyes.find_window(nom)
    image, _ = eyes.screenshot(win)
    eyes.SHOT["image"] = image
    where = f"de la fenêtre « {win.title} »" if win else "de tout l'écran"
    return (f"Capture {where} jointe juste après. Pour cliquer sur quelque chose qu'elle montre, utilise "
            "cliquer_position avec x et y de 0 à 1000 sur l'image.")


def _int(desc: str) -> dict:
    return {"type": "integer", "description": desc}


def _bool(desc: str) -> dict:
    return {"type": "boolean", "description": desc}


TOOLS.update({
    "voir_fenetres": Tool(look_windows, "Liste les fenêtres ouvertes sur le PC (titre et programme).", {}, []),
    "lire_fenetre": Tool(read_window, "Lit le texte d'une fenêtre (messages, résultats de recherche, page web…) et liste "
                         "ses éléments cliquables numérotés [n]. À utiliser avant de cliquer ou d'écrire.",
                         {"nom": _s("Titre ou programme de la fenêtre (vide = celle au premier plan)")}, []),
    "regarder_ecran": Tool(look_screen, "Prend une capture d'écran pour voir les images, vidéos, jeux, ou ce que la lecture "
                           "de texte ne donne pas.", {"nom": _s("Fenêtre à capturer (vide = tout l'écran)")}, []),
    "activer_fenetre": Tool(hands.act_focus, "Met une fenêtre au premier plan.", {"nom": _s("Titre ou programme")}, ["nom"]),
    "cliquer": Tool(hands.act_click, "Clique sur un élément numéroté [n] de la dernière lecture de fenêtre.",
                    {"element": _int("Numéro [n] de l'élément"), "double": _bool("Double-clic"),
                     "droit": _bool("Clic droit")}, ["element"]),
    "cliquer_position": Tool(hands.act_click_position, "Clique à une position de la dernière capture d'écran "
                             "(x et y de 0 à 1000 sur l'image).",
                             {"x": _int("Horizontal, 0 à 1000"), "y": _int("Vertical, 0 à 1000"),
                              "double": _bool("Double-clic")}, ["x", "y"]),
    "ecrire": Tool(hands.act_type, "Tape du texte au clavier, dans l'élément [n] s'il est donné, sinon là où est le curseur. "
                   "N'appuie pas sur Entrée (utilise touches).",
                   {"texte": _s("Texte à taper"), "element": _int("Numéro [n] du champ où écrire (optionnel)")}, ["texte"]),
    "touches": Tool(hands.act_keys, "Appuie sur des touches ou raccourcis : « entree », « ctrl+t », « ctrl+l », « alt+tab », "
                    "« echap », « tab », « f5 »… (séparés par des espaces pour plusieurs).",
                    {"touches": _s("Touches")}, ["touches"]),
    "defiler": Tool(hands.scroll, "Fait défiler la fenêtre sous la souris.",
                    {"direction": _s("Sens", ["haut", "bas"]), "amount": _int("Crans (5 par défaut)")}, ["direction"]),
})
TOOL_SCHEMAS[:] = [tool.schema(name) for name, tool in TOOLS.items()]
# Outils qui touchent souris/clavier : la bordure lumineuse s'allume pendant qu'elle les utilise.
HANDS = {"activer_fenetre", "cliquer", "cliquer_position", "ecrire", "touches", "defiler"}


# --- Actions prêtes sur les applis (Discord, Spotify, navigateur) et sur les fenêtres -------

from . import apps  # noqa: E402

# --- Rappels -----------------------------------------------------------------------------

from . import reminders  # noqa: E402

TOOLS.update({
    "creer_rappel": Tool(reminders.creer, "Programme un rappel : elle le lui dira au bon moment. Donne SOIT dans_minutes "
                         "(« dans 20 minutes »), SOIT heure au format HH:MM (24 h), éventuellement jour (« demain » ou AAAA-MM-JJ).",
                         {"texte": _s("Ce qu'il faut lui rappeler, court"), "dans_minutes": _int("Dans combien de minutes"),
                          "heure": _s("Heure HH:MM"), "jour": _s("« demain » ou une date AAAA-MM-JJ (vide = la prochaine fois que cette heure arrive)"),
                          "repetition": _s("Répétition", reminders.REPEATS), "discret": _bool("Juste une bulle, sans le dire à voix haute")},
                         ["texte"]),
    "lister_rappels": Tool(reminders.lister, "Liste les rappels prévus.", {}, []),
    "annuler_rappel": Tool(reminders.annuler, "Annule un rappel prévu (d'après son texte ou son numéro).",
                           {"texte": _s("Mots du rappel à annuler"), "numero": _int("Numéro du rappel")}, []),
    "reporter_rappel": Tool(reminders.reporter, "Reporte le rappel qui vient de sonner (« rappelle-moi dans 10 minutes »).",
                            {"minutes": _int("Dans combien de minutes"), "texte": _s("Mots du rappel (vide = le dernier)")}, ["minutes"]),
})

TOOLS["controler_appli"] = Tool(
    apps.control,
    "Action directe sur une appli ou une fenêtre ouverte, sans avoir à lire ni cliquer. "
    "Discord : micro (te rendre muet / réactiver), sourdine (deafen), raccrocher, camera. "
    "Spotify : lecture_pause, suivant, precedent, aleatoire, repeter, j_aime (liker la chanson EN COURS), "
    "titres_likes (ouvrir la page de ses titres likés). "
    "Navigateur (Brave, Chrome…) : nouvel_onglet, fermer_onglet, rouvrir_onglet, onglet_suivant, onglet_precedent, "
    "retour, avancer, recharger, plein_ecran, zoom_plus, zoom_moins, pause_video, muet_video. "
    "N'importe quelle fenêtre : premier_plan, reduire, agrandir, restaurer, fermer.",
    {"appli": _s("discord, spotify, navigateur, ou le nom d'un programme ouvert"), "action": _s("Action à faire")},
    ["appli", "action"],
    risky=lambda a: plain(a.get("action", "")) == "fermer",
)
TOOL_SCHEMAS[:] = [tool.schema(name) for name, tool in TOOLS.items()]
HANDS.add("controler_appli")

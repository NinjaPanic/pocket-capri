"""Mémoire persistante de Capri : historique des conversations et souvenirs à long terme.

Tout est dans un seul fichier SQLite, partagé par tous les appareils qui se connectent
au cerveau (PC aujourd'hui, téléphone plus tard).
"""

import sqlite3
import threading
import time
from pathlib import Path

import numpy as np

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    ts REAL NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    mood TEXT,
    client TEXT
);
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    ts REAL NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS summaries (
    day TEXT PRIMARY KEY,
    ts REAL NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB
);
CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

# Au-delà de cette similarité, c'est la même info reformulée : on fusionne.
# Plus bas, « aime le café » et « aime le thé » (0.91) seraient confondus.
DUPLICATE_THRESHOLD = 0.975


class Memory:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        self._load_vectors()

    # --- Conversation -------------------------------------------------------

    def add_message(self, role: str, content: str, client: str, mood: str | None = None) -> None:
        with self._lock, self.db:
            self.db.execute(
                "INSERT INTO messages (ts, role, content, mood, client) VALUES (?, ?, ?, ?, ?)",
                (time.time(), role, content, mood, client),
            )

    def recent_messages(self, limit: int) -> list[dict]:
        with self._lock:
            rows = self.db.execute(
                "SELECT id, ts, role, content, mood, client FROM messages ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [
            {"id": i, "ts": ts, "role": role, "content": content, "mood": mood, "client": client}
            for i, ts, role, content, mood, client in reversed(rows)
        ]

    def last_message_ts(self) -> float | None:
        with self._lock:
            row = self.db.execute("SELECT ts FROM messages ORDER BY id DESC LIMIT 1").fetchone()
        return row[0] if row else None

    # --- Souvenirs ----------------------------------------------------------

    def _load_vectors(self) -> None:
        rows = self.db.execute("SELECT id, content, embedding FROM memories ORDER BY id").fetchall()
        self._ids = [r[0] for r in rows]
        self._texts = [r[1] for r in rows]
        vectors = [np.frombuffer(r[2], dtype=np.float32) for r in rows]
        self._matrix = np.vstack(vectors) if vectors else None

    @staticmethod
    def _normalize(embedding: list[float]) -> np.ndarray:
        v = np.asarray(embedding, dtype=np.float32)
        return v / (np.linalg.norm(v) or 1.0)

    def _scores(self, v: np.ndarray) -> np.ndarray | None:
        if self._matrix is None or self._matrix.shape[1] != v.shape[0]:
            return None
        return self._matrix @ v

    def add_memory(self, content: str, embedding: list[float], replaces: int | None = None) -> str:
        """Ajoute un souvenir, ou met à jour `replaces` / un quasi-doublon. Renvoie "added" ou "updated"."""
        v = self._normalize(embedding)
        with self._lock, self.db:
            scores = self._scores(v)
            mem_id = replaces if replaces in self._ids else None
            if mem_id is None and scores is not None and scores.max() >= DUPLICATE_THRESHOLD:
                mem_id = self._ids[int(scores.argmax())]
            if mem_id is not None:
                self.db.execute(
                    "UPDATE memories SET ts = ?, content = ?, embedding = ? WHERE id = ?",
                    (time.time(), content, v.tobytes(), mem_id),
                )
                result = "updated"
            else:
                self.db.execute(
                    "INSERT INTO memories (ts, content, embedding) VALUES (?, ?, ?)",
                    (time.time(), content, v.tobytes()),
                )
                result = "added"
            self._load_vectors()
        return result

    def search(self, embedding: list[float], k: int, min_score: float = 0.35) -> list[tuple[int, str]]:
        """Renvoie les (id, texte) des souvenirs les plus proches."""
        v = self._normalize(embedding)
        with self._lock:
            scores = self._scores(v)
            if scores is None:
                return []
            best = np.argsort(-scores)[:k]
            return [(self._ids[i], self._texts[i]) for i in best if scores[i] >= min_score]

    # --- Résumés de vos journées (sa mémoire à long terme) -------------------

    def days_to_summarize(self, limit: int = 3) -> list[str]:
        """Les journées passées (pas aujourd'hui) où vous vous êtes parlé et qu'elle n'a pas encore résumées."""
        with self._lock:
            rows = self.db.execute(
                "SELECT DISTINCT date(ts, 'unixepoch', 'localtime') AS d FROM messages "
                "WHERE d < date('now', 'localtime') AND d NOT IN (SELECT day FROM summaries) ORDER BY d DESC LIMIT ?",
                (limit,)).fetchall()
        return [r[0] for r in rows]

    def messages_of_day(self, day: str) -> list[dict]:
        with self._lock:
            rows = self.db.execute(
                "SELECT ts, role, content FROM messages WHERE date(ts, 'unixepoch', 'localtime') = ? ORDER BY id",
                (day,)).fetchall()
        return [{"ts": ts, "role": role, "content": c} for ts, role, c in rows]

    def add_summary(self, day: str, content: str, embedding: list[float] | None) -> None:
        blob = self._normalize(embedding).tobytes() if embedding else None
        with self._lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO summaries (day, ts, content, embedding) VALUES (?, ?, ?, ?)",
                            (day, time.time(), content, blob))

    def summaries(self, limit: int = 60) -> list[dict]:
        with self._lock:
            rows = self.db.execute("SELECT day, content FROM summaries ORDER BY day DESC LIMIT ?", (limit,)).fetchall()
        return [{"day": d, "content": c} for d, c in rows]

    def summary_of(self, day: str) -> str | None:
        with self._lock:
            row = self.db.execute("SELECT content FROM summaries WHERE day = ?", (day,)).fetchone()
        return row[0] if row else None

    def search_summaries(self, embedding: list[float], k: int = 2, min_score: float = 0.45) -> list[dict]:
        """Les journées dont le résumé ressemble le plus à ce dont il parle."""
        v = self._normalize(embedding)
        with self._lock:
            rows = self.db.execute("SELECT day, content, embedding FROM summaries WHERE embedding IS NOT NULL").fetchall()
        scored = []
        for day, content, blob in rows:
            e = np.frombuffer(blob, dtype=np.float32)
            if e.shape == v.shape:
                scored.append((float(e @ v), day, content))
        return [{"day": d, "content": c} for s, d, c in sorted(scored, reverse=True)[:k] if s >= min_score]

    def count(self) -> int:
        return len(self._ids)

    def list_memories(self) -> list[dict]:
        with self._lock:
            rows = self.db.execute("SELECT id, ts, content FROM memories ORDER BY ts DESC").fetchall()
        return [{"id": i, "ts": ts, "content": c} for i, ts, c in rows]

    def update_memory(self, mem_id: int, content: str, embedding: list[float]) -> bool:
        """Il a corrigé ce souvenir dans le hub : nouveau texte, nouvelle empreinte pour le retrouver."""
        v = self._normalize(embedding)
        with self._lock, self.db:
            cur = self.db.execute("UPDATE memories SET content = ?, embedding = ? WHERE id = ?", (content, v.tobytes(), mem_id))
            self._load_vectors()
        return cur.rowcount > 0

    def first_message_ts(self) -> float | None:
        with self._lock:
            row = self.db.execute("SELECT ts FROM messages ORDER BY id LIMIT 1").fetchone()
        return row[0] if row else None

    def delete_memory(self, mem_id: int) -> None:
        with self._lock, self.db:
            self.db.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
            self._load_vectors()

    # --- État ---------------------------------------------------------------

    def get_state(self, key: str, default: str) -> str:
        with self._lock:
            row = self.db.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
        return row[0] if row else default

    def set_state(self, key: str, value: str) -> None:
        with self._lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", (key, value))

"""Accès aux modèles de langage : Ollama (sur ce PC) ou un service en ligne au format OpenAI
(OpenAI, Google Gemini, Anthropic Claude, xAI Grok, Groq, Mistral, OpenRouter, DeepSeek)."""

import asyncio
import json
import time
import re
import logging
import os
from dataclasses import dataclass
from collections.abc import AsyncIterator

import httpx

# Services en ligne : nom affiché, adresse de leur API compatible OpenAI, variable d'environnement de la clé, modèle proposé.
PROVIDERS: dict[str, dict] = {
    "groq": {"label": "Groq", "url": "https://api.groq.com/openai/v1", "env": "GROQ_API_KEY",
             "model": "openai/gpt-oss-120b", "keys": "console.groq.com/keys (gratuit, limité : ~1 message/min, ~40/jour)"},
    "google": {"label": "Google Gemini", "url": "https://generativelanguage.googleapis.com/v1beta/openai", "env": "GEMINI_API_KEY",
               "model": "gemini-2.5-flash", "keys": "aistudio.google.com/apikey (gratuit avec limites)"},
    "openai": {"label": "OpenAI", "url": "https://api.openai.com/v1", "env": "OPENAI_API_KEY",
               "model": "gpt-4.1-mini", "keys": "platform.openai.com/api-keys (payant)"},
    "anthropic": {"label": "Anthropic Claude", "url": "https://api.anthropic.com/v1", "env": "ANTHROPIC_API_KEY",
                  "model": "claude-haiku-5-5", "keys": "console.anthropic.com (payant)"},
    "xai": {"label": "xAI Grok", "url": "https://api.x.ai/v1", "env": "XAI_API_KEY",
            "model": "grok-3-mini", "keys": "console.x.ai (payant)"},
    "mistral": {"label": "Mistral", "url": "https://api.mistral.ai/v1", "env": "MISTRAL_API_KEY",
                "model": "mistral-small-latest", "keys": "console.mistral.ai (gratuit avec limites)"},
    "openrouter": {"label": "OpenRouter", "url": "https://openrouter.ai/api/v1", "env": "OPENROUTER_API_KEY",
                   "model": "openrouter/auto", "keys": "openrouter.ai/keys (certains modèles gratuits)"},
    "deepseek": {"label": "DeepSeek", "url": "https://api.deepseek.com/v1", "env": "DEEPSEEK_API_KEY",
                 "model": "deepseek-chat", "keys": "platform.deepseek.com (payant, peu cher)"},
}

log = logging.getLogger("capri")


# la carte graphique a calé (mémoire partagée avec la voix locale, image trop lourde…) : Ollama relance
# son moteur tout seul, la même demande passe en général au deuxième essai
GPU_CRASH = re.compile(r"cuda|illegal memory|out of memory|runner (process )?(has )?(terminated|exited)|unexpected eof|llama runner", re.I)


_PLAIN = str.maketrans({"\u2011": "-", "\u202f": " ", "\u00a0": " "})  # tirets et espaces insécables


class _GpuCrash(Exception):
    pass


class _Preempted(Exception):
    pass


class LLMError(Exception):
    pass


class _QuotaFull(LLMError):
    """Le service en ligne refuse pour l'instant (quota par minute ou par jour) ; `wait` : secondes avant de réessayer."""
    def __init__(self, message: str, wait: float):
        super().__init__(message)
        self.wait = wait


def _seconds(text: str | None) -> float | None:
    """Durée des en-têtes de quota (« 45.3s », « 24m28.8s », « 120ms », « 7 ») en secondes."""
    if not text:
        return None
    if re.fullmatch(r"[\d.]+", text):
        return float(text)
    parts = re.findall(r"([\d.]+)(ms|h|m|s)", text)
    return sum(float(n) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[u] for n, u in parts) if parts else None


@dataclass
class ToolCall:
    """Le modèle demande d'exécuter une action."""
    name: str
    arguments: dict
    id: str = ""


class LLM:
    def __init__(self, cfg: dict):
        llm = cfg["llm"]
        self.provider = llm["provider"]
        self.temperature = llm.get("temperature", 0.8)
        self.max_tokens = llm.get("max_tokens", 700)
        self.ollama = llm["ollama"]
        self.ollama_url = self.ollama["url"].rstrip("/")
        self.cloud_cfg = llm
        self.embed_model = cfg["memory"]["embed_model"]
        self.http = httpx.AsyncClient(timeout=httpx.Timeout(180, connect=5))
        # Les modèles "qui réfléchissent" (Qwen3…) sont bien plus rapides sans réflexion visible.
        # Si le modèle ne gère pas cette option, on arrête de l'envoyer.
        self._send_think = True
        # Priorités : la conversation passe avant ses réflexions de fond (souvenirs, pensées, curiosité).
        # Une tâche de fond attend que la discussion se calme, et s'efface dès que tu reparles.
        self.foreground = 0
        self.last_foreground = 0.0
        self.quiet_after = 25.0  # secondes de calme après un échange avant de réfléchir en arrière-plan
        self.last_stats: dict = {}  # chiffres d'Ollama pour la dernière réponse (tokens/s, lecture du prompt)
        self._background = asyncio.Lock()  # une seule réflexion de fond à la fois
        self.user_active_at = 0.0  # il vient de se mettre à parler (micro) : les réflexions de fond s'effacent
        # quota du service en ligne (Groq gratuit : 8 000 tokens par minute) : ce qu'il en reste, et jusqu'à quand il est plein
        self.cloud_tokens_left: int | None = None
        self.cloud_reset_at = 0.0
        self.cloud_full_until = 0.0

    def reload(self, cfg: dict) -> None:
        """Prend en compte un changement de fournisseur, de modèle ou de clé fait depuis le hub."""
        llm = cfg["llm"]
        self.provider = llm["provider"]
        self.ollama = llm["ollama"]
        self.ollama_url = self.ollama["url"].rstrip("/")
        self.cloud_cfg = llm

    def cloud(self, provider: str | None = None) -> tuple[str, str]:
        """(clé, modèle) d'un service en ligne : réglés dans le hub, sinon config.toml / variable d'environnement."""
        provider = provider or self.provider
        info, conf = PROVIDERS[provider], self.cloud_cfg.get(provider, {})
        return conf.get("api_key") or os.environ.get(info["env"], ""), conf.get("model") or info["model"]

    @staticmethod
    def _openai_messages(messages: list[dict]) -> list[dict]:
        """Messages au format OpenAI/Groq : les captures d'écran deviennent des images jointes,
        et les champs propres à Ollama sont retirés."""
        out = []
        for m in messages:
            msg = {k: v for k, v in m.items() if k in ("role", "content", "tool_calls", "tool_call_id")}
            if m.get("images"):
                msg["content"] = [{"type": "text", "text": m.get("content") or ""}] + [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}} for img in m["images"]]
            out.append(msg)
        return out

    @property
    def label(self) -> str:
        model = self.cloud()[1] if self.provider in PROVIDERS else self.ollama["model"]
        return f"{self.provider} · {model}"

    def busy_talking(self) -> bool:
        latest = max(self.last_foreground, self.user_active_at)
        return bool(self.foreground) or time.monotonic() - latest < self.quiet_after

    def user_speaking(self) -> None:
        """Il commence une phrase : la carte graphique doit être libre pour l'écouter puis lui répondre."""
        self.user_active_at = time.monotonic()

    async def stream(
        self, messages: list[dict], *, temperature: float | None = None, json_mode: bool = False,
        tools: list[dict] | None = None, background: bool = False,
    ) -> AsyncIterator[str | ToolCall]:
        """Texte de la réponse au fil de l'eau ; avec `tools`, peut aussi produire des ToolCall.
        `background` : une réflexion à elle, qui attend son tour et s'interrompt si la conversation reprend."""
        temp = self.temperature if temperature is None else temperature
        if background:
            await self._background.acquire()
            for _ in range(1800):  # au plus une demi-heure d'attente, sinon tant pis pour cette fois
                if not self.busy_talking():
                    break
                await asyncio.sleep(1)
            else:
                self._background.release()
                raise LLMError("pas de moment calme pour réfléchir")
            began = time.monotonic()
        else:
            self.foreground += 1
        if self.provider in PROVIDERS:
            gen = self._cloud_or_local(messages, temp, json_mode, tools, background)
        else:
            gen = self._ollama_stream(messages, temp, json_mode, tools=tools)
        try:
            async for piece in gen:
                if background and (self.foreground or self.user_active_at > began):
                    raise _Preempted()
                yield piece
        except _Preempted:
            log.info("Réflexion de fond interrompue : la conversation passe d'abord")
            raise LLMError("interrompue pour la conversation") from None
        finally:
            await gen.aclose()
            if background:
                self._background.release()
            else:
                self.foreground -= 1
                self.last_foreground = time.monotonic()

    async def complete(self, messages: list[dict], **kwargs) -> str:
        return "".join([piece async for piece in self.stream(messages, **kwargs)])

    async def embed(self, texts: list[str], _retry: bool = True) -> list[list[float]]:
        try:
            r = await self.http.post(
                f"{self.ollama_url}/api/embed",
                # sur le processeur : c'est rapide pour de si petits textes, et ça laisse la carte graphique au reste
                json={"model": self.embed_model, "input": texts, "keep_alive": "4h",  # petit, en mémoire vive
                      "options": {"num_gpu": 0}},
            )
        except httpx.ConnectError as e:
            # la mémoire passe toujours par Ollama (même quand elle pense en ligne) : on le relance s'il s'est arrêté
            if _retry and await self.revive_ollama(force=True):
                return await self.embed(texts, _retry=False)
            raise LLMError(f"Ollama injoignable pour la mémoire ({e.__class__.__name__}).") from e
        except httpx.HTTPError as e:
            raise LLMError(f"Ollama injoignable pour la mémoire ({e.__class__.__name__}).") from e
        if r.status_code != 200:
            raise LLMError(f"Embeddings : {r.text[:200]}")
        return r.json()["embeddings"]

    async def warmup(self, system_prompt: str) -> None:
        """Charge le modèle et met la personnalité en cache pour que la 1re réponse soit rapide."""
        if self.provider == "ollama":
            async for _ in self._ollama_stream(
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": "."}],
                0.0, False, max_tokens=1,
            ):
                pass
        await self.embed(["search_query: test"])

    async def ensure_loaded(self, system_prompt: str) -> None:
        """Ton retour devant le PC : si Ollama a déchargé son modèle entre-temps, on le recharge tout de suite
        (6 à 9 s) plutôt que de te faire attendre à ta première phrase."""
        if self.provider != "ollama":
            return
        try:
            loaded = (await self.http.get(f"{self.ollama_url}/api/ps", timeout=3)).json().get("models", [])
        except Exception:
            return
        if not any(m.get("name") == self.ollama["model"] or m.get("model") == self.ollama["model"] for m in loaded):
            log.info("Modèle déchargé pendant ton absence : rechargement anticipé")
            await self.warmup(system_prompt)

    async def unload(self) -> None:
        """Libère la carte graphique (un jeu en a besoin, ou elle pense en ligne). Rechargé par `ensure_loaded`.
        Sans effet si le modèle local n'est pas chargé."""
        try:
            await self.http.post(f"{self.ollama_url}/api/generate",
                                 json={"model": self.ollama["model"], "keep_alive": 0}, timeout=10)
            log.info("Modèle local retiré de la carte graphique")
        except httpx.HTTPError:
            pass

    _revived_at = 0.0

    async def revive_ollama(self, force: bool = False) -> bool:
        """Relance Ollama (caché, avec les mêmes réglages que l'avatar : Flash Attention, cache compressé) s'il ne répond
        plus. Au plus une fois par minute. Vrai s'il répond de nouveau."""
        if (self.provider != "ollama" and not force) or time.monotonic() - LLM._revived_at < 60:
            return False
        LLM._revived_at = time.monotonic()
        exe = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe")
        if not os.path.exists(exe):
            return False
        import subprocess
        log.warning("Ollama ne répond plus : relance")
        subprocess.Popen([exe, "serve"], creationflags=0x08000000 | 0x00000008,  # sans fenêtre, détaché
                         env={**os.environ, "OLLAMA_FLASH_ATTENTION": "1", "OLLAMA_KV_CACHE_TYPE": "q8_0"},
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(30):
            await asyncio.sleep(0.5)
            try:
                if (await self.http.get(f"{self.ollama_url}/api/version", timeout=1)).status_code == 200:
                    log.info("Ollama relancé")
                    return True
            except httpx.HTTPError:
                pass
        return False

    async def _gpu_pause(self, detail: str) -> None:
        log.warning("Ollama a planté sur la carte graphique (%s) : nouvel essai", detail[:120])
        await asyncio.sleep(2)

    async def _ollama_stream(
        self, messages: list[dict], temperature: float, json_mode: bool, max_tokens: int | None = None,
        tools: list[dict] | None = None, keep_alive: str | None = None,
    ) -> AsyncIterator[str | ToolCall]:
        body = {
            "model": self.ollama["model"],
            "messages": messages,
            "stream": True,
            "keep_alive": keep_alive or self.ollama["keep_alive"],
            "options": {
                "num_ctx": self.ollama["num_ctx"],
                "temperature": temperature,
                "num_predict": max_tokens or self.max_tokens,
                # sans ça, qwen3-vl part parfois en boucle et répète la même phrase jusqu'à la limite
                "repeat_penalty": 1.12, "repeat_last_n": 256, "top_p": 0.92,
                # réglages d'échantillonnage de config.toml ([llm.ollama.sampling]) ; CAPRI_LLM_OPTIONS pour un essai
                **self.ollama.get("sampling", {}), **json.loads(os.environ.get("CAPRI_LLM_OPTIONS") or "{}"),
            },
        }
        if json_mode:
            body["format"] = "json"
        if tools:
            body["tools"] = tools
        yielded = False
        for attempt in range(3):
            if self._send_think:
                body["think"] = False
            else:
                body.pop("think", None)
            try:
                async with self.http.stream("POST", f"{self.ollama_url}/api/chat", json=body) as r:
                    if r.status_code != 200:
                        detail = (await r.aread()).decode(errors="replace")
                        if attempt == 0 and self._send_think and "think" in detail.lower():
                            self._send_think = False
                            continue
                        if r.status_code == 404:
                            raise LLMError(
                                f"Le modèle « {self.ollama['model']} » n'est pas installé. "
                                f"Lance : ollama pull {self.ollama['model']}"
                            )
                        if attempt < 2 and GPU_CRASH.search(detail):
                            await self._gpu_pause(detail)
                            continue
                        raise LLMError(f"Ollama : {detail[:300]}")
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)
                        if "error" in data:
                            if attempt < 2 and not yielded and GPU_CRASH.search(str(data["error"])):
                                raise _GpuCrash(str(data["error"]))
                            raise LLMError(f"Ollama : {data['error']}")
                        message = data.get("message", {})
                        if piece := message.get("content", ""):
                            yielded = True
                            yield piece
                        for call in message.get("tool_calls") or []:
                            fn = call.get("function", {})
                            args = fn.get("arguments") or {}
                            if isinstance(args, str):
                                args = json.loads(args or "{}")
                            yielded = True
                            yield ToolCall(fn.get("name", ""), args, call.get("id", ""))
                        if data.get("done"):
                            gen_s = max(data.get("eval_duration", 1) / 1e9, 1e-6)
                            self.last_stats = {"prompt_n": data.get("prompt_eval_count", 0),
                                               "prompt_ms": round(data.get("prompt_eval_duration", 0) / 1e6),
                                               "gen_n": data.get("eval_count", 0),
                                               "tok_s": round(data.get("eval_count", 0) / gen_s, 1),
                                               "load_ms": round(data.get("load_duration", 0) / 1e6)}
                            log.info(
                                "Ollama : %s tokens lus en %.2fs, %s générés à %.0f tok/s",
                                data.get("prompt_eval_count", 0),
                                data.get("prompt_eval_duration", 0) / 1e9,
                                data.get("eval_count", 0),
                                data.get("eval_count", 0) / max(data.get("eval_duration", 1) / 1e9, 1e-6),
                            )
                            return
                    return
            except _GpuCrash as e:
                await self._gpu_pause(str(e))
                continue
            except httpx.ConnectError as e:
                # Ollama s'est arrêté (ça arrive) : on le relance nous-mêmes une fois, puis on réessaie
                if attempt < 2 and await self.revive_ollama():
                    continue
                raise LLMError("Ollama ne répond pas. Il est bien installé et lancé ?") from e
            except httpx.HTTPError as e:
                raise LLMError(f"Erreur réseau avec Ollama ({e.__class__.__name__}).") from e

    async def _cloud_or_local(
        self, messages: list[dict], temperature: float, json_mode: bool, tools: list[dict] | None, background: bool,
    ) -> AsyncIterator[str | ToolCall]:
        """En ligne ; quand le quota est plein, la conversation passe par son modèle local (pas d'erreur pour lui),
        et ses réflexions de fond attendent. Elles attendent aussi quand le quota est presque vide, pour lui le garder."""
        now = time.monotonic()
        if background and (now < self.cloud_full_until
                           or (self.cloud_tokens_left is not None and self.cloud_tokens_left < 3000 and now < self.cloud_reset_at)):
            raise LLMError("quota en ligne gardé pour la conversation")
        if now >= self.cloud_full_until:
            try:
                async for piece in self._cloud_stream(messages, temperature, json_mode, tools):
                    yield piece
                return
            except _QuotaFull as e:
                self.cloud_full_until = time.monotonic() + e.wait
                if background:
                    raise
                log.warning("Quota en ligne plein pour %.0f s : réponse avec le modèle local", e.wait)
                full = e
        else:
            full = _QuotaFull(f"Limite de {PROVIDERS[self.provider]['label']} atteinte, réessaie dans un moment.", 0)
        try:
            # le temps que le quota revienne : il quitte la carte graphique peu après
            async for piece in self._ollama_stream(messages, temperature, json_mode, tools=tools, keep_alive="3m"):
                yield piece
        except LLMError:
            raise full from None

    def _note_quota(self, headers: httpx.Headers) -> None:
        left = headers.get("x-ratelimit-remaining-tokens")
        if left and left.isdigit():
            self.cloud_tokens_left = int(left)
            self.cloud_reset_at = time.monotonic() + (_seconds(headers.get("x-ratelimit-reset-tokens")) or 60)

    async def _cloud_stream(
        self, messages: list[dict], temperature: float, json_mode: bool, tools: list[dict] | None = None
    ) -> AsyncIterator[str | ToolCall]:
        info = PROVIDERS[self.provider]
        name = info["label"]
        key, model = self.cloud()
        if not key:
            raise LLMError(f"Pas de clé pour {name} : ajoute-la dans le hub (Réglages, Cerveau) ou repasse sur Ollama.")
        body = {"model": model, "messages": self._openai_messages(messages), "stream": True, "temperature": temperature}
        # les derniers modèles d'OpenAI veulent « max_completion_tokens »
        body["max_completion_tokens" if self.provider == "openai" else "max_tokens"] = self.max_tokens
        if "gpt-oss" in model:
            # modèle qui « réfléchit » avant de répondre : au minimum (plus rapide, et moins de tokens du quota gratuit)
            body["reasoning_effort"] = "low"
            body["max_tokens"] = self.max_tokens + 300  # sa réflexion compte dans la limite (et dans le quota par minute)
        if json_mode and self.provider != "anthropic":
            body["response_format"] = {"type": "json_object"}
        if tools:
            body["tools"] = tools
        headers = {"Authorization": f"Bearer {key}"}
        if self.provider == "openrouter":
            headers["X-Title"] = "Capri"
        for attempt in range(2):
            calls: dict[int, dict] = {}  # les appels d'outils arrivent en morceaux
            try:
                async with self.http.stream("POST", f"{info['url']}/chat/completions", json=body, headers=headers) as r:
                    if r.status_code != 200:
                        detail = (await r.aread()).decode(errors="replace")
                        # certains modèles refusent la température : on réessaie sans
                        if attempt == 0 and r.status_code == 400 and "temperature" in detail.lower():
                            body.pop("temperature", None)
                            continue
                        if r.status_code == 429:
                            wait = _seconds(r.headers.get("retry-after")) or _seconds(r.headers.get("x-ratelimit-reset-tokens"))
                            raise _QuotaFull(f"Limite de {name} atteinte, réessaie dans un moment.", min(wait or 30, 3600))
                        if r.status_code in (401, 403):
                            raise LLMError(f"{name} refuse la clé (invalide ou sans crédit).")
                        raise LLMError(f"{name} : {detail[:300]}")
                    self._note_quota(r.headers)
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        choices = json.loads(payload).get("choices") or [{}]
                        delta = choices[0].get("delta") or {}
                        if piece := delta.get("content"):
                            # tirets et espaces insécables de gpt-oss : normaux, pour la voix et la bulle
                            yield piece.translate(_PLAIN)
                        for part in delta.get("tool_calls") or []:
                            call = calls.setdefault(part.get("index", 0), {"id": "", "name": "", "args": ""})
                            call["id"] = part.get("id") or call["id"]
                            fn = part.get("function") or {}
                            call["name"] += fn.get("name") or ""
                            call["args"] += fn.get("arguments") or ""
                for call in calls.values():
                    yield ToolCall(call["name"], json.loads(call["args"] or "{}"), call["id"])
                return
            except httpx.HTTPError as e:
                raise LLMError(f"{name} injoignable ({e.__class__.__name__}).") from e

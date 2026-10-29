# Pocket Capri

**[Français](README.fr.md)** · English

**Capri lives on your Windows desktop.** An AI companion inspired by *Cyberpunk: Edgerunners 2*: she talks and
listens, sees what's on your screen, drives your PC, has a life of her own between conversations… and she gets
a little jealous when you look at something other than her.

Free, and everything can run on your own PC (unless you choose an online service).

> Unofficial, non-commercial fan project. Not affiliated with CD PROJEKT RED, Studio Trigger or Netflix.

## What she does

- **Talks and listens.** Say "Capri…" into your mic, or type in the hub. Natural voice (online, free) or fully
  local voice. She really laughs, cries or shouts when you ask her to.
- **Has a life of her own.** She reads real articles, listens to music, daydreams, has moods and keeps a journal.
  She remembers you, asks how your interview went, and grows attached to you over time.
- **Comes to talk on her own.** She notices when you're back, demands your attention when you watch a video,
  suggests doing something together. Tell her "Capri, rest time" and she goes quiet.
- **Sees your screen.** She reads windows (messages, YouTube results, web pages) and looks at screenshots.
- **Drives your PC.** Opens and closes apps, searches the web, sets the volume, controls Spotify, Discord
  (mute, deafen) and your browser, clicks and types — with a glowing border and the Esc key to stop her.
  Sending, buying or deleting: she always asks first.
- **Moves around your desktop.** Walks on the taskbar, sits on top of windows, flies, spins, teleports.
- **A neon hub**: chat, memory, action log, face editor, settings (voice, **English / French**, local brain or
  your own API key for Gemini, OpenAI, Claude, Grok, Groq, Mistral, OpenRouter, DeepSeek).

## Requirements

- Windows 10/11, an **NVIDIA GPU with 12 GB** (tested on an RTX 3060 12 GB), 16 GB of RAM.
- [Ollama](https://ollama.com/download), [Python 3.12](https://www.python.org/downloads/) (with the `py`
  launcher), [Node.js 20+](https://nodejs.org/).
- About 15 GB of disk space (models included).

## Install and run

1. Download the project (**Code → Download ZIP**, or `git clone`).
2. Double-click **`Capri.vbs`**. The first time, a window installs everything (brain, avatar, models: about 6 GB
   to download), then Capri shows up.
3. After that, `Capri.vbs` starts her with no window at all: just her icon next to the clock. Click it to open
   the hub. "Quit Capri" stops everything (Ollama included).

Her language is English by default: switch to French in the hub (Settings → You → Her language).

Optional: the 100% local voice → run `brain/voix_locale/installer.bat` (≈ 5 GB), then pick it in
Settings → Her voice.

## How it's built

- `brain/` — her brain (Python, FastAPI): conversation (Ollama `qwen3-vl:8b-instruct`, which can also see
  images), memory (SQLite + embeddings), voice (Whisper to listen; Microsoft Edge voices, Kokoro or Chatterbox to
  speak), inner life, PC control tools, and the web hub.
- `body/` — her body (Electron): transparent window, animated skeleton, face, movement, menus.
- `capri.txt` — her personality. Edit it however you like.
- `brain/config.toml` — base settings (most can also be changed in the hub).

Your data stays on your PC in `brain/data/` (conversations, memories, settings, API keys): that folder is never
pushed to GitHub.

## Credits and licences

- Capri's code: MIT licence (see `LICENSE`).
- The avatar started from [capri-companion](https://github.com/TheAgencyMGE/capri-companion) (MIT).
- Body drawings from [capri-desktop](https://github.com/lachydotmcg/capri-desktop) by Lachy, under the
  **PolyForm Noncommercial 1.0.0** licence: non-commercial use only (see `body/assets/desktop-sprites/LICENSE.md`).
- Voice: Kokoro (Apache 2.0), SIWIS corpus (CC BY 4.0), Chatterbox by Resemble AI (MIT), Microsoft neural voices
  through edge-tts. Listening: Whisper (MIT) through faster-whisper. Models: Qwen3-VL (Apache 2.0),
  nomic-embed-text (Apache 2.0).
- Capri and *Cyberpunk: Edgerunners* belong to their respective owners (CD PROJEKT RED, Studio Trigger, Netflix).

# Capri — the avatar (Electron)

Capri's body on the Windows desktop: her transparent window, animated skeleton, face, movement (walking, flying,
sitting on windows, teleporting), the tray menu and the glowing border while she drives the PC. Everything that
thinks (conversation, voice, memory, actions) lives in `../brain`.

Run it on its own, for development:

```bash
npm ci
npm start
```

- `src/main/` — main process (windows, starting/stopping Ollama and the brain, menus, shortcuts).
- `src/renderer/character/` — the character (skeleton `rig.ts`, face `face.ts`, autonomous life `roam.ts`…).
- `src/editor/` — the face editor, served by the brain inside the hub.
- `scripts/` — build (`build.mjs`) and render / capture tools.
- `tools/` — Python scripts used to vectorize and rig the drawings.

Originally based on [capri-companion](https://github.com/TheAgencyMGE/capri-companion) (MIT licence, see
`LICENSE` and `THIRD_PARTY_LICENSES.md`). The body drawings come from
[capri-desktop](https://github.com/lachydotmcg/capri-desktop) (PolyForm Noncommercial 1.0.0 licence, see
`assets/desktop-sprites/LICENSE.md`): non-commercial use only.

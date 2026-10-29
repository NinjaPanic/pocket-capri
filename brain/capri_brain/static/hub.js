// Hub de Capri : discussion, mémoire, journal des actions, visage, réglages, état.
// Servi par son cerveau : la même page sert sur le PC (dans l'avatar) et plus tard sur le téléphone.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const api = async (path, opts) => (await fetch(path, opts)).json();
const time = (ts) => new Date(ts * 1000).toLocaleString(LOCALE, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// ---------------------------------------------------------------- onglets
const loaders = {};
function showTab(name) {
  if (!document.getElementById(name)) name = "discussion";
  for (const s of document.querySelectorAll("main section")) s.classList.toggle("on", s.id === name);
  for (const a of document.querySelectorAll("nav a")) a.classList.toggle("on", a.dataset.tab === name);
  loaders[name]?.();
  if (name === "discussion") setTimeout(() => $("input").focus(), 0);
}
addEventListener("hashchange", () => showTab(location.hash.slice(1)));

// ---------------------------------------------------------------- connexion au cerveau
let ws, current = null, busy = false;
const log = $("log"), scroll = $("scroll"), input = $("input");

function stick(fn) {
  const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  fn();
  if (atBottom) scroll.scrollTop = scroll.scrollHeight;
}
function addMsg(role, text, mood) {
  const m = el("div", "msg " + role);
  if (role === "capri") {
    const who = el("span", "who", "CAPRI ");
    who.append(el("em", null, mood ? "· " + mood : ""));
    m.append(who);
  }
  m.append(el("span", null, text));
  stick(() => log.append(m));
  return m;
}
function addLine(cls, text) { const d = el("div", cls, text); stick(() => log.append(d)); return d; }

function setStatus(text, state) { $("dot").className = "dot " + state; $("dot").title = text; }
function setBusy(b) { busy = b; $("send").disabled = b; }

function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => { setStatus("connectée", "ok"); sendConfig(); };
  ws.onclose = () => { setStatus("cerveau déconnecté", "bad"); setBusy(false); setTimeout(connect, 1500); };
  ws.onmessage = (e) => onEvent(JSON.parse(e.data));
}
function onEvent(m) {
  switch (m.type) {
    case "hello":
      log.replaceChildren();
      for (const h of m.history) addMsg(h.role === "user" ? "user" : "capri", h.text, h.mood);
      $("mood").textContent = m.mood;
      setStatus(m.status, m.status === "prête" ? "ok" : "busy");
      setVoice(m.voice);
      scroll.scrollTop = scroll.scrollHeight;
      break;
    case "status": setStatus(m.status, m.status === "prête" ? "ok" : "busy"); break;
    case "voice": setVoice(m.status); break;
    case "hearing": $("micBtn").classList.add("hearing"); break;
    case "heard":
      $("micBtn").classList.remove("hearing");
      if (m.text && m.ignored) hint(LANG === "en" ? `heard, but not for her: “${m.text}”` : `entendu, mais pas pour elle : « ${m.text} »`);
      break;
    case "audio": audio.play(m); break;
    case "stop_audio": audio.stop(); break;
    case "user": addMsg("user", m.text); setBusy(true); break;
    case "start": current = addMsg("capri", ""); current.lastChild.classList.add("typing"); break;
    case "mood": $("mood").textContent = m.mood; if (current) current.querySelector(".who em").textContent = "· " + m.mood; break;
    case "delta": if (current) stick(() => { current.lastChild.textContent += m.text; }); break;
    case "done":
      if (current) { current.lastChild.textContent = m.text; current.lastChild.classList.remove("typing"); }
      current = null; setBusy(false);
      break;
    case "memory": addLine("note", (m.result === "updated" ? "◆ souvenir mis à jour : " : "◆ retenu : ") + m.text); break;
    case "action":
      addLine("act " + (m.ok ? "ok" : "ko"), "").append(el("b", null, (m.ok ? "✓ " : "✗ ") + (LABELS[m.name] || m.name)), " " + (m.result || "").split("\n")[0].slice(0, 140));
      actions.unshift(m); if ($("actions").classList.contains("on")) renderActions();
      break;
    case "control": setStatus(m.active ? "elle pilote le PC" : "prête", m.active ? "busy" : "ok"); break;
    case "error":
      if (current) current.remove();
      current = null; addMsg("error", m.text); setBusy(false);
      break;
  }
}
function stop() { audio.stop(); if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "stop" })); }

$("form").onsubmit = (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy || ws?.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "chat", text, client: "hub" }));
  input.value = ""; input.style.height = "";
};
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); } });
input.addEventListener("input", () => { input.style.height = ""; input.style.height = input.scrollHeight + "px"; });
$("stopBtn").onclick = stop;
$("actStop").onclick = stop;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") stop(); });

let hintTimer;
function hint(text) {
  $("hint").textContent = text; $("hint").style.opacity = 1;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { $("hint").style.opacity = 0; }, 4000);
}

// ---------------------------------------------------------------- voix dans la page (surtout pour le téléphone)
const prefs = (() => { try { return JSON.parse(localStorage.getItem("capri.voice") || "{}"); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem("capri.voice", JSON.stringify(prefs)); } catch {} };
function sendConfig() { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "config", name: "hub", speaker: !!prefs.speaker })); }
let voiceReady = false;
function setVoice(status) {
  voiceReady = status === "prête";
  $("micBtn").disabled = $("spkBtn").disabled = !voiceReady;
  if (voiceReady && prefs.mic && !mic.on) mic.start().catch(() => {});
  renderVoice();
}
function renderVoice() { $("micBtn").classList.toggle("on", mic.on); $("spkBtn").classList.toggle("on", !!prefs.speaker); }

const audio = {
  ctx: null, next: 0, sources: [], current: -1,
  ensure() { this.ctx ??= new AudioContext(); if (this.ctx.state === "suspended") this.ctx.resume(); },
  play(m) {
    if (!prefs.speaker) return;
    this.ensure();
    if (m.id < this.current) return;
    if (m.id > this.current) { this.stop(); this.current = m.id; }
    const bytes = Uint8Array.from(atob(m.pcm), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer);
    const buf = this.ctx.createBuffer(1, pcm.length, m.rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.02, this.next);
    src.start(at); this.next = at + buf.duration;
    this.sources.push(src);
    src.onended = () => { this.sources = this.sources.filter((s) => s !== src); };
  },
  stop() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources = []; this.next = 0; },
};
const WORKLET = `class M extends AudioWorkletProcessor{constructor(){super();this.b=new Int16Array(512);this.n=0}
process(i){const c=i[0][0];if(c)for(let k=0;k<c.length;k++){const s=Math.max(-1,Math.min(1,c[k]));this.b[this.n++]=s<0?s*32768:s*32767;
if(this.n===512){this.port.postMessage(this.b.buffer.slice(0));this.n=0}}return true}}registerProcessor("capri-mic",M);`;
const mic = {
  on: false, ctx: null, stream: null,
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
    const node = new AudioWorkletNode(this.ctx, "capri-mic");
    node.port.onmessage = (e) => { if (ws?.readyState === 1) ws.send(e.data); };
    this.ctx.createMediaStreamSource(this.stream).connect(node);
    this.on = true; renderVoice();
  },
  stop() { this.stream?.getTracks().forEach((t) => t.stop()); this.ctx?.close(); this.on = false; renderVoice(); },
};
$("micBtn").onclick = async () => {
  if (mic.on) { mic.stop(); prefs.mic = false; }
  else { try { await mic.start(); prefs.mic = true; hint("j'écoute : commence ta phrase par « Capri »"); } catch (e) { hint("micro inaccessible : " + e.message); } }
  savePrefs();
};
$("spkBtn").onclick = () => { prefs.speaker = !prefs.speaker; if (prefs.speaker) audio.ensure(); else audio.stop(); savePrefs(); sendConfig(); renderVoice(); };

// ---------------------------------------------------------------- mémoire
let memories = [];
function renderMemories() {
  const q = $("memSearch").value.trim().toLowerCase();
  const list = $("memList");
  const shown = memories.filter((m) => !q || m.content.toLowerCase().includes(q));
  list.replaceChildren();
  $("memCount").textContent = `${memories.length} ${LANG === "en" ? "memor" + (memories.length > 1 ? "ies" : "y") : "souvenir" + (memories.length > 1 ? "s" : "")}`;
  if (!shown.length) list.append(el("li", "empty", memories.length ? "Aucun souvenir ne correspond." : "Rien pour l'instant. Parle-lui de toi."));
  for (const m of shown) {
    const li = el("li");
    const x = el("button", "x", "oublier");
    x.onclick = async () => { await fetch(`/api/memories/${m.id}`, { method: "DELETE" }); memories = memories.filter((o) => o.id !== m.id); renderMemories(); };
    li.append(el("span", "txt", m.content), el("span", "meta", time(m.ts)), x);
    list.append(li);
  }
}
loaders.memoire = async () => { memories = await api("/api/memories"); renderMemories(); };
$("memSearch").oninput = renderMemories;

// ---------------------------------------------------------------- journal des actions
const LABELS = {
  ouvrir_programme: "programme", fermer_programme: "fermer", ouvrir_site: "site", rechercher_web: "recherche", ouvrir_dossier: "dossier",
  volume: "volume", musique: "musique", etat_du_pc: "état PC", alimentation: "alimentation", ne_pas_deranger: "silence",
  controler_appli: "appli", voir_fenetres: "fenêtres", lire_fenetre: "lecture", regarder_ecran: "capture", activer_fenetre: "fenêtre",
  cliquer: "clic", cliquer_position: "clic", ecrire: "frappe", touches: "touches", defiler: "défilement",
};
let actions = [];
function renderActions() {
  const q = $("actSearch").value.trim().toLowerCase();
  const list = $("actList");
  const shown = actions.filter((a) => !q || JSON.stringify(a).toLowerCase().includes(q));
  list.replaceChildren();
  $("actCount").textContent = `${actions.length} action${actions.length > 1 ? "s" : ""} ${LANG === "en" ? "since she started" : "depuis son lancement"}`;
  if (!shown.length) list.append(el("li", "empty", "Elle n'a encore rien fait sur le PC."));
  for (const a of shown) {
    const li = el("li", a.ok ? "ok" : "ko");
    const txt = el("span", "txt", Object.values(a.args || {}).join(" · ") || a.name);
    txt.append(el("span", "res", a.result));
    li.append(el("span", "tag", LABELS[a.name] || a.name), txt, el("span", "meta", time(a.ts)));
    list.append(li);
  }
}
loaders.actions = async () => { actions = (await api("/api/actions")).reverse(); renderActions(); };
$("actSearch").oninput = renderActions;

// ---------------------------------------------------------------- visage
loaders.visage = () => { if (!$("faceFrame").src) $("faceFrame").src = "/editeur"; };

// ---------------------------------------------------------------- réglages
// [section, clé, libellé, aide, type, min, max, pas]
const SETTINGS = [
  ["Avatar", "Son corps sur ton bureau.", "avatar", [
    ["character.scale", "Taille", "", "range", 0.4, 2.5, 0.05],
    ["character.opacity", "Opacité", "", "range", 0.2, 1, 0.05],
    ["behavior.idlePeek", "Vivre sa vie", "elle se balade, marche, vole, s'assoit où elle veut", "bool"],
    ["teleport.auto", "Se téléporter d'elle-même", "", "bool"],
    ["teleport.minMinutes", "Téléportation au plus tôt", "minutes", "number", 1, 240],
    ["teleport.maxMinutes", "Téléportation au plus tard", "minutes", "number", 1, 480],
    ["character.alwaysOnTop", "Toujours au premier plan", "", "bool"],
    ["character.clickThrough", "Laisser passer les clics", "Ctrl+Alt+C pour interagir 15 s", "bool"],
    ["character.hideOnFullscreen", "Se cacher en plein écran", "jeux, vidéos", "bool"],
    ["character.glitchEffects", "Effets glitch", "", "bool"],
    ["behavior.doNotDisturb", "Avatar en mode discret", "", "bool"],
    ["startup.launchOnLogin", "Lancer avec Windows", "elle arrive toute seule quand tu allumes le PC", "bool"],
  ]],
  ["Vie", "Ce qu'elle fait d'elle-même.", "vie", [
    ["accueil", "Remarquer ton retour", "", "bool"],
    ["absence_minutes", "Absence avant de te saluer", "minutes", "number", 1, 240],
    ["spontane_minutes", "Phrase spontanée après", "minutes de silence, 0 = jamais", "number", 0, 600],
  ]],
  ["Mains", "Quand elle pilote ton PC.", "mains", [
    ["confirmer", "Demander avant d'envoyer, acheter, supprimer, fermer", "sinon elle le fait direct (éteindre le PC reste demandé)", "bool"],
  ]],
  ["Voix", "Comment elle t'écoute et te parle.", "voix", [
    ["wake_word", "Ne répondre qu'à « Capri »", "", "bool"],
    ["follow_up_seconds", "Répondre sans redire son nom", "secondes après sa réponse", "number", 0, 30],
    ["end_silence", "Silence de fin de phrase", "secondes", "range", 0.3, 1.5, 0.05],
    ["tts_speed", "Vitesse de sa voix", "", "range", 0.7, 1.4, 0.05],
  ]],
];
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
let savedTimer;
async function save(section, key, value) {
  await fetch("/api/reglages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section, key, value }) });
  $("saved").classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $("saved").classList.remove("show"), 1200);
}
function control(section, [key, , , type, min, max, step], value) {
  if (type === "bool") {
    const sw = el("label", "switch"), cb = el("input");
    cb.type = "checkbox"; cb.checked = !!value;
    cb.onchange = () => save(section, key, cb.checked);
    sw.append(cb, el("span"));
    return [sw];
  }
  const inp = el("input");
  inp.type = type; inp.min = min; inp.max = max; if (step) inp.step = step; inp.value = value ?? min;
  if (type === "range") {
    const out = el("output", null, String(inp.value));
    inp.oninput = () => { out.textContent = inp.value; };
    inp.onchange = () => save(section, key, Number(inp.value));
    return [inp, out];
  }
  inp.onchange = () => save(section, key, Number(inp.value));
  return [inp];
}
loaders.reglages = async () => {
  const data = await api("/api/reglages");
  const cards = $("cards");
  cards.replaceChildren();
  // silence de quelques minutes/heures
  const quiet = el("div", "card");
  quiet.append(el("h2", null, "Ne pas déranger"), el("p", "sub", data.quiet_until > Date.now() / 1000
    ? `${LANG === "en" ? "Quiet until" : "Silencieuse jusqu'à"} ${new Date(data.quiet_until * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}.`
    : "Elle ne parle plus d'elle-même pendant ce temps."));
  const row = el("div", "toolbar");
  for (const [label, min] of [["30 min", 30], ["1 h", 60], ["2 h", 120], ["Jusqu'à demain", 12 * 60], ["Reprendre", 0]]) {
    const b = el("button", "btn", label);
    b.onclick = async () => { await save("silence", "minutes", min); loaders.reglages(); };
    row.append(b);
  }
  quiet.append(row);
  cards.append(quiet);
  // toi : ce qu'elle doit savoir sans avoir à le deviner
  const me = el("div", "card");
  me.append(el("h2", null, "Toi"), el("p", "sub", "Elle ne sait de toi que ce que tu lui dis ou ce que tu mets ici."));
  const name = el("input", "field"); name.type = "text"; name.maxLength = 40; name.value = data.toi?.prenom || ""; name.placeholder = "ton prénom";
  name.onchange = () => save("toi", "prenom", name.value.trim());
  const r = el("div", "row"); r.append(el("label", null, "Ton prénom"), name); me.append(r);
  // sa langue : elle parle, écoute et lit dans la langue choisie
  const flags = el("div", "flags");
  for (const [code, label, svg] of [["fr", "Français", FLAG_FR], ["en", "English", FLAG_UK]]) {
    const b = el("button", "flag" + ((data.toi?.langue || "fr") === code ? " on" : ""));
    b.innerHTML = svg;
    b.append(el("span", null, label));
    b.onclick = async () => { await save("toi", "langue", code); location.reload(); };
    flags.append(b);
  }
  const lr = el("div", "row"); lr.append(el("label", null, "Sa langue"), flags); me.append(lr);
  cards.append(me);
  cards.append(await brainCard(data.cerveau));
  cards.append(await voiceCard());
  for (const [title, sub, section, fields] of SETTINGS) {
    const card = el("div", "card");
    card.append(el("h2", null, title), el("p", "sub", sub));
    const values = data[section];
    if (!values) card.append(el("p", "offline", "L'avatar n'est pas connecté : lance Capri pour régler son corps."));
    else for (const f of fields) {
      const r = el("div", "row"), lab = el("label", null, f[1]);
      if (f[2]) lab.append(el("small", null, f[2]));
      r.append(lab, ...control(section, f, get(values, f[0])));
      card.append(r);
    }
    cards.append(card);
  }
};

// drapeaux dessinés en SVG (les drapeaux emoji ne s'affichent pas sous Windows)
const FLAG_FR = '<svg viewBox="0 0 3 2" width="36" height="24"><rect width="1" height="2" fill="#0055a4"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ef4135"/></svg>';
const FLAG_UK = '<svg viewBox="0 0 60 30" width="36" height="24" preserveAspectRatio="none"><clipPath id="uk"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath>' +
  '<path d="M0,0v30h60v-30z" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/>' +
  '<path d="M0,0L60,30M60,0L0,30" clip-path="url(#uk)" stroke="#C8102E" stroke-width="4"/>' +
  '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>';

// son modèle de langage : Ollama (sur ce PC) ou un service en ligne avec sa clé
async function brainCard(c) {
  const card = el("div", "card");
  card.append(el("h2", null, "Cerveau"), el("p", "sub", "Le modèle qui la fait penser. Ollama tourne sur ton PC (privé, gratuit). Les services en ligne sont souvent plus rapides ou plus malins, mais tes messages passent par leurs serveurs."));
  const saveBrain = async (key, value) => {
    const r = await fetch("/api/reglages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "cerveau", key, value }) });
    const res = await r.json();
    if (!r.ok) { hint(res.error || "réglage refusé"); return false; }
    $("saved").classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => $("saved").classList.remove("show"), 1200);
    return true;
  };
  const row = (parent, label, help, ...controls) => {
    const r = el("div", "row"), lab = el("label", null, label);
    if (help) lab.append(el("small", null, help));
    r.append(lab, ...controls);
    parent.append(r);
  };
  const text = (value, list) => {
    const i = el("input", "field");
    i.type = "text"; i.value = value || "";
    if (list?.length) {
      const dl = el("datalist"); dl.id = "dl" + Math.random().toString(36).slice(2);
      for (const o of list) { const op = el("option"); op.value = o; dl.append(op); }
      i.setAttribute("list", dl.id); card.append(dl);
    }
    return i;
  };

  const provider = el("select", "field");
  for (const [v, l] of [["ollama", "Ollama (sur ce PC)"], ...Object.entries(c.clouds).map(([k, p]) => [k, p.label])]) {
    const o = el("option", null, l); o.value = v; provider.append(o);
  }
  provider.value = c.provider;
  row(card, "Où elle pense", "", provider);
  const details = el("div");
  card.append(details);

  const installed = (await api("/api/modeles")).ollama;
  const show = () => {
    details.replaceChildren();
    const p = provider.value;
    if (p === "ollama") {
      const om = text(c.ollama_model, installed);
      om.onchange = () => saveBrain("ollama_model", om.value.trim());
      row(details, "Modèle Ollama", "doit être installé (ollama pull …) ; qwen3-vl voit l'écran", om);
      return;
    }
    const info = c.clouds[p];
    const m = text(info.model, [info.suggested]);
    m.onchange = () => saveBrain(`${p}_model`, m.value.trim());
    row(details, `${t("Modèle")} ${info.label}`, `${LANG === "en" ? "suggested" : "suggéré"} : ${info.suggested}`, m);
    const key = el("input", "field");
    key.type = "password"; key.autocomplete = "off";
    key.placeholder = info.key ? `${LANG === "en" ? "key saved" : "clé enregistrée"} (${info.key})` : t("colle ta clé ici");
    const btn = el("button", "btn", "Enregistrer");
    btn.onclick = async () => { if (key.value.trim() && await saveBrain(`${p}_key`, key.value.trim())) { key.value = ""; loaders.reglages(); } };
    row(details, `${LANG === "en" ? "API key" : "Clé API"} ${info.label}`, LANG === "en" ? `get one at ${info.where}; it stays on this PC` : `à créer sur ${info.where} ; elle reste sur ce PC`, key, btn);
    if (!info.key) details.append(el("p", "offline", "Sans clé, elle ne pourra pas répondre avec ce service."));
  };
  provider.onchange = async () => { show(); await saveBrain("provider", provider.value); };
  show();
  const note = el("p", "sub", "La mémoire (souvenirs) et la voix restent toujours sur ton PC.");
  note.style.marginTop = "10px";
  card.append(note);
  return card;
}

// sa voix : naturelle (en ligne, gratuite) ou locale (hors ligne)
async function voiceCard() {
  const v = await api("/api/voix");
  const card = el("div", "card");
  card.append(el("h2", null, "Sa voix"), el("p", "sub", "La voix naturelle est bien plus humaine (gratuite, sans clé, mais elle passe par Internet : les phrases qu'elle dit sont envoyées à Microsoft). Sans Internet, elle repasse toute seule sur la voix locale."));
  const put = (key, value) => fetch("/api/reglages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: "voix", key, value }) });
  const row = (label, ...controls) => { const r = el("div", "row"); r.append(el("label", null, label), ...controls); card.append(r); };
  const engine = el("select", "field");
  const engines = [["edge", "Naturelle en ligne (Vivienne…)"], ["local", "Naturelle sur ton PC (Chatterbox)"], ["kokoro", "Basique sur ton PC"]];
  for (const [k, l] of engines) {
    if (k === "local" && !v.local.installed) continue;
    const o = el("option", null, l); o.value = k; engine.append(o);
  }
  engine.value = v.engine;
  engine.onchange = async () => { await put("tts_engine", engine.value); loaders.reglages(); };
  row("Moteur", engine);
  if (v.engine === "local") {
    card.append(el("p", "sub", v.local.ready ? "Voix locale prête." : "Voix locale en cours de chargement (une vingtaine de secondes) : la voix basique parle en attendant."));
    const file = el("input"); file.type = "file"; file.accept = ".wav,audio/wav"; file.style.display = "none";
    const pick = el("button", "btn", "Donner ma voix (.wav)");
    pick.onclick = () => file.click();
    file.onchange = async () => {
      if (!file.files[0]) return;
      const r = await fetch("/api/voix/reference", { method: "POST", body: file.files[0] });
      hint(r.ok ? "voix enregistrée : elle parlera avec" : (await r.json()).error);
    };
    const reset = el("button", "btn", "Voix d'origine");
    reset.onclick = async () => { await fetch("/api/voix/reference", { method: "POST" }); hint("retour à la voix d'origine"); };
    row("Sa voix", pick, reset, file);
    card.append(el("p", "sub", "Un enregistrement clair de 5 à 15 secondes d'une voix que tu as le droit d'utiliser (la tienne, ou quelqu'un d'accord). Elle parlera avec ce timbre."));
  }
  const voice = el("select", "field");
  for (const [k, l] of Object.entries(v.natural)) { const o = el("option", null, l); o.value = k; voice.append(o); }
  voice.value = v.voice;
  voice.onchange = () => put("tts_natural_voice", voice.value);
  // une voix par langue : on règle celle de la langue qu'elle parle en ce moment
  row(LANG === "en" ? "Voix naturelle (anglais)" : "Voix naturelle (français)", voice);
  const pitch = el("input"); pitch.type = "range"; pitch.min = -10; pitch.max = 40; pitch.step = 2; pitch.value = v.pitch ?? 0;
  const pout = el("output", null, `${pitch.value} Hz`);
  pitch.oninput = () => { pout.textContent = `${pitch.value} Hz`; };
  pitch.onchange = () => put("tts_pitch", Number(pitch.value));
  row("Hauteur de sa voix", pitch, pout);
  card.append(el("p", "sub", "Plus haut = plus aiguë, plus jeune (voix naturelle en ligne seulement)."));
  const test = el("button", "btn", "Tester");
  test.onclick = async () => { const r = await fetch("/api/voix/test", { method: "POST" }); if (!r.ok) hint((await r.json()).error); };
  row("Écouter", test);
  return card;
}

// ---------------------------------------------------------------- état
loaders.etat = async () => {
  const s = await api("/api/state");
  if (s.inner) renderInner(s.inner);
  const stats = $("stats");
  stats.replaceChildren();
  for (const [k, v] of [["Cerveau", s.status], ["Modèle", s.model], ["Voix", s.voice], ["Humeur", s.mood], ["Souvenirs", s.memories],
                        ["Actions", s.actions], ["Corps", s.avatar ? "connecté" : "absent"], ["Ne pas déranger", s.quiet ? "oui" : "non"]]) {
    const d = el("div", "stat"); d.append(el("b", null, k), el("span", null, String(v))); stats.append(d);
  }
};
function renderInner(i) {
  const box = $("innerCards");
  box.replaceChildren();
  const now = el("div", "card");
  now.append(el("h2", null, "Sa vie à elle"), el("p", "sub", "Ce qu'elle fait quand tu ne lui parles pas."));
  for (const [k, v] of [["En ce moment", i.activity], ["Ressenti", i.feeling]]) {
    const r = el("div", "row"); r.append(el("label", null, k), el("span", null, v)); now.append(r);
  }
  const bond = el("div", "row"), bar = el("div", "bond");
  const fill = el("span"); fill.style.width = `${i.affection}%`; bar.append(fill);
  bond.append(el("label", null, "Votre lien"), bar, el("output", null, `${i.affection} %`));
  now.append(bond);
  box.append(now);
  const list = (title, items, empty, render) => {
    const c = el("div", "card"); c.append(el("h2", null, title));
    const ul = el("ul", "list");
    if (!items.length) ul.append(el("li", "empty", empty));
    for (const it of items) ul.append(render(it));
    c.append(ul); box.append(c);
  };
  const li = (txt, meta) => { const l = el("li"); l.append(el("span", "txt", txt), el("span", "meta", meta)); return l; };
  list("Son journal", i.journal, "Pas encore de pensées notées.", (j) => li(j.text, time(j.ts)));
  list("Ce qu'elle veut te redemander", i.followups, "Rien pour l'instant.", (f) => li(f.topic, "vers " + time(f.due)));
  list("Ce qu'elle a lu", i.read, "Rien lu pour l'instant.", (r) => li(r.title, time(r.ts)));
}
$("stateRefresh").onclick = () => loaders.etat();

document.addEventListener("pointerdown", () => { if (prefs.speaker) audio.ensure(); }, { once: true });
connect();
showTab(location.hash.slice(1) || "discussion");

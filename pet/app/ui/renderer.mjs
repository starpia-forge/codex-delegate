import { createStage } from "./stage.mjs";
import { createAnimationClock } from "./animation-clock.mjs";
import { drawingPaused } from "./draw-pause.mjs";
import { frameHandler } from "./frame.mjs";
import { resolvePets } from "./pet-config.mjs";
import { clearanceMask } from "./cursor-clearance.mjs";
import { exitSlot, fitLimit, sceneOffset } from "./layout.mjs";
import { createMessages, subscribeLanguage } from "./messages.mjs";

import { CODEX_V1_FRAME_TIMINGS_MS, frameAt } from "./animations.mjs";

const rows = Object.keys(CODEX_V1_FRAME_TIMINGS_MS);
const invoke = window.__TAURI__.core.invoke;
// Retain the same bytes that the resolver validated, including the sheet MIME.
const files = new Map();
async function readPetFile(path) {
  if (!files.has(path)) {
    try { files.set(path, new Uint8Array(await invoke("read_pet_file", { path }))); }
    catch { files.set(path, null); }
  }
  return files.get(path);
}
async function readBundledFile(path) {
  try {
    const response = await fetch(path);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch { return null; }
}
async function decodeSheet(bytes, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
  } finally { URL.revokeObjectURL(url); }
}
const bundledPackages = { bundledRoot: "./assets", readBundledFile };
let config;
try {
  config = await resolvePets({ ...await invoke("pet_paths"), readFile: readPetFile, ...bundledPackages, decodeSheet });
} catch (error) {
  console.warn("Pet configuration unavailable; using bundled pets", error);
  config = await resolvePets({ home: "", readFile: async () => null, ...bundledPackages });
}
const sheets = new Map(await Promise.all(Object.entries(config.pets).map(async ([slot, artwork]) => {
  const image = new Image();
  const fallback = artwork.fallback?.sheetPath;
  if (artwork.source === "bundled") {
    if (artwork.sheetPath) image.src = artwork.sheetPath;
  } else {
    const bytes = await readPetFile(artwork.sheetPath);
    if (bytes === null) { if (fallback) image.src = fallback; }
    else {
      const url = URL.createObjectURL(new Blob([bytes], { type: artwork.mime }));
      image.onload = () => URL.revokeObjectURL(url);
      image.onerror = () => {
        URL.revokeObjectURL(url);
        image.onload = image.onerror = null;
        if (fallback) image.src = fallback;
      };
      image.src = url;
    }
  }
  return [slot, image];
})));
files.clear();
const stage = createStage({ now: () => Date.now() });
const animation = createAnimationClock({ now: () => performance.now() });
const pause = { hidden: true, fullscreen: false };
const paused = () => drawingPaused(pause);
const root = document.getElementById("stage");
function updateCursor(pointer) {
  const mask = clearanceMask(pointer, config.hideNearCursor && !paused());
  root.style.maskImage = mask;
  root.style.webkitMaskImage = mask;
}
const teams = new Map(), pets = new Map();
const sessionsBadge = document.createElement("span");
sessionsBadge.className = "overflow sessions-overflow";
let catalogue = {}, language = "en";
let message = createMessages(catalogue, language);
function setLanguage(current) {
  language = current;
  message = createMessages(catalogue, language);
  document.documentElement.lang = language;
  render();
}

function render() {
  const snapshot = stage.snapshot();
  const livePets = new Set(), liveTeams = new Set();
  for (const team of snapshot.teams) {
    liveTeams.add(team.key);
    if (!teams.has(team.key)) {
      const node = document.createElement("div");
      node.className = "team";
      root.append(node);
      teams.set(team.key, node);
    }
    // Restore appearance order when a team previously in overflow becomes visible.
    root.append(teams.get(team.key));
    const characters = team.workers.map((worker, index) => ({ ...worker, home: index + 1, id: `worker:${worker.worker}` }));
    if (team.leader) characters.unshift({ ...team.leader, home: 0, id: `leader:${team.key}`, role: "leader" });
    for (const character of characters) {
      livePets.add(character.id);
      if (!pets.has(character.id)) {
        const node = document.createElement("div");
        node.className = "pet";
        const canvas = document.createElement("canvas");
        canvas.width = 192; canvas.height = 208;
        const tag = document.createElement("span");
        tag.className = "tag";
        // Keep the tag's space so hiding it never moves the pet.
        if (!config.nameTags) tag.style.visibility = "hidden";
        node.append(canvas, tag);
        pets.set(character.id, { node, canvas, tag, began: animation.now() });
      }
      const pet = pets.get(character.id);
      // Reconcile order too: the leader may arrive after its workers.
      teams.get(team.key).append(pet.node);
      if (pet.character?.displayState !== character.displayState) pet.began = animation.now();
      pet.character = character;
      pet.team = team.key;
      pet.tag.textContent = character.role === "leader" ? "leader" : `${character.role} · ${character.label}`;
    }
    const teamNode = teams.get(team.key);
    let badge = teamNode.querySelector(".worker-overflow");
    if (team.overflowWorkers) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "overflow worker-overflow";
      }
      badge.textContent = message("overflow.workers", { count: team.overflowWorkers });
      badge.title = message("overflow.workersTooltip", { count: team.overflowWorkers });
      teamNode.append(badge);
    } else badge?.remove();
  }
  for (const [id, pet] of pets) if (!livePets.has(id)) { pet.node.remove(); pets.delete(id); }
  for (const [key, node] of teams) if (!liveTeams.has(key)) { node.remove(); teams.delete(key); }
  if (snapshot.overflowSessions) {
    sessionsBadge.textContent = message("overflow.sessions", { count: snapshot.overflowSessions });
    sessionsBadge.title = message("overflow.sessionsTooltip", { count: snapshot.overflowSessions });
    root.append(sessionsBadge);
  } else sessionsBadge.remove();
  // Measure after reconciling every team: offsetLeft excludes the previous
  // transform and includes the team's actual place in the strip.
  const exits = new Map();
  for (const pet of pets.values()) {
    const geometry = { homeLeft: pet.node.offsetLeft, petWidth: pet.node.offsetWidth, scale: config.scale };
    const slot = exitSlot({ home: pet.character.home, ...geometry });
    exits.set(pet.team, Math.min(exits.get(pet.team) ?? Infinity, slot));
    const offset = sceneOffset(pet.character, geometry);
    pet.node.style.setProperty("--scene-offset", `${offset}px`);
  }
  for (const [key, slot] of exits) stage.setExitSlot(key, slot);
}

function updateFitLimit() {
  stage.setFitLimit(fitLimit({ width: window.innerWidth, scale: config.scale }));
  render();
}

async function setScale(scale) {
  config.scale = scale;
  document.documentElement.style.setProperty("--pet-scale", String(scale));
  updateFitLimit();
  try { await invoke("set_pet_scale", { scale }); }
  catch (error) { console.warn("Pet strip size unavailable", error); }
}

window.addEventListener("resize", updateFitLimit);
await setScale(config.scale);

function draw() {
  requestAnimationFrame(draw);
  // Drawing pauses independently of the wall-time lifecycle interval below.
  if (paused()) return;
  drawFrame();
}

function drawFrame() {
  const time = animation.now();
  stage.tick();
  render();
  for (const pet of pets.values()) {
    const { displayState: state, role } = pet.character;
    const sheet = sheets.get(role) ?? sheets.get("implementer");
    if (!sheet.complete || !sheet.naturalWidth) continue;
    const frame = frameAt(state, time - pet.began);
    const ctx = pet.canvas.getContext("2d");
    ctx.clearRect(0, 0, 192, 208);
    ctx.drawImage(sheet, frame * 192, rows.indexOf(state) * 208, 192, 208, 0, 0, 192, 208);
  }
}

function update() {
  invoke("computer_use_live", { live: stage.computerUseLive() }).catch(() => {});
  if (!paused()) render();
}
function updatePause() {
  animation.setPaused(paused());
  // Drop the previous position immediately; resume waits for a fresh sample.
  if (paused()) updateCursor(null);
  if (!paused()) render();
}
await window.__TAURI__.event.listen("pet-event", ({ payload }) => { stage.apply(payload); update(); });
await window.__TAURI__.event.listen("pet-liveness", ({ payload }) => { stage.liveness(payload); update(); });
await window.__TAURI__.event.listen("pet-cursor", ({ payload }) => updateCursor(payload));
let fullscreenEvents = 0, visibilityEvents = 0;
// Subscribe before reading either preferences or the catalogue. An event received
// during startup wins over a potentially older command response.
const languageSubscription = await subscribeLanguage(window.__TAURI__.event.listen, setLanguage);
catalogue = await invoke("messages");
setLanguage(language);
await window.__TAURI__.event.listen("pet-fullscreen", ({ payload }) => {
  fullscreenEvents++;
  pause.fullscreen = payload;
  updatePause();
});
await window.__TAURI__.event.listen("pet-visibility", ({ payload }) => {
  visibilityEvents++;
  pause.hidden = payload.hidden;
  updatePause();
});
await window.__TAURI__.event.listen("pet-frame", frameHandler({
  drawFrame, computerUseLive: () => stage.computerUseLive(), invoke,
}));
const fullscreenVersion = fullscreenEvents;
const fullscreen = await invoke("fullscreen_paused");
if (fullscreenVersion === fullscreenEvents) pause.fullscreen = fullscreen;
const visibilityVersion = visibilityEvents;
const preferences = await languageSubscription.read(() => invoke("pet_preferences"));
if (visibilityVersion === visibilityEvents) pause.hidden = preferences.hidden === true;
updatePause();
await invoke("set_cursor_clearance", { enabled: config.hideNearCursor });
await window.__TAURI__.core.invoke("renderer_ready");
// Lifecycle runs on wall time even when animation frames are paused.
setInterval(() => { stage.tick(); update(); }, 250);
requestAnimationFrame(draw);

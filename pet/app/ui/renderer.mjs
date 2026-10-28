import { createStage } from "./stage.mjs";
import { resolvePets } from "./pet-config.mjs";
import { fitLimit } from "./layout.mjs";

import { CODEX_V1_FRAME_TIMINGS_MS } from "./animations.mjs";

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
let config;
try {
  config = await resolvePets({ ...await invoke("pet_paths"), readFile: readPetFile });
} catch (error) {
  console.warn("Pet configuration unavailable; using bundled pets", error);
  config = await resolvePets({ home: "", readFile: async () => null });
}
const sheets = new Map(await Promise.all(Object.entries(config.pets).map(async ([slot, artwork]) => {
  const image = new Image();
  const fallback = `./assets/${slot}/spritesheet.png`;
  if (artwork.source === "bundled") image.src = `./assets/${artwork.name}/spritesheet.png`;
  else {
    const bytes = await readPetFile(artwork.sheetPath);
    if (bytes === null) image.src = fallback;
    else {
      const url = URL.createObjectURL(new Blob([bytes], { type: artwork.mime }));
      image.onload = () => URL.revokeObjectURL(url);
      image.onerror = () => {
        URL.revokeObjectURL(url);
        image.onload = image.onerror = null;
        image.src = fallback;
      };
      image.src = url;
    }
  }
  return [slot, image];
})));
files.clear();
const stage = createStage({ now: () => Date.now() });
const root = document.getElementById("stage");
const teams = new Map(), pets = new Map();
const sessionsBadge = document.createElement("span");
sessionsBadge.className = "overflow sessions-overflow";

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
    // Restore appearance order when a previously hidden team becomes visible.
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
        node.append(canvas, tag);
        pets.set(character.id, { node, canvas, tag, began: performance.now() });
      }
      const pet = pets.get(character.id);
      // Reconcile order too: the leader may arrive after its workers.
      teams.get(team.key).append(pet.node);
      if (pet.character?.displayState !== character.displayState) pet.began = performance.now();
      // Flex owns the home slots; scenes only translate within the team.
      pet.node.style.setProperty("--scene-offset", String(character.x - character.home));
      pet.character = character;
      pet.tag.textContent = character.role === "leader" ? "leader" : `${character.role} · ${character.label}`;
    }
    const teamNode = teams.get(team.key);
    let badge = teamNode.querySelector(".worker-overflow");
    if (team.hiddenWorkers) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "overflow worker-overflow";
      }
      badge.textContent = `+${team.hiddenWorkers}`;
      badge.title = `${team.hiddenWorkers} hidden workers`;
      teamNode.append(badge);
    } else badge?.remove();
  }
  for (const [id, pet] of pets) if (!livePets.has(id)) { pet.node.remove(); pets.delete(id); }
  for (const [key, node] of teams) if (!liveTeams.has(key)) { node.remove(); teams.delete(key); }
  if (snapshot.hiddenSessions) {
    sessionsBadge.textContent = `+${snapshot.hiddenSessions} sessions`;
    sessionsBadge.title = sessionsBadge.textContent;
    root.append(sessionsBadge);
  } else sessionsBadge.remove();
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

function draw(time) {
  stage.tick();
  render();
  for (const pet of pets.values()) {
    const { displayState: state, role } = pet.character;
    const sheet = sheets.get(role) ?? sheets.get("implementer");
    if (!sheet.complete || !sheet.naturalWidth) continue;
    const timings = CODEX_V1_FRAME_TIMINGS_MS[state];
    let elapsed = (time - pet.began) % timings.reduce((a, b) => a + b, 0), frame = 0;
    while (elapsed >= timings[frame]) elapsed -= timings[frame++];
    const ctx = pet.canvas.getContext("2d");
    ctx.clearRect(0, 0, 192, 208);
    ctx.drawImage(sheet, frame * 192, rows.indexOf(state) * 208, 192, 208, 0, 0, 192, 208);
  }
  requestAnimationFrame(draw);
}

await window.__TAURI__.event.listen("pet-event", ({ payload }) => { stage.apply(payload); render(); });
await window.__TAURI__.event.listen("pet-liveness", ({ payload }) => { stage.liveness(payload); render(); });
await window.__TAURI__.core.invoke("renderer_ready");
// Lifecycle runs on wall time even when animation frames are paused.
setInterval(() => { stage.tick(); render(); }, 250);
requestAnimationFrame(draw);

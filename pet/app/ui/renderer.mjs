import { createStage } from "./stage.mjs";

// Codex v1 row order and per-frame durations in milliseconds. These timings
// are provisional: exact Codex timings were not supplied with the v1 contract.
// Replace this single table when verified upstream values are available.
const CODEX_V1_FRAME_TIMINGS_MS = {
  idle: [240, 160, 180, 240, 160, 200],
  "running-right": [80, 80, 80, 80, 80, 80, 80, 80],
  "running-left": [80, 80, 80, 80, 80, 80, 80, 80],
  waving: [160, 120, 160, 220],
  jumping: [120, 100, 180, 100, 160],
  failed: [140, 100, 100, 140, 100, 100, 180, 240],
  waiting: [240, 160, 160, 240, 160, 240],
  running: [100, 100, 100, 100, 100, 160],
  review: [180, 120, 120, 180, 120, 240],
};
const rows = Object.keys(CODEX_V1_FRAME_TIMINGS_MS);
const roles = ["leader", "researcher", "critic", "implementer", "computer-user"];
const sheets = new Map(roles.map(role => {
  const image = new Image();
  image.src = `./assets/${role}/spritesheet.png`;
  return [role, image];
}));
const stage = createStage({ now: () => Date.now() });
const root = document.getElementById("stage");
const teams = new Map(), pets = new Map();

function render() {
  const snapshot = stage.snapshot();
  const liveWorkers = new Set(), liveTeams = new Set();
  for (const team of snapshot.teams) {
    liveTeams.add(team.key);
    if (!teams.has(team.key)) {
      const node = document.createElement("div");
      node.className = "team";
      root.append(node);
      teams.set(team.key, node);
    }
    for (const worker of team.workers) {
      liveWorkers.add(worker.worker);
      if (!pets.has(worker.worker)) {
        const node = document.createElement("div");
        node.className = "pet";
        const canvas = document.createElement("canvas");
        canvas.width = 192; canvas.height = 208;
        const tag = document.createElement("span");
        tag.className = "tag";
        node.append(canvas, tag);
        pets.set(worker.worker, { node, canvas, tag, began: performance.now() });
      }
      const pet = pets.get(worker.worker);
      if (pet.node.parentNode !== teams.get(team.key)) teams.get(team.key).append(pet.node);
      pet.worker = worker;
      pet.tag.textContent = `${worker.role} · ${worker.label}`;
    }
  }
  for (const [id, pet] of pets) if (!liveWorkers.has(id)) { pet.node.remove(); pets.delete(id); }
  for (const [key, node] of teams) if (!liveTeams.has(key)) { node.remove(); teams.delete(key); }
}

function draw(time) {
  for (const pet of pets.values()) {
    const { state, role } = pet.worker;
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
await window.__TAURI__.core.invoke("renderer_ready");
setInterval(() => { stage.tick(); render(); }, 250);
requestAnimationFrame(draw);

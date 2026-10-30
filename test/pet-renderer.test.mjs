import assert from "node:assert/strict";
import test from "node:test";

// Minimal browser/Tauri boundaries; run the real renderer, resolver and stage.
class Element {
  children = [];
  style = { display: "", setProperty(key, value) { this[key] = value; } };
  offsetLeft = 0;
  offsetWidth = 139;
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
    this.parent = null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    return this.children.flatMap(node => [
      ...(node.className?.split(" ").includes(selector.slice(1)) ? [node] : []),
      ...node.querySelectorAll(selector),
    ]);
  }
}

let run = 0;
async function renderer(t, { preferences = { hidden: false, nameTags: true, language: "en" }, onRead } = {}) {
  const root = new Element(), listeners = new Map();
  const emit = (name, payload) => listeners.get(name)?.({ payload });
  const globals = {
    document: { getElementById: () => root, createElement: () => new Element(), documentElement: new Element() },
    window: { innerWidth: 2000, addEventListener() {}, __TAURI__: {
      core: { async invoke(command) {
        if (command === "pet_paths") return { home: "", codexHome: "" };
        if (command === "read_pet_file") throw new Error("No custom files");
        if (command === "messages") return {};
        if (command === "fullscreen_paused") return false;
        if (command === "pet_preferences") { await onRead?.(emit); return preferences; }
      } },
      event: { async listen(name, handler) { listeners.set(name, handler); return () => listeners.delete(name); } },
    } },
    Image: class {},
    fetch: async () => ({ ok: false }),
    setInterval() {},
    requestAnimationFrame() {},
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  await import(`../pet/app/ui/renderer.mjs?test=${++run}`);
  return { root, emit, add(worker) {
    emit("pet-event", { v: 1, source: "worker", team: "123", session: "session-a",
      worker, role: "implementer", label: worker, at: Date.now(), seq: 1, type: "start" });
  } };
}

test("tray name-tag changes set display immediately for existing and future pets", async t => {
  const h = await renderer(t);
  h.add("first");
  assert.equal(h.root.querySelectorAll(".tag").length, 1);
  h.emit("pet-name-tags", { nameTags: false });
  assert.equal(h.root.querySelector(".tag").style.display, "none");
  h.add("second");
  const tags = h.root.querySelectorAll(".tag");
  assert.equal(tags.length, 2);
  assert.ok(tags.every(tag => tag.style.display === "none"));
  h.emit("pet-name-tags", { nameTags: true });
  assert.ok(tags.every(tag => tag.style.display === ""));
});

test("the renderer restores the stored name-tag choice at startup", async t => {
  const h = await renderer(t, { preferences: { hidden: false, nameTags: false, language: "en" } });
  h.add("first");
  assert.equal(h.root.querySelector(".tag").style.display, "none");
});

test("a tray toggle during startup wins over an older preference response", async t => {
  const h = await renderer(t, { onRead: emit => emit("pet-name-tags", { nameTags: false }) });
  h.add("first");
  assert.equal(h.root.querySelector(".tag").style.display, "none");
});

test("name tags can change while pets are hidden and apply to pets added before showing", async t => {
  const h = await renderer(t);
  h.add("first");
  h.emit("pet-visibility", { hidden: true });
  h.emit("pet-name-tags", { nameTags: false });
  assert.equal(h.root.querySelector(".tag").style.display, "none");
  h.add("second");
  h.emit("pet-visibility", { hidden: false });
  const tags = h.root.querySelectorAll(".tag");
  assert.equal(tags.length, 2);
  assert.ok(tags.every(tag => tag.style.display === "none"));
  h.emit("pet-visibility", { hidden: true });
  h.emit("pet-name-tags", { nameTags: true });
  assert.ok(tags.every(tag => tag.style.display === ""));
});

test("missing name-tag preferences default to visible", async t => {
  const h = await renderer(t, { preferences: { hidden: false, language: "en" } });
  h.add("first");
  assert.equal(h.root.querySelector(".tag").style.display, "");
});

test("turning cursor clearance off clears both masks immediately and ignores late pointer events", async t => {
  const h = await renderer(t);
  h.emit("pet-cursor", { x: 300, y: 80 });
  assert.match(h.root.style.maskImage, /radial-gradient/);
  h.emit("pet-cursor-clearance", { cursorClearance: false });
  assert.equal(h.root.style.maskImage, "none");
  assert.equal(h.root.style.webkitMaskImage, "none");
  h.emit("pet-cursor", { x: 301, y: 80 });
  assert.equal(h.root.style.maskImage, "none");
  assert.equal(h.root.style.webkitMaskImage, "none");
  h.emit("pet-cursor-clearance", { cursorClearance: true });
  h.emit("pet-cursor", { x: 302, y: 80 });
  assert.match(h.root.style.maskImage, /circle at 302px 80px/);
  assert.equal(h.root.style.webkitMaskImage, h.root.style.maskImage);
});

test("cursor clearance restores the stored off choice at startup", async t => {
  const h = await renderer(t, { preferences: { hidden: false, cursorClearance: false, language: "en" } });
  h.emit("pet-cursor", { x: 300, y: 80 });
  assert.equal(h.root.style.maskImage, "none");
  assert.equal(h.root.style.webkitMaskImage, "none");
});

test("a cursor-clearance toggle during startup wins over an older preference response", async t => {
  const h = await renderer(t, { onRead: emit => emit("pet-cursor-clearance", { cursorClearance: false }) });
  h.emit("pet-cursor", { x: 300, y: 80 });
  assert.equal(h.root.style.maskImage, "none");
});

test("cursor clearance can toggle while hidden and takes effect when pets are shown", async t => {
  const h = await renderer(t);
  h.emit("pet-visibility", { hidden: true });
  h.emit("pet-cursor-clearance", { cursorClearance: false });
  h.emit("pet-visibility", { hidden: false });
  h.emit("pet-cursor", { x: 300, y: 80 });
  assert.equal(h.root.style.maskImage, "none");
  h.emit("pet-visibility", { hidden: true });
  h.emit("pet-cursor-clearance", { cursorClearance: true });
  assert.equal(h.root.style.maskImage, "none");
  h.emit("pet-visibility", { hidden: false });
  h.emit("pet-cursor", { x: 310, y: 80 });
  assert.match(h.root.style.maskImage, /circle at 310px 80px/);
});

import assert from "node:assert/strict";
import test from "node:test";

// Minimal browser/Tauri boundaries; run the real renderer, resolver and stage.
class Element {
  children = [];
  style = { visibility: "", setProperty(key, value) { this[key] = value; } };
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

test("tray name-tag changes apply immediately to existing and future pets", async t => {
  const h = await renderer(t);
  h.add("first");
  assert.equal(h.root.querySelectorAll(".tag").length, 1);
  h.emit("pet-name-tags", { nameTags: false });
  assert.equal(h.root.querySelector(".tag").style.visibility, "hidden");
  h.add("second");
  const tags = h.root.querySelectorAll(".tag");
  assert.equal(tags.length, 2);
  assert.ok(tags.every(tag => tag.style.visibility === "hidden"));
  h.emit("pet-name-tags", { nameTags: true });
  assert.ok(tags.every(tag => tag.style.visibility === "visible"));
});

test("the renderer restores the stored name-tag choice at startup", async t => {
  const h = await renderer(t, { preferences: { hidden: false, nameTags: false, language: "en" } });
  h.add("first");
  assert.equal(h.root.querySelector(".tag").style.visibility, "hidden");
});

test("a tray toggle during startup wins over an older preference response", async t => {
  const h = await renderer(t, { onRead: emit => emit("pet-name-tags", { nameTags: false }) });
  h.add("first");
  assert.equal(h.root.querySelector(".tag").style.visibility, "hidden");
});

test("name tags can change while pets are hidden and apply to pets added before showing", async t => {
  const h = await renderer(t);
  h.add("first");
  h.emit("pet-visibility", { hidden: true });
  h.emit("pet-name-tags", { nameTags: false });
  assert.equal(h.root.querySelector(".tag").style.visibility, "hidden");
  h.add("second");
  h.emit("pet-visibility", { hidden: false });
  const tags = h.root.querySelectorAll(".tag");
  assert.equal(tags.length, 2);
  assert.ok(tags.every(tag => tag.style.visibility === "hidden"));
  h.emit("pet-visibility", { hidden: true });
  h.emit("pet-name-tags", { nameTags: true });
  assert.ok(tags.every(tag => tag.style.visibility === "visible"));
});

test("missing name-tag preferences default to visible", async t => {
  const h = await renderer(t, { preferences: { hidden: false, language: "en" } });
  h.add("first");
  assert.equal(h.root.querySelector(".tag").style.visibility, "visible");
});

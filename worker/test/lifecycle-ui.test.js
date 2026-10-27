import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

class Element {
  children = [];
  events = {};
  dataset = {};
  textContent = "";
  value = "";
  disabled = false;
  className = "";
  constructor(tag = "div") { this.tag = tag; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.events[name] = callback; }
  dispatchEvent(event) { this.events[event.type]?.(event); }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    const data = selector.match(/^\[data-([a-z-]+)\]$/);
    if (data) return Object.hasOwn(this.dataset, data[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()));
    return this.tag === selector;
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const talent = { talent_code: "TES1", display_name: "Canonical fixture", revision: 7,
  retrieval_enabled: true, processing_enabled: false };
const permissionTalent = { id: "permission-fixture", displayName: "Permission display name",
  talentCode: "TES1", active: true, catalogActive: true };
const tick = () => new Promise(resolve => setImmediate(resolve));
const setup = async ({ postStatus = 200, writesEnabled = true,
  catalog = [permissionTalent], controls = [talent], holdWrite = false, legacyMarkup = false } = {}) => {
  const admin = new Element(), root = new Element();
  root.dataset.lifecycleRoot = "";
  admin.append(root);
  const fields = new Map();
  for (const name of ["admin-status", "admin-content", "add-user-form", "add-talent-form",
    "user-search", "user-list", "empty-selection", "user-editor", "editor-title", "delete-user",
    "product-editor", "managed-grants", "catalog-sync-status", "talent-list", "audit-list"]) {
    const field = new Element(name.includes("form") ? "form" : "div");
    const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    field.dataset[key] = "";
    fields.set(name, field);
    (name === "talent-list" && !legacyMarkup ? root : admin).append(field);
  }
  const unmapped = new Element(), status = new Element(), refresh = new Element("button");
  unmapped.dataset[legacyMarkup ? "lifecycleList" : "lifecycleUnmapped"] = "";
  status.dataset.lifecycleStatus = refresh.dataset.lifecycleRefresh = "";
  root.append(status, refresh, unmapped);
  const calls = [];
  let failReads = false, releaseWrite;
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  const context = {
    document: { querySelector: selector => selector === "[data-admin-root]" ? admin : admin.querySelector(selector),
      createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element("text"), { textContent: text }) },
    Event: class { constructor(type) { this.type = type; } }, Headers,
    fetch: async (path, options = {}) => {
      const method = options.method || "GET";
      calls.push({ path, ...options, method });
      if (path === "/api/admin/state") return { ok: true, json: async () => ({
        admin: { email: "fixture@example.invalid" }, users: [], products: [], talents: catalog,
        catalogSync: null, audit: []
      }) };
      if (method === "POST" && holdWrite) await writeGate;
      const resultStatus = method === "POST" ? postStatus : failReads ? 503 : 200;
      return { ok: resultStatus === 200, json: async () => resultStatus === 200
        ? { talents: controls, writes_enabled: writesEnabled } : { error: "Refresh before saving" } };
    }
  };
  for (const name of ["admin-permissions.js", "admin-lifecycle.js"]) {
    runInNewContext(readFileSync(new URL(`../../site/assets/js/${name}`, import.meta.url), "utf8"), context);
  }
  await tick();
  return { root, list: fields.get("talent-list"), unmapped, status, refresh, calls,
    releaseWrite, failReads: () => { failReads = true; } };
};

test("permission settings and lifecycle actions share one talent card and save the displayed revision", async () => {
  const ui = await setup();
  assert.equal(ui.list.children.length, 1);
  assert.equal(ui.unmapped.children.length, 0);
  const card = ui.list.children[0];
  const form = card.querySelector("form");
  assert.ok(form);
  assert.equal(form.querySelector("button").textContent, "Save access");
  const actions = card.querySelectorAll("[data-lifecycle-action]");
  assert.equal(actions[0].textContent, "Stop collection");
  assert.equal(actions[1].textContent, "Resume processing");
  assert.ok(actions.every(button => button.type === "button"));
  await actions[1].events.click();
  const posts = ui.calls.filter(call => call.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, "/api/admin/lifecycle/TES1");
  assert.deepEqual(JSON.parse(posts[0].body), { action: "resume", expected_revision: 7 });
  assert.equal(posts[0].headers["X-SDA-Admin"], "1");
  assert.equal(ui.calls.filter(call => call.method === "PUT").length, 0);
});

test("exact talent codes join controls; manual talents stay permission-only; unlinked canonical talents remain visible", async () => {
  const ui = await setup({ catalog: [permissionTalent,
    { ...permissionTalent, id: "manual", talentCode: null, displayName: talent.display_name }],
    controls: [talent, { ...talent, talent_code: "TES2", display_name: permissionTalent.displayName }] });
  assert.equal(ui.list.children.length, 2);
  assert.equal(ui.list.children[0].querySelectorAll("[data-lifecycle-action]").length, 2);
  assert.equal(ui.list.children[1].querySelectorAll("[data-lifecycle-action]").length, 0);
  assert.equal(ui.unmapped.children.length, 1);
  const unlinked = ui.unmapped.children[0];
  assert.equal(unlinked.querySelectorAll("form").length, 0);
  await unlinked.querySelectorAll("[data-lifecycle-action]")[0].events.click();
  assert.equal(ui.calls.find(call => call.method === "POST").path, "/api/admin/lifecycle/TES2");
});

test("revision conflicts refresh without retries; failed status reads preserve permission forms and remove stale controls", async () => {
  const ui = await setup({ postStatus: 409 });
  await ui.list.querySelectorAll("[data-lifecycle-action]")[0].events.click();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.match(ui.status.textContent, /will not be retried/);
  ui.failReads();
  await ui.refresh.events.click();
  assert.equal(ui.list.querySelectorAll("form").length, 1);
  assert.equal(ui.list.querySelectorAll("[data-lifecycle-action]").length, 0);
  assert.equal(ui.list.querySelector("button").disabled, false);
});

test("lifecycle busy state and rollout gate do not disable or submit permission controls", async () => {
  const ui = await setup({ holdWrite: true });
  const pending = ui.list.querySelectorAll("[data-lifecycle-action]")[0].events.click();
  assert.equal(ui.list.querySelector("form").querySelector("button").disabled, false);
  assert.ok(ui.list.querySelectorAll("[data-lifecycle-action]").every(button => button.disabled));
  ui.releaseWrite();
  await pending;
  const gated = await setup({ writesEnabled: false });
  assert.ok(gated.list.querySelectorAll("[data-lifecycle-action]").every(button => button.disabled));
  assert.equal(gated.list.querySelector("form").querySelector("button").disabled, false);
});

test("already-open older page markup keeps working during the frontend rollout", async () => {
  const ui = await setup({ legacyMarkup: true });
  assert.equal(ui.list.querySelectorAll("form").length, 1);
  assert.equal(ui.unmapped.querySelectorAll("[data-lifecycle-action]").length, 2);
  await ui.unmapped.querySelectorAll("[data-lifecycle-action]")[0].events.click();
  assert.equal(ui.calls.find(call => call.method === "POST").path, "/api/admin/lifecycle/TES1");
});

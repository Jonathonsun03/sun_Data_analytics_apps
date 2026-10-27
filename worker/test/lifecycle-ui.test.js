import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

class Element {
  children = [];
  events = {};
  textContent = "";
  disabled = false;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(selector === "button" && child.tag === "button" ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
}
const talent = { talent_code: "TES1", display_name: "Fixture", revision: 7,
  retrieval_enabled: true, processing_enabled: false };
const tick = () => new Promise(resolve => setImmediate(resolve));
const setup = async (postStatus = 200, writesEnabled = true) => {
  const root = new Element(), list = new Element(), status = new Element(), refresh = new Element();
  refresh.tag = "button";
  root.append(list, status, refresh);
  root.querySelector = selector => ({ "[data-lifecycle-list]": list, "[data-lifecycle-status]": status,
    "[data-lifecycle-refresh]": refresh }[selector]);
  const calls = [];
  let failReads = false;
  runInNewContext(readFileSync(new URL("../../site/assets/js/admin-lifecycle.js", import.meta.url), "utf8"), {
    document: { querySelector: () => root, createElement: tag => Object.assign(new Element(), { tag }) },
    fetch: async (path, options) => {
      calls.push({ path, ...options });
      const status = options.method === "POST" ? postStatus : failReads ? 503 : 200;
      return { ok: status === 200, json: async () => status === 200
        ? { talents: [talent], writes_enabled: writesEnabled } : { error: "Refresh before saving" } };
    }
  });
  await tick();
  return { root, list, status, refresh, calls, failReads: () => { failReads = true; } };
};

test("admin lifecycle renders read-only state initially and saves exactly the displayed revision", async () => {
  const ui = await setup();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].method, "GET");
  const buttons = ui.list.querySelectorAll("button");
  assert.equal(buttons[0].textContent, "Stop collection");
  assert.equal(buttons[1].textContent, "Resume processing");
  await buttons[1].events.click();
  await tick();
  const posts = ui.calls.filter(call => call.method === "POST");
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].body), { action: "resume", expected_revision: 7 });
  assert.equal(posts[0].headers["X-SDA-Admin"], "1");
});

test("revision conflicts refresh state without retrying writes; failed refresh removes controls", async () => {
  const ui = await setup(409);
  ui.list.querySelectorAll("button")[0].events.click();
  await tick();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.match(ui.status.textContent, /will not be retried/);
  ui.failReads();
  await ui.refresh.events.click();
  assert.equal(ui.list.children.length, 0);
});

test("rollout gate keeps all lifecycle action buttons disabled", async () => {
  const ui = await setup(200, false);
  assert.ok(ui.list.querySelectorAll("button").every(button => button.disabled));
});

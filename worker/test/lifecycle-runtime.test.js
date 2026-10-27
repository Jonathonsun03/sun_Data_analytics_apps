import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Miniflare } from "miniflare";

const secret = "disposable-fixture-secret-".repeat(3);
const compatibilityDate = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")
  .match(/"compatibility_date"\s*:\s*"([^"]+)"/)[1];

const runtime = (upstream) => new Miniflare({
  compatibilityDate,
  modulesRoot: "/fixture",
  modules: [
    { type: "ESModule", path: "/fixture/entry.js", contents: `
      import { handleLifecycleRequest } from './lifecycle.js';
      export default { async fetch(request, env) {
        return handleLifecycleRequest(request, env, new URL(request.url), 'fixture@example.invalid');
      }};` },
    ...["lifecycle.js", "admin.js"].map(name => ({
      type: "ESModule", path: `/fixture/${name}`,
      contents: readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8")
    }))
  ],
  bindings: { TALENT_LIFECYCLE_ORIGIN: "https://origin.example.invalid",
    TALENT_BRIDGE_SECRET: secret, TALENT_LIFECYCLE_WRITES_ENABLED: "true" },
  // No real network, identity, catalog, records or credentials are used.
  outboundService: upstream
});

test("Cloudflare runtime handles lifecycle reads and writes with the native fetch adapter", async () => {
  const calls = [];
  const mf = runtime(async request => {
    assert.equal(request.headers.get("Authorization"), `Bearer ${secret}`);
    assert.equal(request.headers.get("X-SDA-Lifecycle-Actor"), "fixture@example.invalid");
    calls.push({ method: request.method, url: request.url,
      body: request.method === "POST" ? await request.json() : null });
    return Response.json(request.method === "GET" ? { talents: [{ talent_code: "TES1" }] }
      : { talent_code: "TES1", revision: 1, retrieval_enabled: true, processing_enabled: false });
  });
  try {
    const read = await mf.dispatchFetch("https://apps.example.invalid/api/admin/lifecycle");
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { talents: [{ talent_code: "TES1" }], writes_enabled: true });
    const write = await mf.dispatchFetch("https://apps.example.invalid/api/admin/lifecycle/TES1", {
      method: "POST", headers: { Origin: "https://apps.example.invalid", "X-SDA-Admin": "1",
        "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause", expected_revision: 0 })
    });
    assert.equal(write.status, 200);
    assert.equal((await write.json()).processing_enabled, false);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body, { action: "pause", expected_revision: 0 });
  } finally { await mf.dispose(); }
});

test("Cloudflare runtime rejects origin redirects without forwarding the bridge credential", async () => {
  let calls = 0;
  const mf = runtime(async request => {
    calls++;
    assert.equal(new URL(request.url).hostname, "origin.example.invalid");
    return new Response("Redirect", { status: 302, headers: { Location: "https://elsewhere.example.invalid/" } });
  });
  try {
    const result = await mf.dispatchFetch("https://apps.example.invalid/api/admin/lifecycle");
    assert.equal(result.status, 503);
    assert.equal(calls, 1);
  } finally { await mf.dispose(); }
});

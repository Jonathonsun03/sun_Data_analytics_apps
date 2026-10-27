import assert from "node:assert/strict";
import test from "node:test";
import { handleLifecycleRequest } from "../src/lifecycle.js";
import worker from "../src/index.js";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const env = { TALENT_LIFECYCLE_ORIGIN: "https://control.example.com",
  TALENT_BRIDGE_SECRET: "fixture-secret-".repeat(3), TALENT_LIFECYCLE_WRITES_ENABLED: "true" };
const request = (body, extra = {}) => new Request("https://apps.example.com/api/admin/lifecycle/TES1", {
  method: "POST", headers: { "Origin": "https://apps.example.com", "X-SDA-Admin": "1",
    "Content-Type": "application/json", "Authorization": "browser-credential",
    "X-SDA-Lifecycle-Actor": "spoof@example.com", ...extra }, body: JSON.stringify(body)
});
const call = (req, fetcher, config = env) => handleLifecycleRequest(req, config, new URL(req.url), "admin@example.com", fetcher);

test("Worker sends only verified actor, service credential and validated change; preserves 409", async () => {
  let count = 0;
  const result = await call(request({ action: "pause", expected_revision: 2 }), async (url, options) => {
    count++;
    assert.equal(url.href, "https://control.example.com/v1/talents/TES1");
    assert.equal(options.headers["Authorization"], `Bearer ${env.TALENT_BRIDGE_SECRET}`);
    assert.equal(options.headers["X-SDA-Lifecycle-Actor"], "admin@example.com");
    assert.equal(Object.keys(options.headers).length, 3);
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { action: "pause", expected_revision: 2 });
    return Response.json({ error: "Refresh before saving" }, { status: 409 });
  });
  assert.equal(result.status, 409);
  assert.equal(count, 1);
});

test("cross-origin, missing admin header, invalid changes and disabled writes never reach origin", async () => {
  const never = () => { throw new Error("Must not call origin"); };
  for (const [body, headers, config, status] of [
    [{ action: "pause", expected_revision: 0 }, { Origin: "https://evil.example" }, env, 403],
    [{ action: "pause", expected_revision: 0 }, { "X-SDA-Admin": "0" }, env, 403],
    [{ action: "delete", expected_revision: 0 }, {}, env, 400],
    [{ action: "pause", expected_revision: true }, {}, env, 400],
    [{ action: "pause", expected_revision: 0, actor: "spoof@example.com" }, {}, env, 400],
    [{ action: "pause", expected_revision: 0 }, {}, { ...env, TALENT_LIFECYCLE_WRITES_ENABLED: "false" }, 503]
  ]) assert.equal((await call(request(body, headers), never, config)).status, status);
});

test("bounded body, bad upstream and status reads fail safely", async () => {
  assert.equal((await call(request({ action: "x".repeat(5000), expected_revision: 0 }), () => {})).status, 413);
  assert.equal((await call(request({ action: "pause", expected_revision: 0 }), async () => {
    throw new Error("secret must not be returned");
  })).status, 503);
  const get = new Request("https://apps.example.com/api/admin/lifecycle");
  const result = await call(get, async () => Response.json({ talents: [] }));
  assert.deepEqual(await result.json(), { talents: [], writes_enabled: true });
});

test("missing Access JWT cannot bypass administrator checks with spoofed headers", async () => {
  const req = request({ action: "pause", expected_revision: 0 });
  const result = await worker.fetch(req, { ...env, DB: {}, TEAM_DOMAIN: "https://team.example.com",
    POLICY_AUD: "fixture-audience", ADMIN_EMAIL: "admin@example.com" });
  assert.equal(result.status, 401);
});

test("a valid nonadministrator JWT is denied even with spoofed administrator headers", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "fixture-key", alg: "RS256", use: "sig" };
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const issuer = `http://127.0.0.1:${server.address().port}`;
    const token = await new SignJWT({ email: "client@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
      .setIssuer(issuer).setAudience("fixture-audience").setExpirationTime("5m").sign(privateKey);
    const result = await worker.fetch(request({ action: "pause", expected_revision: 0 }, {
      "Cf-Access-Jwt-Assertion": token, "X-SDA-Verified-Email": "admin@example.com",
      "Cf-Access-Authenticated-User-Email": "admin@example.com"
    }), { ...env, DB: {}, TEAM_DOMAIN: issuer, POLICY_AUD: "fixture-audience", ADMIN_EMAIL: "admin@example.com" });
    assert.equal(result.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizedEmail,
  requireAdminWriteRequest,
  talentIdForName,
  validateUserUpdatePayload
} from "../src/admin.js";
import { configuredAdminEmail, isAdminEmail } from "../src/index.js";

test("admin email comparison uses the verified normalized address", () => {
  const env = { ADMIN_EMAIL: " Jonathon@Example.com " };

  assert.equal(configuredAdminEmail(env), "jonathon@example.com");
  assert.equal(isAdminEmail("JONATHON@example.com", env), true);
  assert.equal(isAdminEmail("client@example.com", env), false);
  assert.equal(isAdminEmail("jonathon@example.com", {}), false);
});

test("email normalization does not accept non-string values", () => {
  assert.equal(normalizedEmail(" USER@Example.com "), "user@example.com");
  assert.equal(normalizedEmail(null), "");
});

test("talent IDs are stable URL-safe slugs", () => {
  assert.equal(talentIdForName("Téri Berri"), "teri-berri");
  assert.equal(talentIdForName("  Talent A  "), "talent-a");
});

test("user update validation normalizes and deduplicates talent IDs", () => {
  assert.deepEqual(
    validateUserUpdatePayload({
      email: " Client@Example.com ",
      active: true,
      manualAccess: [
        {
          productId: "youtube-analytics",
          talentIds: ["talent-a", "talent-a", "talent-b"]
        }
      ]
    }),
    {
      email: "client@example.com",
      active: true,
      manualAccess: [
        {
          productId: "youtube-analytics",
          talentIds: ["talent-a", "talent-b"]
        }
      ]
    }
  );
});

test("user update validation rejects duplicate products", () => {
  assert.throws(
    () =>
      validateUserUpdatePayload({
        email: "client@example.com",
        active: true,
        manualAccess: [
          { productId: "youtube-analytics", talentIds: [] },
          { productId: "youtube-analytics", talentIds: [] }
        ]
      }),
    /duplicated/
  );
});

test("admin writes require both same-origin and the custom request header", () => {
  const url = new URL("https://apps.sun-dataanalytics.com/api/admin/users");
  const validRequest = new Request(url, {
    method: "POST",
    headers: {
      Origin: url.origin,
      "X-SDA-Admin": "1"
    }
  });

  assert.doesNotThrow(() => requireAdminWriteRequest(validRequest, url));

  const crossOriginRequest = new Request(url, {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      "X-SDA-Admin": "1"
    }
  });
  assert.throws(
    () => requireAdminWriteRequest(crossOriginRequest, url),
    /Cross-origin/
  );

  const missingHeaderRequest = new Request(url, {
    method: "POST",
    headers: { Origin: url.origin }
  });
  assert.throws(
    () => requireAdminWriteRequest(missingHeaderRequest, url),
    /header is missing/
  );
});

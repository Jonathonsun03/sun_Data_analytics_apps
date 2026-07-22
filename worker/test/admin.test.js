import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteTalent,
  deleteUser,
  normalizedEmail,
  requireAdminWriteRequest,
  talentIdForName,
  validateUserUpdatePayload
} from "../src/admin.js";
import { configuredAdminEmail, isAdminEmail } from "../src/index.js";

const fakeDatabase = ({ user = null, talent = null } = {}) => {
  const batches = [];

  return {
    batches,
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (sql.includes("FROM users")) return user;
          if (sql.includes("FROM talents")) return talent;
          return null;
        }
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({
        success: true,
        meta: { changes: 1 }
      }));
    }
  };
};

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

test("deleting a manual client cascades assignments and records an audit event", async () => {
  const database = fakeDatabase({
    user: {
      id: 7,
      email: "client@example.com",
      product_access_count: 2,
      talent_access_count: 4,
      managed_grant_count: 0
    }
  });

  await deleteUser(database, "admin@example.com", 7);

  assert.equal(database.batches.length, 1);
  const [deleteStatement, auditStatement] = database.batches[0];
  assert.match(deleteStatement.sql, /DELETE FROM users/);
  assert.deepEqual(deleteStatement.values, [7]);
  assert.match(auditStatement.sql, /'user\.deleted'/);
  assert.deepEqual(auditStatement.values.slice(0, 2), ["admin@example.com", "7"]);
  assert.deepEqual(JSON.parse(auditStatement.values[2]), {
    email: "client@example.com",
    removedProductAssignments: 2,
    removedTalentAssignments: 4
  });
});

test("deleting a manual talent cascades assignments and records an audit event", async () => {
  const database = fakeDatabase({
    talent: {
      id: "talent-a",
      display_name: "Talent A",
      manual_assignment_count: 3,
      managed_grant_count: 0
    }
  });

  await deleteTalent(database, "admin@example.com", "talent-a");

  assert.equal(database.batches.length, 1);
  const [deleteStatement, auditStatement] = database.batches[0];
  assert.match(deleteStatement.sql, /DELETE FROM talents/);
  assert.deepEqual(deleteStatement.values, ["talent-a"]);
  assert.match(auditStatement.sql, /'talent\.deleted'/);
  assert.deepEqual(JSON.parse(auditStatement.values[2]), {
    id: "talent-a",
    displayName: "Talent A",
    removedManualAssignments: 3
  });
});

test("source-owned grants prevent permanent deletion", async () => {
  const database = fakeDatabase({
    user: {
      id: 8,
      email: "managed@example.com",
      product_access_count: 0,
      talent_access_count: 0,
      managed_grant_count: 1
    }
  });

  await assert.rejects(
    deleteUser(database, "admin@example.com", 8),
    /source-owned managed grants/
  );
  assert.equal(database.batches.length, 0);

  const talentDatabase = fakeDatabase({
    talent: {
      id: "managed-talent",
      display_name: "Managed Talent",
      manual_assignment_count: 0,
      managed_grant_count: 2
    }
  });

  await assert.rejects(
    deleteTalent(talentDatabase, "admin@example.com", "managed-talent"),
    /source-owned managed grants/
  );
  assert.equal(talentDatabase.batches.length, 0);
});

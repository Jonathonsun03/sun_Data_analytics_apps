import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardTalentCodesForEmail,
  forwardDashboardRequest,
  isDashboardRequest
} from "../src/index.js";

const talentDatabase = (codes) => ({
  prepare(sql) {
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async all() {
        return { results: codes.map((talent_code) => ({ talent_code })) };
      }
    };
  }
});

test("dashboard host matching uses the configured hostname", () => {
  assert.equal(
    isDashboardRequest(
      new URL("https://dashboard.sun-dataanalytics.com/"),
      {}
    ),
    true
  );
  assert.equal(
    isDashboardRequest(
      new URL("https://talent.example.com/"),
      { DASHBOARD_HOSTNAME: "talent.example.com" }
    ),
    true
  );
});

test("dashboard entitlements return exact DuckDB talent codes", async () => {
  const database = talentDatabase(["AVA1", "LEI3"]);
  assert.deepEqual(
    await dashboardTalentCodesForEmail(database, "client@example.com"),
    ["AVA1", "LEI3"]
  );
});

test("dashboard proxy replaces forged entitlement headers", async () => {
  const database = talentDatabase(["AVA1", "LEI3"]);
  const request = new Request("https://dashboard.sun-dataanalytics.com/session", {
    headers: {
      "X-SDA-Verified-Email": "attacker@example.com",
      "X-SDA-Allowed-Talent-Codes": "EVERYTHING"
    }
  });

  const response = await forwardDashboardRequest(
    request,
    database,
    "client@example.com",
    async (proxiedRequest) =>
      Response.json({
        email: proxiedRequest.headers.get("X-SDA-Verified-Email"),
        codes: proxiedRequest.headers.get("X-SDA-Allowed-Talent-Codes")
      })
  );

  assert.deepEqual(await response.json(), {
    email: "client@example.com",
    codes: "AVA1,LEI3"
  });
});

test("dashboard proxy fails closed when no talent is assigned", async () => {
  let forwarded = false;
  const response = await forwardDashboardRequest(
    new Request("https://dashboard.sun-dataanalytics.com/"),
    talentDatabase([]),
    "client@example.com",
    async () => {
      forwarded = true;
      return new Response("unexpected");
    }
  );

  assert.equal(response.status, 403);
  assert.equal(forwarded, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardTalentCodesForEmail,
  forwardDashboardRequest,
  isDashboardRequest,
  productsFromRows
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
  const database = talentDatabase(["AVA1", " LEI3 ", "bad code", ""]);
  assert.deepEqual(
    await dashboardTalentCodesForEmail(database, "client@example.com"),
    ["AVA1", "LEI3"]
  );
});

test("launcher dashboard access uses the same mapped talent requirement", () => {
  const products = productsFromRows([
    {
      product_id: "youtube-analytics",
      product_title: "Youtube Analytics",
      product_url: "https://yt-dashboard.sun-dataanalytics.com/",
      product_role: "viewer",
      talent_id: null,
      talent_name: null,
      talent_code: null
    },
    {
      product_id: "youtube-analytics",
      product_title: "Youtube Analytics",
      product_url: "https://yt-dashboard.sun-dataanalytics.com/",
      product_role: "viewer",
      talent_id: "talent-ava",
      talent_name: "Avaritia Hawthorne",
      talent_code: "AVA1"
    },
    {
      product_id: "news-tracker",
      product_title: "Media News Tracker",
      product_url: "https://news.sun-dataanalytics.com/",
      product_role: "viewer",
      talent_id: null,
      talent_name: null,
      talent_code: null
    }
  ]);

  assert.deepEqual(products, [
    {
      id: "youtube-analytics",
      title: "Youtube Analytics",
      url: "https://yt-dashboard.sun-dataanalytics.com/",
      role: "viewer",
      permissions: [
        {
          type: "talent",
          id: "talent-ava",
          code: "AVA1",
          label: "Avaritia Hawthorne"
        }
      ]
    },
    {
      id: "news-tracker",
      title: "Media News Tracker",
      url: "https://news.sun-dataanalytics.com/",
      role: "viewer",
      permissions: []
    }
  ]);
});

test("launcher hides Youtube Analytics without a usable talent code", () => {
  assert.deepEqual(
    productsFromRows([
      {
        product_id: "youtube-analytics",
        product_title: "Youtube Analytics",
        product_url: "https://yt-dashboard.sun-dataanalytics.com/",
        product_role: "viewer",
        talent_id: "unmapped-talent",
        talent_name: "Unmapped Talent",
        talent_code: null
      }
    ]),
    []
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

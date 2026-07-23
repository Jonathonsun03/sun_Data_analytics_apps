import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  handleAdminRequest,
  normalizedEmail
} from "./admin.js";

const jwksByTeamDomain = new Map();
const DEFAULT_DASHBOARD_HOSTNAME = "dashboard.sun-dataanalytics.com";
const VERIFIED_EMAIL_HEADER = "X-SDA-Verified-Email";
const ALLOWED_TALENT_CODES_HEADER = "X-SDA-Allowed-Talent-Codes";

const jsonResponse = (body, status = 200, extraHeaders = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...extraHeaders
    }
  });

const normalizedTeamDomain = (value) => value?.trim().replace(/\/+$/, "");

const configuredAudiences = (value) =>
  value
    ?.split(",")
    .map((audience) => audience.trim())
    .filter(Boolean);

const configuredAdminEmail = (env) => normalizedEmail(env.ADMIN_EMAIL);

const isAdminEmail = (email, env) =>
  Boolean(configuredAdminEmail(env)) &&
  normalizedEmail(email) === configuredAdminEmail(env);

const configuredDashboardHostname = (env) =>
  (env.DASHBOARD_HOSTNAME?.trim().toLowerCase() || DEFAULT_DASHBOARD_HOSTNAME);

const isDashboardRequest = (url, env) =>
  url.hostname.toLowerCase() === configuredDashboardHostname(env);

const getJwks = (teamDomain) => {
  if (!jwksByTeamDomain.has(teamDomain)) {
    jwksByTeamDomain.set(
      teamDomain,
      createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
    );
  }

  return jwksByTeamDomain.get(teamDomain);
};

const authenticatedEmail = async (request, env) => {
  const teamDomain = normalizedTeamDomain(env.TEAM_DOMAIN);
  const audiences = configuredAudiences(env.POLICY_AUD);

  if (!teamDomain || !audiences?.length) {
    throw new Error("Worker Access configuration is incomplete.");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");

  if (!token) {
    return null;
  }

  const { payload } = await jwtVerify(token, getJwks(teamDomain), {
    issuer: teamDomain,
    audience: audiences
  });

  return normalizedEmail(payload.email) || null;
};

const productsForEmail = async (database, email) => {
  const query = `
    WITH effective_access AS (
      SELECT
        users.id AS user_id,
        product_access.product_id,
        product_access.role,
        talent_access.talent_id
      FROM users
      INNER JOIN product_access
        ON product_access.user_id = users.id
      LEFT JOIN talent_access
        ON talent_access.user_id = users.id
        AND talent_access.product_id = product_access.product_id

      UNION ALL

      SELECT
        permission_grants.user_id,
        permission_grants.product_id,
        permission_grants.role,
        permission_grants.talent_id
      FROM permission_grants
      WHERE permission_grants.active = 1
        AND (
          permission_grants.access_start_date IS NULL
          OR permission_grants.access_start_date <= date('now')
        )
        AND (
          permission_grants.access_end_date IS NULL
          OR permission_grants.access_end_date >= date('now')
        )
    ),
    deduplicated_access AS (
      SELECT
        user_id,
        product_id,
        talent_id,
        MAX(role) AS role
      FROM effective_access
      GROUP BY user_id, product_id, talent_id
    )
    SELECT
      products.id AS product_id,
      products.title AS product_title,
      products.url AS product_url,
      deduplicated_access.role AS product_role,
      talents.id AS talent_id,
      talents.display_name AS talent_name,
      talents.talent_code AS talent_code
    FROM users
    INNER JOIN deduplicated_access
      ON deduplicated_access.user_id = users.id
    INNER JOIN products
      ON products.id = deduplicated_access.product_id
      AND products.active = 1
    LEFT JOIN talents
      ON talents.id = deduplicated_access.talent_id
      AND talents.active = 1
      AND talents.catalog_active = 1
    WHERE users.email = ? COLLATE NOCASE
      AND users.active = 1
      AND (
        deduplicated_access.talent_id IS NULL
        OR talents.id IS NOT NULL
      )
    ORDER BY products.title, talents.display_name
  `;
  const result = await database.prepare(query).bind(email).all();
  const products = new Map();

  for (const row of result.results ?? []) {
    if (!products.has(row.product_id)) {
      products.set(row.product_id, {
        id: row.product_id,
        title: row.product_title,
        url: row.product_url,
        role: row.product_role,
        permissions: []
      });
    }

    if (row.talent_id) {
      products.get(row.product_id).permissions.push({
        type: "talent",
        id: row.talent_id,
        code: row.talent_code,
        label: row.talent_name
      });
    }
  }

  return Array.from(products.values());
};

const dashboardTalentCodesForEmail = async (database, email) => {
  const result = await database.prepare(`
    WITH effective_access AS (
      SELECT
        users.id AS user_id,
        product_access.product_id,
        talent_access.talent_id
      FROM users
      INNER JOIN product_access
        ON product_access.user_id = users.id
      INNER JOIN talent_access
        ON talent_access.user_id = users.id
        AND talent_access.product_id = product_access.product_id

      UNION ALL

      SELECT
        permission_grants.user_id,
        permission_grants.product_id,
        permission_grants.talent_id
      FROM permission_grants
      WHERE permission_grants.active = 1
        AND permission_grants.talent_id IS NOT NULL
        AND (
          permission_grants.access_start_date IS NULL
          OR permission_grants.access_start_date <= date('now')
        )
        AND (
          permission_grants.access_end_date IS NULL
          OR permission_grants.access_end_date >= date('now')
        )
    )
    SELECT DISTINCT talents.talent_code
    FROM users
    INNER JOIN effective_access
      ON effective_access.user_id = users.id
      AND effective_access.product_id = 'youtube-analytics'
    INNER JOIN products
      ON products.id = effective_access.product_id
      AND products.active = 1
    INNER JOIN talents
      ON talents.id = effective_access.talent_id
      AND talents.active = 1
      AND talents.catalog_active = 1
      AND talents.talent_code IS NOT NULL
    WHERE users.email = ? COLLATE NOCASE
      AND users.active = 1
    ORDER BY talents.talent_code
  `).bind(email).all();

  return (result.results ?? []).map((row) => row.talent_code);
};

const forwardDashboardRequest = async (
  request,
  database,
  email,
  fetcher = fetch
) => {
  const talentCodes = await dashboardTalentCodesForEmail(database, email);
  if (talentCodes.length === 0) {
    return new Response(
      "No active Youtube Analytics talent permissions were found for this account.",
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  }

  const headers = new Headers(request.headers);
  headers.delete(VERIFIED_EMAIL_HEADER);
  headers.delete(ALLOWED_TALENT_CODES_HEADER);
  headers.set(VERIFIED_EMAIL_HEADER, email);
  headers.set(ALLOWED_TALENT_CODES_HEADER, talentCodes.join(","));

  const proxiedRequest = new Request(request, {
    headers,
    redirect: "manual"
  });
  return await fetcher(proxiedRequest);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAdminRoute = url.pathname.startsWith("/api/admin/");
    const isDashboardRoute = isDashboardRequest(url, env);

    if (
      !isDashboardRoute &&
      url.pathname !== "/api/my-products" &&
      !isAdminRoute
    ) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (!env.DB || !env.TEAM_DOMAIN || !env.POLICY_AUD) {
      return jsonResponse(
        { error: "Permissions service is not configured" },
        503
      );
    }

    let email;
    try {
      email = await authenticatedEmail(request, env);
      if (!email) {
        return jsonResponse({ error: "Authentication required" }, 401);
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "permissions.authentication_failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error)
        })
      );
      return jsonResponse({ error: "Authentication failed" }, 401);
    }

    if (isAdminRoute) {
      if (!configuredAdminEmail(env)) {
        return jsonResponse(
          { error: "Permission administration is not configured" },
          503
        );
      }

      if (!isAdminEmail(email, env)) {
        return jsonResponse({ error: "Administrator access required" }, 403);
      }

      return handleAdminRequest(request, env.DB, url, email);
    }

    if (isDashboardRoute) {
      try {
        return await forwardDashboardRequest(request, env.DB, email);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "permissions.dashboard_proxy_failed",
            host: url.hostname,
            path: url.pathname,
            error: error instanceof Error ? error.message : String(error)
          })
        );
        return new Response("Dashboard authorization is temporarily unavailable.", {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
    }

    if (request.method !== "GET") {
      return jsonResponse(
        { error: "Method not allowed" },
        405,
        { Allow: "GET" }
      );
    }

    try {
      const products = await productsForEmail(env.DB, email);
      return jsonResponse({
        user: { email },
        products
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "permissions.database_query_failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error)
        })
      );
      return jsonResponse(
        { error: "Permissions service is temporarily unavailable" },
        503
      );
    }
  }
};

export {
  configuredAdminEmail,
  dashboardTalentCodesForEmail,
  forwardDashboardRequest,
  isAdminEmail,
  isDashboardRequest
};

import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  handleAdminRequest,
  normalizedEmail
} from "./admin.js";

const jwksByTeamDomain = new Map();

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
      talents.display_name AS talent_name
    FROM users
    INNER JOIN deduplicated_access
      ON deduplicated_access.user_id = users.id
    INNER JOIN products
      ON products.id = deduplicated_access.product_id
      AND products.active = 1
    LEFT JOIN talents
      ON talents.id = deduplicated_access.talent_id
      AND talents.active = 1
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
        label: row.talent_name
      });
    }
  }

  return Array.from(products.values());
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAdminRoute = url.pathname.startsWith("/api/admin/");

    if (url.pathname !== "/api/my-products" && !isAdminRoute) {
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

export { configuredAdminEmail, isAdminEmail };

import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksByTeamDomain = new Map();

const jsonResponse = (body, status = 200, extraHeaders = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });

const normalizedTeamDomain = (value) => value?.trim().replace(/\/+$/, "");

const configuredAudiences = (value) =>
  value
    ?.split(",")
    .map((audience) => audience.trim())
    .filter(Boolean);

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
  const email =
    typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";

  return email || null;
};

const productsForEmail = async (database, email) => {
  const query = `
    SELECT
      products.id AS product_id,
      products.title AS product_title,
      products.url AS product_url,
      product_access.role AS product_role,
      talents.id AS talent_id,
      talents.display_name AS talent_name
    FROM users
    INNER JOIN product_access
      ON product_access.user_id = users.id
    INNER JOIN products
      ON products.id = product_access.product_id
      AND products.active = 1
    LEFT JOIN talent_access
      ON talent_access.user_id = users.id
      AND talent_access.product_id = products.id
    LEFT JOIN talents
      ON talents.id = talent_access.talent_id
      AND talents.active = 1
    WHERE users.email = ? COLLATE NOCASE
      AND users.active = 1
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

    if (url.pathname !== "/api/my-products") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (request.method !== "GET") {
      return jsonResponse(
        { error: "Method not allowed" },
        405,
        { Allow: "GET" }
      );
    }

    if (!env.DB || !env.TEAM_DOMAIN || !env.POLICY_AUD) {
      return jsonResponse(
        { error: "Permissions service is not configured" },
        503
      );
    }

    try {
      const email = await authenticatedEmail(request, env);

      if (!email) {
        return jsonResponse({ error: "Authentication required" }, 401);
      }

      const products = await productsForEmail(env.DB, email);
      return jsonResponse({
        user: { email },
        products
      });
    } catch (error) {
      console.error("Permissions request failed", error);
      return jsonResponse({ error: "Authentication failed" }, 401);
    }
  }
};

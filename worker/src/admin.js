const ADMIN_REQUEST_HEADER = "X-SDA-Admin";
const MAX_JSON_BODY_BYTES = 64 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

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

const requireObject = (value, message) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, message);
  }

  return value;
};

const requireOnlyKeys = (value, allowedKeys) => {
  const unknownKey = Object.keys(value).find(
    (key) => !allowedKeys.includes(key)
  );

  if (unknownKey) {
    throw new HttpError(400, `Unsupported field: ${unknownKey}`);
  }
};

const normalizedEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const validateEmail = (value) => {
  const email = normalizedEmail(value);

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }

  return email;
};

const validateDisplayName = (value) => {
  const displayName = typeof value === "string" ? value.trim() : "";

  if (!displayName || displayName.length > 120) {
    throw new HttpError(400, "Talent name must be between 1 and 120 characters.");
  }

  return displayName;
};

const validateIdentifier = (value, label) => {
  const identifier = typeof value === "string" ? value.trim() : "";

  if (!identifier || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier)) {
    throw new HttpError(400, `${label} is invalid.`);
  }

  return identifier;
};

const talentIdForName = (displayName) => {
  const identifier = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  if (!identifier) {
    throw new HttpError(
      400,
      "Talent name must contain at least one letter or number."
    );
  }

  return identifier;
};

const readJsonBody = async (request) => {
  const contentType = request.headers.get("Content-Type") ?? "";
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);

  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }

  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "Request body is too large.");
  }

  try {
    return requireObject(await request.json(), "Request body must be an object.");
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(400, "Request body must contain valid JSON.");
  }
};

const requireAdminWriteRequest = (request, url) => {
  if (request.headers.get("Origin") !== url.origin) {
    throw new HttpError(403, "Cross-origin administration is not allowed.");
  }

  if (request.headers.get(ADMIN_REQUEST_HEADER) !== "1") {
    throw new HttpError(403, "Administrative request header is missing.");
  }
};

const validateManualAccess = (value) => {
  if (!Array.isArray(value) || value.length > 100) {
    throw new HttpError(400, "Manual access must contain at most 100 products.");
  }

  const seenProducts = new Set();
  let talentCount = 0;

  return value.map((entry) => {
    requireObject(entry, "Each product assignment must be an object.");
    requireOnlyKeys(entry, ["productId", "talentIds"]);
    const productId = validateIdentifier(entry.productId, "Product ID");

    if (seenProducts.has(productId)) {
      throw new HttpError(400, `Product '${productId}' is duplicated.`);
    }

    seenProducts.add(productId);

    if (!Array.isArray(entry.talentIds)) {
      throw new HttpError(400, "Talent IDs must be an array.");
    }

    const talentIds = Array.from(
      new Set(
        entry.talentIds.map((talentId) =>
          validateIdentifier(talentId, "Talent ID")
        )
      )
    );
    talentCount += talentIds.length;

    if (talentCount > 500) {
      throw new HttpError(400, "A user cannot have more than 500 talent assignments.");
    }

    return { productId, talentIds };
  });
};

const validateUserCreatePayload = (value) => {
  requireOnlyKeys(value, ["email"]);
  return { email: validateEmail(value.email) };
};

const validateUserUpdatePayload = (value) => {
  requireOnlyKeys(value, ["email", "active", "manualAccess"]);

  if (typeof value.active !== "boolean") {
    throw new HttpError(400, "Active must be true or false.");
  }

  return {
    email: validateEmail(value.email),
    active: value.active,
    manualAccess: validateManualAccess(value.manualAccess)
  };
};

const validateTalentCreatePayload = (value) => {
  requireOnlyKeys(value, ["displayName"]);
  const displayName = validateDisplayName(value.displayName);
  return { id: talentIdForName(displayName), displayName };
};

const validateTalentUpdatePayload = (value) => {
  requireOnlyKeys(value, ["displayName", "active"]);

  if (typeof value.active !== "boolean") {
    throw new HttpError(400, "Active must be true or false.");
  }

  return {
    displayName: validateDisplayName(value.displayName),
    active: value.active
  };
};

const parseAuditDetails = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const adminState = async (database, adminEmail) => {
  const results = await database.batch([
    database.prepare("SELECT id, title, url, active FROM products ORDER BY title"),
    database.prepare(
      "SELECT id, display_name, active FROM talents ORDER BY display_name"
    ),
    database.prepare(`
      SELECT id, email, active, created_at, updated_at
      FROM users
      ORDER BY email COLLATE NOCASE
    `),
    database.prepare(`
      SELECT
        product_access.user_id,
        product_access.product_id,
        product_access.role,
        talent_access.talent_id
      FROM product_access
      LEFT JOIN talent_access
        ON talent_access.user_id = product_access.user_id
        AND talent_access.product_id = product_access.product_id
      ORDER BY product_access.user_id, product_access.product_id, talent_access.talent_id
    `),
    database.prepare(`
      SELECT
        id, user_id, source, product_id, talent_id, role,
        access_start_date, access_end_date, active
      FROM permission_grants
      ORDER BY user_id, source, product_id, talent_id
    `),
    database.prepare(`
      SELECT
        id, actor_email, action, target_type, target_key,
        details_json, created_at
      FROM permission_audit_log
      ORDER BY id DESC
      LIMIT 50
    `)
  ]);
  const [productRows, talentRows, userRows, manualRows, managedRows, auditRows] =
    results.map((result) => result.results ?? []);
  const users = new Map(
    userRows.map((row) => [
      row.id,
      {
        id: row.id,
        email: row.email,
        active: Boolean(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        manualAccess: [],
        managedGrants: []
      }
    ])
  );
  const manualByUserAndProduct = new Map();

  for (const row of manualRows) {
    const key = `${row.user_id}:${row.product_id}`;

    if (!manualByUserAndProduct.has(key)) {
      const access = {
        productId: row.product_id,
        role: row.role,
        talentIds: []
      };
      manualByUserAndProduct.set(key, access);
      users.get(row.user_id)?.manualAccess.push(access);
    }

    if (row.talent_id) {
      manualByUserAndProduct.get(key).talentIds.push(row.talent_id);
    }
  }

  for (const row of managedRows) {
    users.get(row.user_id)?.managedGrants.push({
      id: row.id,
      source: row.source,
      productId: row.product_id,
      talentId: row.talent_id,
      role: row.role,
      accessStartDate: row.access_start_date,
      accessEndDate: row.access_end_date,
      active: Boolean(row.active)
    });
  }

  return {
    admin: { email: adminEmail },
    products: productRows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      active: Boolean(row.active)
    })),
    talents: talentRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      active: Boolean(row.active)
    })),
    users: Array.from(users.values()),
    audit: auditRows.map((row) => ({
      id: row.id,
      actorEmail: row.actor_email,
      action: row.action,
      targetType: row.target_type,
      targetKey: row.target_key,
      details: parseAuditDetails(row.details_json),
      createdAt: row.created_at
    }))
  };
};

const createUser = async (database, adminEmail, payload) => {
  const existing = await database
    .prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
    .bind(payload.email)
    .first();

  if (existing) {
    throw new HttpError(409, "A user with that email already exists.");
  }

  await database.batch([
    database.prepare("INSERT INTO users (email) VALUES (?)").bind(payload.email),
    database.prepare(`
      INSERT INTO permission_audit_log (
        actor_email, action, target_type, target_key, details_json
      ) VALUES (?, 'user.created', 'user', ?, ?)
    `).bind(
      adminEmail,
      payload.email,
      JSON.stringify({ email: payload.email, active: true })
    )
  ]);
};

const validateAssignmentsExist = async (database, manualAccess) => {
  const [productsResult, talentsResult] = await database.batch([
    database.prepare("SELECT id FROM products WHERE active = 1"),
    database.prepare("SELECT id FROM talents WHERE active = 1")
  ]);
  const productIds = new Set(
    (productsResult.results ?? []).map((row) => row.id)
  );
  const talentIds = new Set(
    (talentsResult.results ?? []).map((row) => row.id)
  );

  for (const access of manualAccess) {
    if (!productIds.has(access.productId)) {
      throw new HttpError(400, `Product '${access.productId}' is not active.`);
    }

    for (const talentId of access.talentIds) {
      if (!talentIds.has(talentId)) {
        throw new HttpError(400, `Talent '${talentId}' is not active.`);
      }
    }
  }
};

const updateUser = async (database, adminEmail, userId, payload) => {
  const current = await database
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .bind(userId)
    .first();

  if (!current) {
    throw new HttpError(404, "User not found.");
  }

  await validateAssignmentsExist(database, payload.manualAccess);

  const statements = [
    database.prepare(`
      UPDATE users
      SET email = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(payload.email, payload.active ? 1 : 0, userId),
    database.prepare("DELETE FROM talent_access WHERE user_id = ?").bind(userId),
    database.prepare("DELETE FROM product_access WHERE user_id = ?").bind(userId)
  ];

  for (const access of payload.manualAccess) {
    statements.push(
      database.prepare(`
        INSERT INTO product_access (user_id, product_id, role)
        VALUES (?, ?, 'viewer')
      `).bind(userId, access.productId)
    );

    for (const talentId of access.talentIds) {
      statements.push(
        database.prepare(`
          INSERT INTO talent_access (user_id, product_id, talent_id)
          VALUES (?, ?, ?)
        `).bind(userId, access.productId, talentId)
      );
    }
  }

  statements.push(
    database.prepare(`
      INSERT INTO permission_audit_log (
        actor_email, action, target_type, target_key, details_json
      ) VALUES (?, 'user.updated', 'user', ?, ?)
    `).bind(
      adminEmail,
      String(userId),
      JSON.stringify({
        previousEmail: current.email,
        email: payload.email,
        active: payload.active,
        manualAccess: payload.manualAccess
      })
    )
  );

  await database.batch(statements);
};

const createTalent = async (database, adminEmail, payload) => {
  const existing = await database
    .prepare("SELECT id FROM talents WHERE id = ?")
    .bind(payload.id)
    .first();

  if (existing) {
    throw new HttpError(
      409,
      "A talent with that generated ID already exists. Rename the talent or edit the existing entry."
    );
  }

  await database.batch([
    database.prepare(
      "INSERT INTO talents (id, display_name) VALUES (?, ?)"
    ).bind(payload.id, payload.displayName),
    database.prepare(`
      INSERT INTO permission_audit_log (
        actor_email, action, target_type, target_key, details_json
      ) VALUES (?, 'talent.created', 'talent', ?, ?)
    `).bind(
      adminEmail,
      payload.id,
      JSON.stringify({ id: payload.id, displayName: payload.displayName })
    )
  ]);
};

const updateTalent = async (database, adminEmail, talentId, payload) => {
  const current = await database
    .prepare("SELECT id, display_name FROM talents WHERE id = ?")
    .bind(talentId)
    .first();

  if (!current) {
    throw new HttpError(404, "Talent not found.");
  }

  await database.batch([
    database.prepare(`
      UPDATE talents
      SET display_name = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(payload.displayName, payload.active ? 1 : 0, talentId),
    database.prepare(`
      INSERT INTO permission_audit_log (
        actor_email, action, target_type, target_key, details_json
      ) VALUES (?, 'talent.updated', 'talent', ?, ?)
    `).bind(
      adminEmail,
      talentId,
      JSON.stringify({
        previousDisplayName: current.display_name,
        displayName: payload.displayName,
        active: payload.active
      })
    )
  ]);
};

const deleteUser = async (database, adminEmail, userId) => {
  const current = await database.prepare(`
    SELECT
      users.id,
      users.email,
      (SELECT COUNT(*) FROM product_access WHERE user_id = users.id)
        AS product_access_count,
      (SELECT COUNT(*) FROM talent_access WHERE user_id = users.id)
        AS talent_access_count,
      (SELECT COUNT(*) FROM permission_grants WHERE user_id = users.id)
        AS managed_grant_count
    FROM users
    WHERE users.id = ?
  `).bind(userId).first();

  if (!current) {
    throw new HttpError(404, "User not found.");
  }

  if (Number(current.managed_grant_count) > 0) {
    throw new HttpError(
      409,
      "This client has source-owned managed grants and cannot be permanently deleted here. Deactivate the account or remove those grants through their owning source first."
    );
  }

  await database.batch([
    database.prepare("DELETE FROM users WHERE id = ?").bind(userId),
    database.prepare(`
      INSERT INTO permission_audit_log (
        actor_email, action, target_type, target_key, details_json
      ) VALUES (?, 'user.deleted', 'user', ?, ?)
    `).bind(
      adminEmail,
      String(userId),
      JSON.stringify({
        email: current.email,
        removedProductAssignments: Number(current.product_access_count),
        removedTalentAssignments: Number(current.talent_access_count)
      })
    )
  ]);
};

const deleteTalent = async (database, adminEmail, talentId) => {
  const current = await database.prepare(`
    SELECT
      talents.id,
      talents.display_name,
      (SELECT COUNT(*) FROM talent_access WHERE talent_id = talents.id)
        AS manual_assignment_count,
      (SELECT COUNT(*) FROM permission_grants WHERE talent_id = talents.id)
        AS managed_grant_count
    FROM talents
    WHERE talents.id = ?
  `).bind(talentId).first();

  if (!current) {
    throw new HttpError(404, "Talent not found.");
  }

  if (Number(current.managed_grant_count) > 0) {
    throw new HttpError(
      409,
      "This talent has source-owned managed grants and cannot be permanently deleted here. Deactivate it or remove those grants through their owning source first."
    );
  }

  await database.batch([
    database.prepare("DELETE FROM talents WHERE id = ?").bind(talentId),
    database.prepare(`
      INSERT INTO permission_audit_log (
        actor_email, action, target_type, target_key, details_json
      ) VALUES (?, 'talent.deleted', 'talent', ?, ?)
    `).bind(
      adminEmail,
      talentId,
      JSON.stringify({
        id: talentId,
        displayName: current.display_name,
        removedManualAssignments: Number(current.manual_assignment_count)
      })
    )
  ]);
};

const methodNotAllowed = (allow) =>
  jsonResponse({ error: "Method not allowed" }, 405, { Allow: allow });

const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const isConstraintError = (error) =>
  /constraint failed|unique constraint/i.test(errorMessage(error));

const routeAdminRequest = async (request, database, url, adminEmail) => {
  if (request.method !== "GET") {
    requireAdminWriteRequest(request, url);
  }

  if (url.pathname === "/api/admin/state") {
    return request.method === "GET"
      ? jsonResponse(await adminState(database, adminEmail))
      : methodNotAllowed("GET");
  }

  if (url.pathname === "/api/admin/users") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const payload = validateUserCreatePayload(await readJsonBody(request));
    await createUser(database, adminEmail, payload);
    return jsonResponse({ ok: true }, 201);
  }

  const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch) {
    const userId = Number(userMatch[1]);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new HttpError(400, "User ID is invalid.");
    }

    if (request.method === "PUT") {
      const payload = validateUserUpdatePayload(await readJsonBody(request));
      await updateUser(database, adminEmail, userId, payload);
      return jsonResponse({ ok: true });
    }

    if (request.method === "DELETE") {
      await deleteUser(database, adminEmail, userId);
      return jsonResponse({ ok: true });
    }

    return methodNotAllowed("PUT, DELETE");
  }

  if (url.pathname === "/api/admin/talents") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const payload = validateTalentCreatePayload(await readJsonBody(request));
    await createTalent(database, adminEmail, payload);
    return jsonResponse({ ok: true, talentId: payload.id }, 201);
  }

  const talentMatch = url.pathname.match(
    /^\/api\/admin\/talents\/([a-z0-9]+(?:-[a-z0-9]+)*)$/
  );
  if (talentMatch) {
    if (request.method === "PUT") {
      const payload = validateTalentUpdatePayload(await readJsonBody(request));
      await updateTalent(database, adminEmail, talentMatch[1], payload);
      return jsonResponse({ ok: true });
    }

    if (request.method === "DELETE") {
      await deleteTalent(database, adminEmail, talentMatch[1]);
      return jsonResponse({ ok: true });
    }

    return methodNotAllowed("PUT, DELETE");
  }

  return jsonResponse({ error: "Not found" }, 404);
};

const handleAdminRequest = async (request, database, url, adminEmail) => {
  try {
    return await routeAdminRequest(request, database, url, adminEmail);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    if (isConstraintError(error)) {
      return jsonResponse(
        { error: "That change conflicts with an existing record." },
        409
      );
    }

    console.error(
      JSON.stringify({
        event: "permissions.admin_request_failed",
        path: url.pathname,
        method: request.method,
        error: errorMessage(error)
      })
    );
    return jsonResponse(
      { error: "Permissions service is temporarily unavailable" },
      503
    );
  }
};

export {
  deleteTalent,
  deleteUser,
  handleAdminRequest,
  normalizedEmail,
  requireAdminWriteRequest,
  talentIdForName,
  validateUserUpdatePayload
};

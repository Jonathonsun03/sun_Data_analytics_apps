import { requireAdminWriteRequest } from "./admin.js";

const response = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
const actions = new Set(["archive", "restore", "pause", "resume"]);
const prefix = "/api/admin/lifecycle";

// Called only after the existing Access JWT and ADMIN_EMAIL checks in index.js.
export async function handleLifecycleRequest(request, env, url, email, fetcher = fetch) {
  const suffix = url.pathname.slice(prefix.length);
  if ((suffix && !/^\/[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(suffix)) || url.search) {
    return response({ error: "Not found" }, 404);
  }
  if (request.method !== "GET" && (request.method !== "POST" || !suffix)) {
    return response({ error: "Method not allowed" }, 405);
  }
  let body;
  if (request.method === "POST") {
    try {
      requireAdminWriteRequest(request, url);
    } catch (error) {
      return response({ error: error.message }, error.status);
    }
    if (env.TALENT_LIFECYCLE_WRITES_ENABLED !== "true") {
      return response({ error: "Lifecycle writes are not enabled" }, 503);
    }
    if (!(request.headers.get("Content-Type") ?? "").startsWith("application/json")) {
      return response({ error: "Use application/json" }, 415);
    }
    // Bound the streamed body as well as Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return response({ error: "Lifecycle change is required" }, 400);
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return response({ error: "Request body is too large" }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return response({ error: "Invalid JSON" }, 400);
    }
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).sort().join(",") !== "action,expected_revision" ||
        !actions.has(body.action) || !Number.isSafeInteger(body.expected_revision) ||
        body.expected_revision < 0) {
      return response({ error: "Invalid lifecycle change" }, 400);
    }
  }
  let phase = "configuration";
  try {
    const origin = new URL(env.TALENT_LIFECYCLE_ORIGIN);
    if (origin.protocol !== "https:" || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash ||
        !env.TALENT_BRIDGE_SECRET || env.TALENT_BRIDGE_SECRET.length < 32) {
      throw new Error("Invalid bridge configuration");
    }
    phase = "origin_fetch";
    const upstream = await fetcher(new URL(`/v1/talents${suffix}`, origin), {
      method: request.method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      // Never forward browser cookies, authorization, actor or Access headers.
      headers: {
        "Authorization": `Bearer ${env.TALENT_BRIDGE_SECRET}`,
        "X-SDA-Lifecycle-Actor": email,
        "Content-Type": "application/json"
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    phase = "origin_response";
    if ([200, 400, 404, 409].includes(upstream.status)) {
      const payload = await upstream.json();
      if (upstream.status === 200 && !suffix) {
        payload.writes_enabled = env.TALENT_LIFECYCLE_WRITES_ENABLED === "true";
      }
      return response(payload, upstream.status);
    }
    console.warn(JSON.stringify({ event: "lifecycle.origin_unavailable",
      status: upstream.status, mitigation: upstream.headers.get("cf-mitigated") }));
  } catch (error) {
    // Log only a phase and error class, never headers, URLs, bodies or credentials.
    console.warn(JSON.stringify({ event: "lifecycle.request_failed", phase,
      error_name: error instanceof Error ? error.name : "UnknownError" }));
  }
  return response({ error: "Lifecycle service is temporarily unavailable" }, 503);
}

const https = require("https");
const http = require("http");

const BASE = "https://transpadilla-web.onrender.com";
const API = `${BASE}/api`;

// ─── Helpers ─────────────────────────────────────────────
function req(method, path, opts = {}) {
  return new Promise((resolve) => {
    const fullUrl = path.startsWith("http") ? path : `${API}${path}`;
    const url = new URL(fullUrl);
    const headers = { Accept: "application/json", ...opts.headers };
    if (opts.body) headers["Content-Type"] = "application/json";
    const r = https.request(
      { hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
        });
      }
    );
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    if (opts.body) r.write(JSON.stringify(opts.body));
    r.setTimeout(opts.timeout || 10000, () => { r.destroy(); resolve({ status: 0, error: "TIMEOUT" }); });
    r.end();
  });
}

const results = { pass: 0, fail: 0, warnings: 0, items: [] };
function safeDetailForLog(detail) {
  if (detail === null || detail === undefined) return "";

  // Only allow a very small safe subset of string details to be logged as-is.
  // Example preserved: "Status: 401"
  if (typeof detail === "string") {
    const statusMatch = detail.match(/^Status:\s*\d{3}$/);
    if (statusMatch) return statusMatch[0];
    return `[REDACTED_STRING length=${detail.length}]`;
  }

  // Primitive non-string values are safe enough to render directly.
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }

  // For objects/arrays/other types, never log content; only metadata.
  if (Array.isArray(detail)) return `[REDACTED_ARRAY length=${detail.length}]`;
  if (typeof detail === "object") {
    const keys = Object.keys(detail);
    return `[REDACTED_OBJECT keys=${keys.length}]`;
  }

  return "[REDACTED_DETAIL]";
}

function check(name, severity, ok, detail) {
  const s = ok ? "PASS" : severity === "WARN" ? "WARN" : "FAIL";
  results.items.push({ name, severity: s, detail });
  results[s === "PASS" ? "pass" : s === "WARN" ? "warnings" : "fail"]++;
  const safeDetail = safeDetailForLog(detail);
  console.log(`  ${s === "PASS" ? "✅" : s === "WARN" ? "⚠️" : "❌"} [${s}] ${name}: ${safeDetail}`);
}
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  AUDITORIA DE SEGURIDAD — TransPadilla`);
  console.log(`  Target: ${BASE}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── 0. Smoke test ──────────────────────────────────
  console.log("── 0. SMOKE TEST ──");
  const s1 = await req("GET", "/buses");
  check("GET /buses accesible", "HIGH", s1.status === 200, `Status: ${s1.status}`);

  const s2 = await req("GET", "/healthz");
  check("GET /healthz accesible", "HIGH", s2.status === 200, `Status: ${s2.status}`);

  if (s2.status !== 200) {
    // Try without /api prefix
    const url = `${BASE}/healthz`;
    const s2b = await req("GET", url);
    check("GET /healthz (sin /api)", "HIGH", s2b.status === 200, `Status: ${s2b.status} path: /healthz`);
  }

  // ── 1. Security Headers ──────────────────────────────
  console.log("\n── 1. SEGURIDAD DE HEADERS ──");
  const h = await req("GET", "/healthz");

  check("HSTS con max-age >= 6 meses", "HIGH",
    h.headers["strict-transport-security"]?.includes("15552000"),
    h.headers["strict-transport-security"] || "AUSENTE");
  check("X-Content-Type-Options: nosniff", "HIGH",
    h.headers["x-content-type-options"] === "nosniff",
    h.headers["x-content-type-options"] || "AUSENTE");
  check("X-Frame-Options: SAMEORIGIN", "HIGH",
    h.headers["x-frame-options"] === "SAMEORIGIN",
    h.headers["x-frame-options"] || "AUSENTE");
  check("Content-Security-Policy presente", "HIGH",
    !!h.headers["content-security-policy"], "Presente");
  check("CSP sin unsafe-inline en scripts", "HIGH",
    h.headers["content-security-policy"]?.includes("script-src 'self'") &&
    !h.headers["content-security-policy"]?.includes("script-src 'unsafe-inline'"),
    "OK");
  check("Referrer-Policy correcta", "MEDIUM",
    h.headers["referrer-policy"] === "strict-origin-when-cross-origin",
    h.headers["referrer-policy"] || "AUSENTE");
  check("Permissions-Policy presente", "MEDIUM",
    !!h.headers["permissions-policy"],
    h.headers["permissions-policy"] || "AUSENTE");
  check("X-Powered-By NO expuesto", "LOW",
    !h.headers["x-powered-by"], h.headers["x-powered-by"] || "OK");
  check("Server header NO expone tecnología interna", "LOW",
    !h.headers["server"] || h.headers["server"] === "cloudflare",
    h.headers["server"] || "OK");

  // ── 2. Rate Limiting ────────────────────────────────
  console.log("\n── 2. RATE LIMITING ──");
  // Login rate limit: 10 por 5 min — ráfaga de 15
  const loginAttempts = [];
  for (let i = 0; i < 15; i++) {
    loginAttempts.push(await req("POST", "/auth/login", {
      body: { correo: `test${i}@test.com`, password: "wrong" },
    }));
  }
  const loginRl = loginAttempts.some((r) => r.status === 429);
  check("Rate limit en login (10 cada 5min)", "HIGH", loginRl,
    loginRl ? "429 detectado" : `Statuses: ${loginAttempts.map(r=>r.status).join(",")}`);

  // ── 3. SQL Injection ────────────────────────────────
  console.log("\n── 3. SQL INJECTION ──");
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE usuarios--",
    "' UNION SELECT 1,2,3--",
    "1 OR 1=1",
    "1; SELECT pg_sleep(5)--",
    "../../etc/passwd",
  ];
  let sqlVuln = false;
  for (const p of sqlPayloads) {
    const r1 = await req("GET", `/rutas/${encodeURIComponent(p)}/eta`);
    const r2 = await req("GET", `/rutas/paradas/${encodeURIComponent(p)}`);
    if (r1.status === 500 || r2.status === 500) {
      check(`SQLi "${p.substring(0, 20)}" → 500`, "CRITICAL", false, "⚠️ 500 Internal Server Error");
      sqlVuln = true;
    }
  }
  if (!sqlVuln) {
    check("SQL Injection (todos los payloads)", "CRITICAL", true,
      "Ningun payload produjo 500");
  }

  // ── 4. Path Traversal / ID enumeration ──────────────
  console.log("\n── 4. ID ENUMERACION Y PATH TRAVERSAL ──");
  const idTest = await req("GET", "/rutas/9999999/eta");
  check("ID inexistente no expone datos", "MEDIUM",
    idTest.status !== 200, `Status: ${idTest.status}`);

  const negId = await req("GET", "/rutas/-1/eta");
  check("ID negativo manejado", "MEDIUM",
    negId.status !== 200, `Status: ${negId.status}`);

  const strId = await req("GET", "/rutas/abc/eta");
  check("ID alfabetico manejado (esperado 400/404)", "MEDIUM",
    strId.status !== 500, `Status: ${strId.status}`);

  // ── 5. Acceso no autorizado ─────────────────────────
  console.log("\n── 5. ACCESO NO AUTORIZADO ──");
  const noAuth = await req("POST", "/rutas", {
    body: { nombre: "test-hack", color: "#ff0000" },
  });
  check("POST /rutas sin auth (debe 401/403)", "HIGH",
    noAuth.status === 401 || noAuth.status === 403,
    `Status: ${noAuth.status}`);

  const noAuthBus = await req("POST", "/buses", {
    body: { placa: "XXX-000" },
  });
  check("POST /buses sin auth (debe 401/403)", "HIGH",
    noAuthBus.status === 401 || noAuthBus.status === 403,
    `Status: ${noAuthBus.status}`);

  // ── 6. CORS ─────────────────────────────────────────
  console.log("\n── 6. CORS ──");
  const corsTest = await new Promise((resolve) => {
    const url = new URL(`${API}/healthz`);
    const r = https.request(
      { hostname: url.hostname, port: 443, path: url.pathname, method: "GET",
        headers: { Origin: "https://evil.com", Accept: "application/json" } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ origin: res.headers["access-control-allow-origin"] }));
      }
    );
    r.on("error", (e) => resolve({ origin: null, error: e.message }));
    r.end();
  });
  check("CORS no permite origenes externos", "HIGH",
    !corsTest.origin || corsTest.origin === "null",
    corsTest.origin ? `Permite: ${corsTest.origin}` : "Sin ACAO (OK)");

  // ── 7. JWT Security ─────────────────────────────────
  console.log("\n── 7. SEGURIDAD JWT ──");
  const login = await req("POST", "/auth/login", {
    body: { correo: "admin@transpadilla.co", password: "admin123" },
  });
  if (login.status === 200 && login.body?.token) {
    const parts = login.body.token.split(".");
    let payload = {};
    try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()); } catch {}
    check("JWT contiene rol", "HIGH", !!payload.rol, `rol: ${payload.rol}`);
    check("JWT contiene exp (expiración)", "HIGH", !!payload.exp,
      payload.exp ? `exp: ${new Date(payload.exp*1000).toISOString()}` : "AUSENTE");

    const logout = await req("POST", "/auth/cerrar-sesion", {
      headers: { Authorization: `Bearer ${login.body.token}` },
    });
    await sleep(500);
    const afterLogout = await req("GET", "/auditoria", {
      headers: { Authorization: `Bearer ${login.body.token}` },
    });
    check("Token revocado no funciona (debe 401)", "HIGH",
      afterLogout.status === 401, `Status: ${afterLogout.status}`);

    const fakeToken = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${parts[1]}.`;
    const noneTest = await req("GET", "/auditoria", {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    check("JWT alg:'none' es rechazado (debe 401)", "CRITICAL",
      noneTest.status === 401, `Status: ${noneTest.status}`);
  } else {
    check("Login funcional en prod", "WARN", false,
      `Status: ${login.status} — credenciales demo no existentes en prod`);
  }

  // ── 8. Body Size Limits (DoS) ──────────────────────
  console.log("\n── 8. BODY SIZE LIMITS ──");
  const bigBody = { data: "x".repeat(35000) };
  const big = await req("POST", "/auth/login", { body: bigBody });
  check("Body >32KB (debe 413 o 400, no 500)", "MEDIUM",
    big.status !== 500, `Status: ${big.status}`);

  const hugeBody = { data: "x".repeat(2000000) };
  const huge = await req("POST", "/auth/login", { body: hugeBody });
  check("Body >2MB (debe 413 o error controlado, no 500)", "MEDIUM",
    huge.status !== 500, `Status: ${huge.status}`);

  // ── 9. Error handling ──────────────────────────────
  console.log("\n── 9. INFORMACION EN ERRORES ──");
  const errRes = await req("GET", "/rutas/99999/eta");
  const leaksStack = errRes.raw?.includes("Error:") || errRes.raw?.includes("at ") || errRes.raw?.includes("\\n");
  check("Error no expone stack trace", "HIGH", !leaksStack,
    leaksStack ? "⚠️ Expone stack trace!" : "OK");

  // ── 10. Información en respuestas ──────────────────
  console.log("\n── 10. INFORMACION SENSIBLE EN RESPUESTAS ──");
  const buses = await req("GET", "/buses");
  if (buses.status === 200 && Array.isArray(buses.body)) {
    const first = buses.body[0] || {};
    const keys = Object.keys(first);
    check("GET /buses retorna datos esperados", "LOW", keys.length > 0,
      `Campos: ${keys.join(", ")}`);
  }

  // ── 11. Seguridad en cabeceras de error ────────────
  console.log("\n── 11. SEGURIDAD EN CABECERAS DE ERROR ──");
  const errHeaders = await req("GET", "/rutas/99999/eta");
  check("Error 4xx no tiene X-Powered-By", "LOW",
    !errHeaders.headers["x-powered-by"], "OK");

  // ── Summary ────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESUMEN DE AUDITORIA`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  ✅ Pass: ${results.pass}`);
  console.log(`  ⚠️  Warnings: ${results.warnings}`);
  console.log(`  ❌ Fail: ${results.fail}`);
  console.log(`  Total checks: ${results.items.length}`);
  console.log(`${"=".repeat(60)}\n`);

  if (results.fail > 0 || results.warnings > 0) {
    console.log("  DETALLE DE FALLOS Y ADVERTENCIAS:");
    for (const item of results.items) {
      if (item.severity !== "PASS") {
        console.log(`    [${item.severity}] ${item.name}`);
        console.log(`           ${item.detail}`);
      }
    }
    console.log();
  }

  return results;
}

run().catch(console.error);

import http from "node:http";

const BASE_URL = "http://localhost:8080";
const TOTAL = 5000;
const CONCURRENCY = 50;

const ENDPOINTS = [
  { path: "/healthz", name: "GET /healthz" },
  { path: "/buses", name: "GET /buses" },
  { path: "/rutas", name: "GET /rutas" },
];

const results = [];
let completed = 0;
let active = 0;
let errors = 0;

function request(endpoint) {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.get(`${BASE_URL}${endpoint.path}`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const duration = performance.now() - start;
        resolve({ status: res.statusCode, duration, endpoint: endpoint.name, ok: res.statusCode < 500 });
      });
    });
    req.on("error", (err) => {
      resolve({ status: 0, duration: 0, endpoint: endpoint.name, ok: false, error: err.message });
    });
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ status: 0, duration: 0, endpoint: endpoint.name, ok: false, error: "timeout" });
    });
  });
}

async function worker() {
  while (completed < TOTAL) {
    const idx = completed++;
    const ep = ENDPOINTS[idx % ENDPOINTS.length];
    const r = await request(ep);
    results.push(r);
    if (!r.ok) errors++;
  }
}

async function main() {
  console.log(`Iniciando prueba de carga: ${TOTAL} requests (${CONCURRENCY} concurrencia)`);
  console.log(`Endpoints: ${ENDPOINTS.map((e) => e.path).join(", ")}\n`);

  const startTime = Date.now();
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  const durations = results.map((r) => r.duration);
  durations.sort((a, b) => a - b);
  const avg = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2);
  const p50 = durations[Math.floor(durations.length * 0.5)].toFixed(2);
  const p95 = durations[Math.floor(durations.length * 0.95)].toFixed(2);
  const p99 = durations[Math.floor(durations.length * 0.99)].toFixed(2);
  const min = durations[0].toFixed(2);
  const max = durations[durations.length - 1].toFixed(2);

  const byEndpoint = {};
  for (const r of results) {
    if (!byEndpoint[r.endpoint]) byEndpoint[r.endpoint] = { total: 0, ok: 0, errors: 0, durations: [] };
    byEndpoint[r.endpoint].total++;
    byEndpoint[r.endpoint].durations.push(r.duration);
    if (r.ok) byEndpoint[r.endpoint].ok++;
    else byEndpoint[r.endpoint].errors++;
  }

  console.log("═══════════════════════════════════════════");
  console.log(`  Total:     ${TOTAL} requests`);
  console.log(`  Completados: ${results.length}`);
  console.log(`  Errores:   ${errors}`);
  console.log(`  Tiempo total: ${totalTime}s`);
  console.log(`  Throughput: ${(TOTAL / Number(totalTime)).toFixed(0)} req/s`);
  console.log("───────────────────────────────────────────");
  console.log(`  Latencia (ms):`);
  console.log(`    avg: ${avg}  |  min: ${min}  |  max: ${max}`);
  console.log(`    p50: ${p50}  |  p95: ${p95}  |  p99: ${p99}`);
  console.log("═══════════════════════════════════════════\n");

  for (const [name, data] of Object.entries(byEndpoint)) {
    const d = data.durations.sort((a, b) => a - b);
    console.log(`[${name}]`);
    console.log(`  Requests: ${data.total}  |  OK: ${data.ok}  |  Errors: ${data.errors}`);
    console.log(`  avg: ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2)}ms  |  p50: ${d[Math.floor(d.length * 0.5)].toFixed(2)}ms  |  p95: ${d[Math.floor(d.length * 0.95)].toFixed(2)}ms`);
    console.log("");
  }
}

main().catch(console.error);

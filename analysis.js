const http = require("http");

const INSTANCE_A = "http://136.112.151.11:8080";  // a
const INSTANCE_B = "http://34.53.227.23:8080"; // b

// helpers

function httpRequest(url, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const start = Date.now();
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const latency = Date.now() - start;
        try {
          resolve({ body: JSON.parse(data), latency });
        } catch {
          resolve({ body: data, latency });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// measure latency

async function measureLatency(label, baseUrl, endpoint, method, body, n = 10) {
  const latencies = [];
  for (let i = 0; i < n; i++) {
    const username = `latency_user_${Date.now()}_${i}`;
    const url = `${baseUrl}${endpoint}`;
    const payload = body ? { username } : null;
    const { latency } = await httpRequest(url, method, payload);
    latencies.push(latency);
    await sleep(200); // small delay between requests
  }
  const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
  console.log(`[${label}] ${method} ${endpoint} — avg latency: ${avg}ms (samples: ${latencies.join(", ")}ms)`);
  return parseFloat(avg);
}

async function runLatencyTests() {
  console.log("\n========== PART IV-A: Latency Measurement ==========\n");

  // /register latency
  await measureLatency("Instance A (us-central1)", INSTANCE_A, "/register", "POST", true);
  await measureLatency("Instance B (europe-west1)", INSTANCE_B, "/register", "POST", true);

  // /list latency
  await measureLatency("Instance A (us-central1)", INSTANCE_A, "/list", "GET", null);
  await measureLatency("Instance B (europe-west1)", INSTANCE_B, "/list", "GET", null);
}

// Consistency

async function runConsistencyTest(iterations = 100) {
  console.log("\n========== PART IV-B: Eventual Consistency ==========\n");
  console.log(`Running ${iterations} iterations: register on A, immediately list on B\n`);

  let notFoundCount = 0;

  for (let i = 0; i < iterations; i++) {
    const username = `consist_user_${Date.now()}_${i}`;

    // instance a reg
    await httpRequest(`${INSTANCE_A}/register`, "POST", { username });

    // gotta check b
    const { body } = await httpRequest(`${INSTANCE_B}/list`, "GET");
    const users = body.users || [];

    if (!users.includes(username)) {
      notFoundCount++;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Iteration ${i + 1}/${iterations} — not-found so far: ${notFoundCount}`);
    }
  }

  console.log(`\nResults: username NOT found immediately in ${notFoundCount}/${iterations} iterations`);
  console.log(`Consistency rate: ${(((iterations - notFoundCount) / iterations) * 100).toFixed(1)}%`);
}



(async () => {
  try {
    // Clear both instances before testing to avoid stale data
    console.log("Clearing databases before tests...");
    await httpRequest(`${INSTANCE_A}/clear`, "POST");
    await httpRequest(`${INSTANCE_B}/clear`, "POST");
    await sleep(2000);

    await runLatencyTests();
    await runConsistencyTest(100);

    console.log("\nDone! Copy results above into your Analysis.txt.\n");
  } catch (err) {
    console.error("Error:", err.message);
  }
})();
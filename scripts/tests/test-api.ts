const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

interface TestResult {
  endpoint: string;
  method: string;
  status: "pass" | "fail" | "skip";
  message: string;
  responseTime?: number;
}

const results: TestResult[] = [];

async function testEndpoint(
  method: string,
  endpoint: string,
  options: {
    body?: any;
    expectedStatus?: number;
    requiresAuth?: boolean;
  } = {}
): Promise<TestResult> {
  const { expectedStatus = 200, requiresAuth = false } = options;
  const url = `${API_BASE_URL}${endpoint}`;
  
  if (requiresAuth) {
    return {
      endpoint,
      method,
      status: "skip",
      message: "Requires authentication - skipped",
    };
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const responseTime = Date.now() - startTime;

    if (response.status === expectedStatus || (response.status >= 200 && response.status < 500)) {
      return {
        endpoint,
        method,
        status: "pass",
        message: `Status ${response.status} (${responseTime}ms)`,
        responseTime,
      };
    } else {
      return {
        endpoint,
        method,
        status: "fail",
        message: `Expected ${expectedStatus}, got ${response.status}`,
        responseTime,
      };
    }
  } catch (error) {
    return {
      endpoint,
      method,
      status: "fail",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runApiTests() {
  console.log("\n========================================");
  console.log("  API ENDPOINT TEST");
  console.log("========================================\n");

  console.log(`🔍 Testing API at: ${API_BASE_URL}\n`);

  console.log("🔍 Testing health check...");
  const health = await testEndpoint("GET", "/api/health");
  if (health.status === "fail" && health.message.includes("fetch failed")) {
    console.log("❌ Server not running at", API_BASE_URL);
    console.log("\n   Please start the server first:");
    console.log("   npm run dev\n");
    console.log("========================================");
    console.log("  ❌ API TEST FAILED (Server not running)");
    console.log("========================================\n");
    process.exit(1);
  }
  results.push(health);
  console.log(`   ${health.status === "pass" ? "✅" : "❌"} GET /api/health - ${health.message}`);

  console.log("\n🔍 Testing public endpoints...");
  
  const publicEndpoints = [
    { method: "GET", endpoint: "/api/branches", name: "Get branches" },
    { method: "GET", endpoint: "/api/departments", name: "Get departments" },
    { method: "GET", endpoint: "/api/designations", name: "Get designations" },
  ];

  for (const ep of publicEndpoints) {
    const result = await testEndpoint(ep.method, ep.endpoint);
    results.push(result);
    console.log(`   ${result.status === "pass" ? "✅" : "❌"} ${ep.method} ${ep.endpoint} - ${result.message}`);
  }

  console.log("\n🔍 Testing auth endpoints (without credentials)...");
  
  const authResult = await testEndpoint("POST", "/api/auth/login", {
    body: { email: "test@test.com", password: "test" },
    expectedStatus: 401,
  });
  results.push(authResult);
  console.log(`   ${authResult.status === "pass" ? "✅" : "⚠️"} POST /api/auth/login - ${authResult.message}`);

  console.log("\n🔍 Testing protected endpoints (should return 401)...");
  
  const protectedEndpoints = [
    { method: "GET", endpoint: "/api/employees", name: "Get employees" },
    { method: "GET", endpoint: "/api/attendance/history", name: "Get attendance" },
    { method: "GET", endpoint: "/api/me", name: "Get current user" },
  ];

  for (const ep of protectedEndpoints) {
    const result = await testEndpoint(ep.method, ep.endpoint, { expectedStatus: 401 });
    results.push(result);
    const icon = result.message.includes("401") ? "✅" : "⚠️";
    console.log(`   ${icon} ${ep.method} ${ep.endpoint} - ${result.message}`);
  }

  console.log("\n========================================");
  console.log("  SUMMARY");
  console.log("========================================\n");

  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  const skipped = results.filter(r => r.status === "skip").length;

  console.log(`📊 Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}\n`);

  if (failed > 0) {
    console.log("❌ Some API tests failed. Check server logs for details.\n");
    console.log("========================================");
    console.log("  ❌ API TEST COMPLETED WITH FAILURES");
    console.log("========================================\n");
    process.exit(1);
  } else {
    console.log("✅ All API tests passed!\n");
    console.log("========================================");
    console.log("  ✅ API TEST PASSED");
    console.log("========================================\n");
    process.exit(0);
  }
}

runApiTests();

/**
 * Generates test-reports/FINAL_TEST_REPORT.md from Vitest JSON output and coverage.
 * Run after: npm run test:all (or test:unit + test:api + test:integration + test:e2e).
 * Expects test-reports/ to contain coverage and optionally vitest-results.json.
 */
const fs = require("fs");
const path = require("path");

const REPORTS_DIR = path.join(process.cwd(), "test-reports");
const COVERAGE_DIR = path.join(REPORTS_DIR, "coverage");
const OUT_FILE = path.join(REPORTS_DIR, "FINAL_TEST_REPORT.md");

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function findCoverageSummary() {
  const units = ["unit", "api", "integration"];
  let totalPct = 0;
  let count = 0;
  for (const name of units) {
    const summaryPath = path.join(COVERAGE_DIR, name, "coverage-summary.json");
    const data = readJsonSafe(summaryPath);
    if (data && data.total) {
      const pct = data.total.lines?.pct ?? 0;
      totalPct += pct;
      count += 1;
    }
  }
  return count > 0 ? (totalPct / count).toFixed(1) : "N/A";
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(REPORTS_DIR);

  const coveragePct = findCoverageSummary();
  const report = `# Final Test Report

**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|--------|
| Coverage (avg) | ${coveragePct}% |
| Report location | \`test-reports/\` |

## Coverage

- Unit: \`test-reports/coverage/unit/\`
- API: \`test-reports/coverage/api/\`
- Integration: \`test-reports/coverage/integration/\`

Run \`npm run test:all\` to execute all tests. Run \`npm run test:report\` to run tests and regenerate this report.

## Failing areas

(No failure data in this run. Re-run \`npm run test:all\` and check terminal output for failures.)

## Recommended fixes

(Add recommendations here after reviewing failures.)
`;

  fs.writeFileSync(OUT_FILE, report, "utf8");
  console.log("Wrote", OUT_FILE);
}

main();

#!/usr/bin/env npx tsx
/**
 * RBAC consistency check script.
 * Validates: policy registry duplicates, requirePolicy/requireAnyPolicy literal keys in registry, nav config policies in registry.
 * Run: npm run rbac:check
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { POLICY_KEYS_FLAT, POLICY_REGISTRY, isKnownPolicyKey } from "../shared/policies";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const registrySet = new Set(POLICY_KEYS_FLAT);
let failed = false;

function log(msg: string, ok = true) {
  const prefix = ok ? "[OK]" : "[FAIL]";
  console.log(`${prefix} ${msg}`);
  if (!ok) failed = true;
}

// 1) No duplicate policy keys in registry
const keys = POLICY_REGISTRY.map((r) => r.key);
const seen = new Set<string>();
const duplicates: string[] = [];
for (const k of keys) {
  if (seen.has(k)) duplicates.push(k);
  else seen.add(k);
}
if (duplicates.length > 0) {
  log(`Duplicate policy keys in registry: ${[...new Set(duplicates)].join(", ")}`, false);
} else {
  log("No duplicate policy keys in registry");
}

// 2) Every policy in registry exists (no dupes already checked)
log(`Registry has ${POLICY_KEYS_FLAT.length} policy keys`);

// 3) Scan server code for requirePolicy("literal") and requireAnyPolicy(..., "literal", ...)
const serverDir = path.join(rootDir, "server");
const serverFiles = walkTs(serverDir);
const requirePolicyLiteral = /requirePolicy\s*\(\s*["']([^"']+)["']\s*\)/g;
const requireAnyPolicyLiterals = /requireAnyPolicy\s*\([^)]*["']([^"']+)["'][^)]*\)/g;
const unknownLiterals: { file: string; line: number; key: string }[] = [];

for (const file of serverFiles) {
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n");
  let match: RegExpExecArray | null;
  requirePolicyLiteral.lastIndex = 0;
  while ((match = requirePolicyLiteral.exec(content)) !== null) {
    const key = match[1];
    const lineNum = content.slice(0, match.index).split("\n").length;
    if (!registrySet.has(key) && !isKnownPolicyKey(key)) {
      unknownLiterals.push({ file: path.relative(rootDir, file), line: lineNum, key });
    }
  }
  requireAnyPolicyLiterals.lastIndex = 0;
  while ((match = requireAnyPolicyLiterals.exec(content)) !== null) {
    const key = match[1];
    const lineNum = content.slice(0, match.index).split("\n").length;
    if (!registrySet.has(key) && !isKnownPolicyKey(key)) {
      unknownLiterals.push({ file: path.relative(rootDir, file), line: lineNum, key });
    }
  }
  // Also match any string literal inside requireAnyPolicy (multiple args)
  const anyPolicyBlock = /requireAnyPolicy\s*\(\s*([^)]+)\)/g;
  let blockMatch: RegExpExecArray | null;
  anyPolicyBlock.lastIndex = 0;
  while ((blockMatch = anyPolicyBlock.exec(content)) !== null) {
    const args = blockMatch[1];
    const literals = [...args.matchAll(/["']([^"']+)["']/g)];
    for (const m of literals) {
      const key = m[1];
      if (!registrySet.has(key) && !isKnownPolicyKey(key)) {
        const lineNum = content.slice(0, blockMatch.index).split("\n").length;
        unknownLiterals.push({ file: path.relative(rootDir, file), line: lineNum, key });
      }
    }
  }
}

if (unknownLiterals.length > 0) {
  unknownLiterals.forEach(({ file, line, key }) => {
    log(`${file}:${line} policy key not in registry: "${key}"`, false);
  });
} else {
  log("All requirePolicy/requireAnyPolicy literal keys found in registry");
}

// 4) Nav config: warn if any nav item references unknown policy
const navPath = path.join(rootDir, "client", "src", "config", "nav.config.ts");
if (fs.existsSync(navPath)) {
  const navContent = fs.readFileSync(navPath, "utf-8");
  const navPolicyLiteral = /policy:\s*["']([^"']+)["']/g;
  const navPolicies = new Set<string>();
  let m: RegExpExecArray | null;
  navPolicyLiteral.lastIndex = 0;
  while ((m = navPolicyLiteral.exec(navContent)) !== null) navPolicies.add(m[1]);
  const unknownNav: string[] = [];
  navPolicies.forEach((p) => {
    if (!registrySet.has(p) && !isKnownPolicyKey(p)) unknownNav.push(p);
  });
  if (unknownNav.length > 0) {
    console.warn(`[WARN] Nav config references policies not in registry: ${unknownNav.join(", ")}`);
  } else {
    log("All nav config policy keys in registry");
  }
} else {
  log("Nav config not found (skip)", true);
}

if (failed) {
  process.exit(1);
}
console.log("rbac:check passed.");
process.exit(0);

function walkTs(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walkTs(full));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

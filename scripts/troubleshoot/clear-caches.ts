import { rmSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const projectRoot = join(__dirname, "../..");

interface CacheLocation {
  name: string;
  path: string;
  type: "directory" | "file";
}

const cacheLocations: CacheLocation[] = [
  { name: "Node modules cache", path: "node_modules/.cache", type: "directory" },
  { name: "Vite cache", path: "node_modules/.vite", type: "directory" },
  { name: "TypeScript cache", path: "node_modules/.tmp", type: "directory" },
  { name: "Build output", path: "dist", type: "directory" },
  { name: "Uploads temp", path: "uploads/temp", type: "directory" },
];

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getDirectorySize(dirPath: string): number {
  let size = 0;
  
  try {
    const files = readdirSync(dirPath);
    for (const file of files) {
      const filePath = join(dirPath, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch {
    return 0;
  }
  
  return size;
}

async function clearCaches() {
  console.log("\n========================================");
  console.log("  CLEAR CACHES");
  console.log("========================================\n");

  let totalCleared = 0;
  let clearedCount = 0;

  for (const cache of cacheLocations) {
    const fullPath = join(projectRoot, cache.path);
    
    if (existsSync(fullPath)) {
      const size = cache.type === "directory" ? getDirectorySize(fullPath) : statSync(fullPath).size;
      
      try {
        rmSync(fullPath, { recursive: true, force: true });
        console.log(`✅ Cleared: ${cache.name}`);
        console.log(`   Path: ${cache.path}`);
        console.log(`   Size: ${formatSize(size)}\n`);
        totalCleared += size;
        clearedCount++;
      } catch (error) {
        console.log(`❌ Failed to clear: ${cache.name}`);
        console.log(`   Error: ${error instanceof Error ? error.message : error}\n`);
      }
    } else {
      console.log(`⚪ Not found: ${cache.name}`);
      console.log(`   Path: ${cache.path}\n`);
    }
  }

  console.log("🔍 Clearing BigQuery in-memory cache...");
  console.log("   Note: BigQuery cache is in-memory and will clear on server restart.\n");

  console.log("========================================");
  console.log("  SUMMARY");
  console.log("========================================\n");

  console.log(`📊 Caches cleared: ${clearedCount}`);
  console.log(`📊 Space freed: ${formatSize(totalCleared)}\n`);

  if (clearedCount > 0) {
    console.log("💡 Next steps:");
    console.log("   1. Run: npm install (to rebuild dependencies)");
    console.log("   2. Run: npm run dev (to restart server)\n");
  }

  console.log("✅ Cache clearing complete!\n");
  console.log("========================================");
  console.log("  ✅ CACHE CLEAR COMPLETE");
  console.log("========================================\n");
}

clearCaches();

import { validateAuthentication } from "./config/octokit.js";

async function main() {
  console.log("[INFO] [github-repo-mirror-backup] Initialized successfully.");

  try {
    const { sourceUser, backupUser } = await validateAuthentication();
    console.log(`[SUCCESS] Authenticated Source Account: ${sourceUser}`);
    console.log(`[SUCCESS] Authenticated Backup Account: ${backupUser}`);
  } catch (error: any) {
    console.error("[ERROR] Validation failed:", error.message);
  }
}

main();

import { validateAuthentication } from "./config/octokit.js";
import { fetchSourceRepositories } from "./services/github.service.js";

async function main() {
  console.log("[INFO] [github-repo-mirror-backup] Initialized successfully.");

  try {
    const { sourceUser, backupUser } = await validateAuthentication();
    console.log(`[SUCCESS] Authenticated Source Account: ${sourceUser}`);
    console.log(`[SUCCESS] Authenticated Backup Account: ${backupUser}`);

    console.log(`\n[INFO] Fetching all repositories from source account (@${sourceUser})...`);
    const repositories = await fetchSourceRepositories();
    console.log(`[SUCCESS] Fetched ${repositories.length} repositories successfully from source.`);
  } catch (error: any) {
    console.error("[ERROR] Validation failed:", error.message);
  }
}

main();

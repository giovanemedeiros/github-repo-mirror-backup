import { validateAuthentication } from "./config/octokit.js";
import { fetchSourceRepositories } from "./services/github.service.js";
import { ensureBackupRepositoryExists } from "./services/backup.service.js";

async function main() {
  console.log("[INFO] [github-repo-mirror-backup] Initialized successfully.");

  try {
    const { sourceUser, backupUser } = await validateAuthentication();
    console.log(`[SUCCESS] Authenticated Source Account: ${sourceUser}`);
    console.log(`[SUCCESS] Authenticated Backup Account: ${backupUser}`);

    console.log(`\n[INFO] Fetching all repositories from source account (@${sourceUser})...`);
    const repositories = await fetchSourceRepositories();
    console.log(`[SUCCESS] Fetched ${repositories.length} repositories successfully from source.`);

    console.log(`\n[INFO] Checking and auto-provisioning repositories on backup account (@${backupUser})...`);
    let createdCount = 0;
    let existingCount = 0;

    for (const repo of repositories) {
      const result = await ensureBackupRepositoryExists(backupUser, repo.name, repo.description);
      if (result.alreadyExisted) {
        existingCount++;
      } else {
        createdCount++;
      }
    }

    console.log(`\n[SUCCESS] Auto-provisioning completed: ${createdCount} created, ${existingCount} already existed.`);
  } catch (error: any) {
    console.error("[ERROR] Execution failed:", error.message);
  }
}

main();

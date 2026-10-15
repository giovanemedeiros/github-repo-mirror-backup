import { validateAuthentication } from "./config/octokit.js";
import { fetchSourceRepositories } from "./services/github.service.js";
import {
  ensureBackupRepositoryExists,
  reconcileDeletedRepositories,
} from "./services/backup.service.js";
import { mirrorRepository } from "./services/mirror.service.js";
import {
  syncRepositoryMetadata,
  syncReleases,
  disableActionsInBackup,
  isRepositoryUpToDate
} from "./services/metadata.service.js";

async function main() {
  console.log("[INFO] [github-repo-mirror-backup] Initialized successfully.\n");

  try {
    const { sourceUser, backupUser } = await validateAuthentication();
    console.log(`[SUCCESS] Authenticated Source: @${sourceUser}`);
    console.log(`[SUCCESS] Authenticated Backup: @${backupUser}\n`);

    console.log(`[INFO] Fetching all repositories from @${sourceUser}...`);
    const repositories = await fetchSourceRepositories();
    console.log(`[SUCCESS] Fetched ${repositories.length} repositories from source.\n`);

    console.log("[INFO] Starting repository synchronization and mirror pipeline...\n");

    let syncedCount = 0;
    let skippedCount = 0;

    for (const [index, repo] of repositories.entries()) {
      const progress = `[${index + 1}/${repositories.length}]`;

      console.log(`------------------------------------------------------------`);
      console.log(`[INFO] ${progress} Checking repository: ${repo.name}`);

      // Perform complete multi-dimensional drift detection
      const syncStatus = await isRepositoryUpToDate(sourceUser, backupUser, repo);
      if (syncStatus.isUpToDate) {
        console.log(`[SKIP] Repository is already up-to-date. Skipping mirror.\n`);
        skippedCount++;
        continue;
      }

      console.log(`[INFO] Synchronizing repository (${syncStatus.reason})...`);

      // Ensure backup repository exists and is private
      await ensureBackupRepositoryExists(backupUser, repo.name, repo.description);

      // Execute full Git bare mirror clone and push
      const mirrorResult = await mirrorRepository({
        repoName: repo.name,
        sourceOwner: sourceUser,
        sourceToken: process.env.SOURCE_GITHUB_TOKEN!,
        backupOwner: backupUser,
        backupToken: process.env.BACKUP_GITHUB_TOKEN!,
      });

      if (!mirrorResult.success) {
        console.error(`[ERROR] Failed to mirror Git data for ${repo.name}: ${mirrorResult.error}`);
        continue;
      }
      console.log(`[SUCCESS] Git data mirrored successfully.`);

      // Synchronize repository metadata ("About": description, homepage, topics)
      await syncRepositoryMetadata(backupUser, repo);
      console.log(`[SUCCESS] Metadata synchronized.`);

      // Synchronize GitHub Releases
      await syncReleases(sourceUser, backupUser, repo.name);
      console.log(`[SUCCESS] Releases synchronized.`);

      // Disable GitHub Actions for safe cold storage
      await disableActionsInBackup(backupUser, repo.name);
      console.log(`[SUCCESS] Cold storage secured (Actions disabled).\n`);

      syncedCount++;
    }

    console.log("------------------------------------------------------------");
    console.log("[INFO] Reconciling soft-deleted repositories and retention policies...");
    const sourceRepoNames = repositories.map((r) => r.name);
    await reconcileDeletedRepositories(backupUser, sourceRepoNames);
    console.log("[SUCCESS] Reconciliation completed.\n");

    console.log("============================================================");
    console.log(`[SUCCESS] Pipeline execution completed successfully!`);
    console.log(`Total Repositories:   ${repositories.length}`);
    console.log(`Synchronized/Updated: ${syncedCount}`);
    console.log(`Skipped (Up-to-date): ${skippedCount}`);
    console.log("============================================================\n");
  } catch (error: any) {
    console.error("[ERROR] Execution failed:", error.message);
  }
}

main();

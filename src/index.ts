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
import {
  generateExecutionReport,
  type RepositoryExecutionDetail,
} from "./services/report.service.js";

async function main() {
  console.log("[INFO] [github-repo-mirror-backup] Initialized successfully.\n");
  const startTime = new Date();

  try {
    const { sourceUser, backupUser } = await validateAuthentication();
    console.log(`[SUCCESS] Authenticated Source: @${sourceUser}`);
    console.log(`[SUCCESS] Authenticated Backup: [CONFIDENTIAL_STORAGE]\n`);

    console.log(`[INFO] Fetching repositories from @${sourceUser}...`);
    const repositories = await fetchSourceRepositories();

    const publicRepos = repositories.filter((r) => !r.isPrivate);
    const privateRepos = repositories.filter((r) => r.isPrivate);

    console.log(`[SUCCESS] Discovered ${publicRepos.length} public repositories.\n`);

    console.log("[INFO] Starting synchronization for public repositories...\n");

    let publicSynced = 0;
    let publicSkipped = 0;
    let failures = 0;
    const executionDetails: RepositoryExecutionDetail[] = [];

    // Phase 1: Public Repositories Synchronization
    for (const [index, repo] of publicRepos.entries()) {
      const progress = `[${index + 1}/${publicRepos.length}]`;

      console.log(`------------------------------------------------------------`);
      console.log(`[INFO] ${progress} Checking public repository: ${repo.name}`);

      // Perform complete multi-dimensional drift detection
      const syncStatus = await isRepositoryUpToDate(sourceUser, backupUser, repo);
      if (syncStatus.isUpToDate) {
        console.log(`[SKIP] Repository is already up-to-date. Skipping mirror.\n`);
        publicSkipped++;
        executionDetails.push({
          name: repo.name,
          status: "SKIPPED",
          reason: "Already up-to-date",
        });
        continue;
      }

      console.log(`[INFO] Synchronizing repository (${syncStatus.reason})...`);

      // Ensure backup repository exists and is private
      await ensureBackupRepositoryExists(backupUser, repo.name, repo.description, false);

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
        failures++;
        executionDetails.push({
          name: repo.name,
          status: "FAILED",
          reason: mirrorResult.error,
        });
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

      publicSynced++;
      executionDetails.push({
        name: repo.name,
        status: "SYNCED",
        reason: syncStatus.reason,
      });
    }

    // Phase 2: Private Repositories Synchronization (Stealth Mode)
    console.log("------------------------------------------------------------");
    console.log("[INFO] Synchronizing private repositories cold storage (Stealth Mode enabled)...");

    let privateFailures = 0;

    for (const repo of privateRepos) {
      try {
        const syncStatus = await isRepositoryUpToDate(sourceUser, backupUser, repo);
        if (syncStatus.isUpToDate) {
          continue;
        }

        await ensureBackupRepositoryExists(backupUser, repo.name, repo.description, true);

        const mirrorResult = await mirrorRepository({
          repoName: repo.name,
          sourceOwner: sourceUser,
          sourceToken: process.env.SOURCE_GITHUB_TOKEN!,
          backupOwner: backupUser,
          backupToken: process.env.BACKUP_GITHUB_TOKEN!,
        });

        if (!mirrorResult.success) {
          privateFailures++;
          failures++;
          continue;
        }

        await syncRepositoryMetadata(backupUser, repo);
        await syncReleases(sourceUser, backupUser, repo.name);
        await disableActionsInBackup(backupUser, repo.name);
      } catch {
        privateFailures++;
        failures++;
      }
    }

    const privateStatus: "Secured & Synchronized" | "Secured with Warning(s)" =
      privateFailures === 0 ? "Secured & Synchronized" : "Secured with Warning(s)";

    if (privateFailures === 0) {
      console.log("[SUCCESS] Private repositories synchronized and cold storage secured.\n");
    } else {
      console.warn(`[WARN] Private repositories synchronized with warning(s).\n`);
    }

    // Phase 3: Soft-Deleted Repositories Reconciliation
    console.log("------------------------------------------------------------");
    console.log("[INFO] Reconciling soft-deleted repositories and retention policies...");
    const sourceRepoNames = repositories.map((r) => r.name);
    await reconcileDeletedRepositories(backupUser, sourceRepoNames);
    console.log("[SUCCESS] Reconciliation completed.\n");

    const endTime = new Date();
    await generateExecutionReport({
      sourceUser,
      startTime,
      endTime,
      publicTotal: publicRepos.length,
      publicSynced,
      publicSkipped,
      failures,
      privateStatus,
      details: executionDetails,
    });
  } catch (error: any) {
    console.error("[ERROR] Execution failed:", error.message);
  }
}

main();

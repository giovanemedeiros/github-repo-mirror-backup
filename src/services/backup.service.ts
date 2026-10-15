import { backupOctokit } from "../config/octokit.js";

export interface ProvisionResult {
  repoName: string;
  alreadyExisted: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensures a repository exists in the backup account.
 * If the repository does not exist (404), it creates a new, completely empty
 * bare repository with strict private visibility (auto_init: false, private: true).
 * Includes throttling and exponential backoff retry for GitHub secondary rate limits.
 */
export async function ensureBackupRepositoryExists(
  backupOwner: string,
  repoName: string,
  description?: string | null
): Promise<ProvisionResult> {
  try {
    await backupOctokit.rest.repos.get({
      owner: backupOwner,
      repo: repoName,
    });

    return {
      repoName,
      alreadyExisted: true,
    };
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`[INFO] Provisioning private backup repository: ${backupOwner}/${repoName}...`);

      const maxRetries = 3;
      let attempt = 0;

      while (attempt < maxRetries) {
        try {
          await backupOctokit.rest.repos.createForAuthenticatedUser({
            name: repoName,
            private: true,
            auto_init: false,
            ...(description ? { description } : {}),
          });

          console.log(`[SUCCESS] Backup repository ${backupOwner}/${repoName} provisioned successfully.`);

          // Throttling: wait 2 seconds after each creation to respect GitHub creation rate limits
          await sleep(2000);

          return {
            repoName,
            alreadyExisted: false,
          };
        } catch (createError: any) {
          const isSecondaryRateLimit =
            createError.status === 403 &&
            typeof createError.message === "string" &&
            (createError.message.includes("secondary rate limit") ||
              createError.message.includes("temporarily blocked"));

          if (isSecondaryRateLimit && attempt < maxRetries - 1) {
            const backoffSeconds = (attempt + 1) * 30;
            console.log(
              `[WARN] GitHub secondary rate limit hit for ${repoName}. Waiting ${backoffSeconds}s before retrying...`
            );
            await sleep(backoffSeconds * 1000);
            attempt++;
          } else {
            throw createError;
          }
        }
      }
    }

    throw error;
  }
}

/**
 * Reconciles repositories in the backup account against the source account.
 * Implements a 30-day Soft Delete retention policy:
 * 1. If a repository was deleted from source: renames to DELETED_YYYY-MM-DD_<name> and archives it (read-only).
 * 2. If a repository has been in soft delete and its 30-day retention has expired: permanently deletes it.
 */
export async function reconcileDeletedRepositories(
  backupOwner: string,
  sourceRepoNames: string[]
): Promise<void> {
  // Fetch all repositories belonging to the backup account (public and private)
  const backupRepos = await backupOctokit.paginate(
    backupOctokit.rest.repos.listForAuthenticatedUser,
    {
      affiliation: "owner",
      per_page: 100,
    }
  );

  const deletePattern = /^DELETED_(\d{4}-\d{2}-\d{2})_(.+)$/;
  const currentDate = new Date();

  for (const bRepo of backupRepos) {
    // Ensure repository belongs to the backup owner
    if (bRepo.owner.login !== backupOwner) {
      continue;
    }

    const match = bRepo.name.match(deletePattern);

    // Case 1: Repository is already in soft delete (starts with DELETED_YYYY-MM-DD_)
    if (match) {
      const expirationDateStr = match[1];
      const expirationDate = new Date(expirationDateStr!);

      // Check if the 30-day retention period has expired
      if (currentDate >= expirationDate) {
        console.log(`[WARN] Retention period expired for ${bRepo.name}. Permanently purging...`);
        await backupOctokit.rest.repos.delete({
          owner: backupOwner,
          repo: bRepo.name,
        });
        console.log(`[SUCCESS] Purged repository ${bRepo.name} from backup.`);
      } else {
        console.log(`[INFO] Retention active for ${bRepo.name} (scheduled for purge on ${expirationDateStr}).`);
      }
      continue;
    }

    // Case 2: Repository still exists in the source account -> Normal active state
    if (sourceRepoNames.includes(bRepo.name)) {
      continue;
    }

    // Case 3: Repository was deleted from source account and is not yet in soft delete
    const retentionDays = 30;
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + retentionDays);
    const expirationDateStr = expirationDate.toISOString().slice(0, 10); // Format: YYYY-MM-DD

    // 100-character safety lock: ensures new name never exceeds GitHub's 100-char limit
    const prefix = `DELETED_${expirationDateStr}_`;
    const maxOriginalLength = 100 - prefix.length;
    const safeOriginalName = bRepo.name.slice(0, maxOriginalLength);
    const newRepoName = `${prefix}${safeOriginalName}`;

    console.log(`[WARN] Repository ${bRepo.name} was deleted at source. Moving to soft delete retention...`);

    // Rename repository to include expiration date and mark as archived (read-only)
    await backupOctokit.rest.repos.update({
      owner: backupOwner,
      repo: bRepo.name,
      name: newRepoName,
      archived: true,
    });

    console.log(
      `[SUCCESS] Repository marked as soft-deleted: ${newRepoName} (retention until ${expirationDateStr}).`
    );
  }
}


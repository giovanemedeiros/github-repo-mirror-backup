import { backupOctokit } from "../config/octokit.js";

export interface ProvisionResult {
  repoName: string;
  alreadyExisted: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensures a repository exists in the backup account (@gmbkp).
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

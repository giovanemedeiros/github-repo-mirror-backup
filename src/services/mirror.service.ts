import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

// Converts callback-based execFile into a promise-based function
const execFileAsync = promisify(execFile);

export interface MirrorOptions {
  repoName: string;
  sourceOwner: string;
  sourceToken: string;
  backupOwner: string;
  backupToken: string;
}

export interface MirrorResult {
  repoName: string;
  success: boolean;
  error?: string;
}

/**
 * Performs a complete Git bare mirror clone and push between source and backup accounts.
 * Ensures temporary directories are cleaned up and credentials are never exposed in error outputs.
 */
export async function mirrorRepository(options: MirrorOptions): Promise<MirrorResult> {
  const tempDir = path.resolve("temp_mirrors", `${options.repoName}.git`);

  // Construct authenticated URLs for headless Git operations
  const sourceAuthUrl = `https://x-access-token:${options.sourceToken}@github.com/${options.sourceOwner}/${options.repoName}.git`;
  const backupAuthUrl = `https://x-access-token:${options.backupToken}@github.com/${options.backupOwner}/${options.repoName}.git`;

  try {
    // Ensure base temporary directory exists
    await fs.mkdir(path.dirname(tempDir), { recursive: true });

    // Execute full bare clone with all refs, branches, and tags
    await execFileAsync("git", ["clone", "--mirror", sourceAuthUrl, tempDir]);

    // Push complete mirror to destination backup repository
    await execFileAsync(
        "git",
        [
            "push",
            backupAuthUrl,
            "--prune",
            "--force",
            "refs/heads/*:refs/heads/*",
            "refs/tags/*:refs/tags/*",
        ],
        { cwd: tempDir }
        );

    return { repoName: options.repoName, success: true };
  } catch (error: any) {
    // Sanitize credentials from error message to prevent accidental token exposure in logs
    let sanitizedError = error.message || String(error);
    if (options.sourceToken) {
      sanitizedError = sanitizedError.replaceAll(options.sourceToken, "***");
    }
    if (options.backupToken) {
      sanitizedError = sanitizedError.replaceAll(options.backupToken, "***");
    }

    return { repoName: options.repoName, success: false, error: sanitizedError };
  } finally {
    // Clean up temporary mirror folder to release disk space
    await fs.rm(tempDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.error(`[WARN] Failed to clean up temporary directory ${tempDir}:`, cleanupError);
    });
  }
}

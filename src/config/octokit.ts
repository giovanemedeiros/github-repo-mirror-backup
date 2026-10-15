import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const sourceToken = process.env.SOURCE_GITHUB_TOKEN;
const backupToken = process.env.BACKUP_GITHUB_TOKEN;

if (!sourceToken || sourceToken.includes("placeholder") || sourceToken.includes("your_primary")) {
  throw new Error(
    "[CONFIG ERROR] SOURCE_GITHUB_TOKEN is missing or not configured in .env file."
  );
}

if (!backupToken || backupToken.includes("placeholder") || backupToken.includes("your_backup")) {
  throw new Error(
    "[CONFIG ERROR] BACKUP_GITHUB_TOKEN is missing or not configured in .env file."
  );
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const sourceOctokit: Octokit = new Octokit({
  auth: sourceToken,
  log: silentLogger,
});

export const backupOctokit: Octokit = new Octokit({
  auth: backupToken,
  log: silentLogger,
});

/**
 * Validates credentials for both source and backup clients.
 * Returns the authenticated usernames.
 */
export async function validateAuthentication(): Promise<{
  sourceUser: string;
  backupUser: string;
}> {
  try {
    const [sourceResponse, backupResponse] = await Promise.all([
      sourceOctokit.rest.users.getAuthenticated(),
      backupOctokit.rest.users.getAuthenticated(),
    ]);

    return {
      sourceUser: sourceResponse.data.login,
      backupUser: backupResponse.data.login,
    };
  } catch (error: any) {
    throw new Error(`[AUTH ERROR] Authentication failed: ${error.message}`);
  }
}

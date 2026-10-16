import fs from "node:fs/promises";

export interface RepositoryExecutionDetail {
  name: string;
  status: "SYNCED" | "SKIPPED" | "FAILED";
  reason?: string | undefined;
}

export interface BackupExecutionMetrics {
  sourceUser: string;
  startTime: Date;
  endTime: Date;
  publicTotal: number;
  publicSynced: number;
  publicSkipped: number;
  failures: number;
  privateStatus: "Secured & Synchronized" | "Secured with Warning(s)";
  details: RepositoryExecutionDetail[];
}

/**
 * Formats execution duration into human-readable seconds or minutes.
 */
export function formatDuration(startTime: Date, endTime: Date): string {
  const durationMs = endTime.getTime() - startTime.getTime();
  const seconds = (durationMs / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Generates and outputs summary reports:
 * - Outputs a clean, standardized console log summary with execution duration.
 * - If running inside GitHub Actions ($GITHUB_STEP_SUMMARY is present),
 *   writes a rich Markdown table for the GitHub Actions Job Summary UI.
 * - Preserves complete stealth privacy: backup username is masked as [CONFIDENTIAL_STORAGE],
 *   and private repositories metadata/counts are redacted.
 */
export async function generateExecutionReport(
  metrics: BackupExecutionMetrics
): Promise<void> {
  const duration = formatDuration(metrics.startTime, metrics.endTime);

  // Standardized Console Summary
  console.log("============================================================");
  console.log("[SUCCESS] Pipeline execution completed successfully!");
  console.log(`Duration:                       ${duration}`);
  console.log(`Public Repositories Total:      ${metrics.publicTotal}`);
  console.log(`Public Synchronized/Updated:    ${metrics.publicSynced}`);
  console.log(`Public Skipped (Up-to-date):    ${metrics.publicSkipped}`);
  console.log(`Private Storage Status:         ${metrics.privateStatus} (Stealth Mode)`);
  console.log(`Failures:                       ${metrics.failures}`);
  console.log("============================================================\n");

  // GitHub Actions Job Summary ($GITHUB_STEP_SUMMARY)
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) {
    return;
  }

  const markdownContent = [
    `## GitHub Repository Mirror Backup Summary`,
    ``,
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| **Source Account** | \`@${metrics.sourceUser}\` |`,
    `| **Backup Account** | \`[CONFIDENTIAL_STORAGE]\` |`,
    `| **Execution Time** | ${metrics.startTime.toISOString().replace("T", " ").slice(0, 19)} UTC |`,
    `| **Duration** | ${duration} |`,
    `| **Public Repositories** | ${metrics.publicTotal} |`,
    `| **Public Synchronized** | ${metrics.publicSynced} |`,
    `| **Public Up-to-Date** | ${metrics.publicSkipped} |`,
    `| **Private Storage Status** | \`${metrics.privateStatus} (Stealth Mode)\` |`,
    `| **Failures** | ${metrics.failures} |`,
    ``,
    `> [!NOTE]`,
    `> **Stealth Mode Active**: Private repositories are mirrored and synchronized to cold storage with zero-knowledge metadata protection. Counts, individual names, and logs are redacted to prevent footprint identification.`,
    ``,
    `### Public Repositories Breakdown`,
    ``,
    `| Repository | Status | Details |`,
    `| :--- | :---: | :--- |`,
    ...metrics.details.map((item) => {
      const details =
        item.reason ??
        (item.status === "SKIPPED" ? "Already up-to-date" : "Synchronized");
      return `| \`${item.name}\` | \`${item.status}\` | ${details} |`;
    }),
    ``,
  ].join("\n");

  try {
    await fs.appendFile(summaryFile, markdownContent, "utf8");
  } catch (error: any) {
    console.warn(`[WARN] Could not write to GITHUB_STEP_SUMMARY: ${error.message}`);
  }
}

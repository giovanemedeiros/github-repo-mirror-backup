/**
 * Google Apps Script (GAS) Template - GitHub Actions High-Priority Workflow Trigger
 *
 * Dispatches the 'mirror-backup.yml' workflow via the GitHub REST API ('workflow_dispatch' event),
 * routing execution directly to GitHub's immediate high-priority queue.
 * See scripts/README.md for full setup and time-driven trigger configuration instructions.
 */

function triggerMirrorBackupWorkflow() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("GITHUB_TOKEN");
  const owner = props.getProperty("GITHUB_OWNER");

  if (!token || !owner) {
    throw new Error("[ERROR] Missing GITHUB_TOKEN or GITHUB_OWNER in Script Properties.");
  }

  const repo = "github-repo-mirror-backup";
  const workflowFile = "mirror-backup.yml";
  const targetBranch = "main";

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;

  const options = {
    method: "post",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    contentType: "application/json",
    payload: JSON.stringify({
      ref: targetBranch,
    }),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  // GitHub API returns HTTP 204 (No Content) when workflow_dispatch is accepted
  if (statusCode === 204) {
    console.log(`[SUCCESS] Workflow '${workflowFile}' dispatched successfully on ${owner}/${repo}.`);
  } else {
    throw new Error(
      `[ERROR] Failed to dispatch workflow (HTTP ${statusCode}): ${response.getContentText()}`
    );
  }
}

import { sourceOctokit, backupOctokit } from "../config/octokit.js";
import type { SourceRepository } from "../types/repository.type.js";

/**
 * Synchronizes repository metadata ("About" section: description, homepage, topics)
 * from the source repository to the backup repository.
 */
export async function syncRepositoryMetadata(
  backupOwner: string,
  repo: SourceRepository
): Promise<void> {
  await backupOctokit.rest.repos.update({
    owner: backupOwner,
    repo: repo.name,
    description: repo.description ?? "",
    homepage: repo.homepage ?? "",
    default_branch: repo.defaultBranch,
  });

  if (repo.topics.length > 0) {
    await backupOctokit.rest.repos.replaceAllTopics({
      owner: backupOwner,
      repo: repo.name,
      names: repo.topics,
    });
  }
}

/**
 * Disables GitHub Actions for the backup repository to ensure a safe cold storage replica
 * without executing accidental workflows, cron jobs, or runner billing on the backup account.
 */
export async function disableActionsInBackup(
  backupOwner: string,
  repoName: string
): Promise<void> {
  try {
    await backupOctokit.rest.actions.setGithubActionsPermissionsRepository({
      owner: backupOwner,
      repo: repoName,
      enabled: false,
    });
  } catch (error) {
    console.warn(`[WARN] Could not disable Actions for ${repoName}: ${error}`);
  }
}

/**
 * Synchronizes GitHub Releases from the source repository to the backup repository.
 * Matches releases by tag_name and replicates title, body (markdown notes), and flags.
 */
export async function syncReleases(
  sourceOwner: string,
  backupOwner: string,
  repoName: string
): Promise<void> {
  const releases = await sourceOctokit.paginate(
    sourceOctokit.rest.repos.listReleases,
    {
      owner: sourceOwner,
      repo: repoName,
    }
  );

  for (const release of releases) {
    try {
      await backupOctokit.rest.repos.getReleaseByTag({
        owner: backupOwner,
        repo: repoName,
        tag: release.tag_name,
      });
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`[INFO] Replicating release ${release.tag_name} for ${repoName}...`);
        await backupOctokit.rest.repos.createRelease({
          owner: backupOwner,
          repo: repoName,
          tag_name: release.tag_name,
          name: release.name ?? release.tag_name,
          body: release.body ?? "",
          draft: release.draft,
          prerelease: release.prerelease,
        });
      }
    }
  }
}

export interface SyncCheckResult {
  isUpToDate: boolean;
  reason?: string;
}

/**
 * Evaluates whether a repository is already 100% in sync between source and backup.
 * Performs rigorous multi-dimensional drift detection:
 * 1. Existence and default branch match.
 * 2. "About" metadata match (description, homepage, topics).
 * 3. Git commit SHA and pushed_at match.
 * 4. Releases count, titles, bodies, and tags match.
 */
export async function isRepositoryUpToDate(
  sourceOwner: string,
  backupOwner: string,
  sourceRepo: SourceRepository
): Promise<SyncCheckResult> {
  try {
    // Fetch backup repository details
    const backupRepoResponse = await backupOctokit.rest.repos.get({
      owner: backupOwner,
      repo: sourceRepo.name,
    });
    const backupRepo = backupRepoResponse.data;

    // Check default branch
    if (backupRepo.default_branch !== sourceRepo.defaultBranch) {
      return { isUpToDate: false, reason: "Default branch mismatch" };
    }

    // Check "About" metadata (description and homepage)
    const sourceDesc = sourceRepo.description ?? "";
    const backupDesc = backupRepo.description ?? "";
    if (sourceDesc !== backupDesc) {
      return { isUpToDate: false, reason: "Description modified" };
    }

    const sourceHome = sourceRepo.homepage ?? "";
    const backupHome = backupRepo.homepage ?? "";
    if (sourceHome !== backupHome) {
      return { isUpToDate: false, reason: "Homepage modified" };
    }

    // Check topics
    const sourceTopics = sourceRepo.topics ?? [];
    const backupTopics = backupRepo.topics ?? [];
    if (
      sourceTopics.length !== backupTopics.length ||
      !sourceTopics.every((t) => backupTopics.includes(t))
    ) {
      return { isUpToDate: false, reason: "Topics modified" };
    }

    // Check Git commits on default branch
    const [sourceBranch, backupBranch] = await Promise.all([
      sourceOctokit.rest.repos.getBranch({
        owner: sourceOwner,
        repo: sourceRepo.name,
        branch: sourceRepo.defaultBranch,
      }),
      backupOctokit.rest.repos.getBranch({
        owner: backupOwner,
        repo: sourceRepo.name,
        branch: sourceRepo.defaultBranch,
      }),
    ]);

    if (sourceBranch.data.commit.sha !== backupBranch.data.commit.sha) {
      return { isUpToDate: false, reason: "New commits on default branch" };
    }

    // Check if source has newer pushes on any branch/tag
    if (sourceRepo.pushedAt && backupRepo.pushed_at) {
      const sourcePushed = new Date(sourceRepo.pushedAt).getTime();
      const backupPushed = new Date(backupRepo.pushed_at).getTime();
      if (sourcePushed > backupPushed) {
        return { isUpToDate: false, reason: "Source has newer branch/tag activity" };
      }
    }

    // Check GitHub Releases (count, title, notes, and tags)
    const [sourceReleases, backupReleases] = await Promise.all([
      sourceOctokit.rest.repos.listReleases({
        owner: sourceOwner,
        repo: sourceRepo.name,
        per_page: 100,
      }),
      backupOctokit.rest.repos.listReleases({
        owner: backupOwner,
        repo: sourceRepo.name,
        per_page: 100,
      }),
    ]);

    if (sourceReleases.data.length !== backupReleases.data.length) {
      return { isUpToDate: false, reason: "Release count mismatch" };
    }

    for (const sRel of sourceReleases.data) {
      const bRel = backupReleases.data.find((r) => r.tag_name === sRel.tag_name);
      if (!bRel) {
        return { isUpToDate: false, reason: `Missing release ${sRel.tag_name}` };
      }
      if ((sRel.name ?? sRel.tag_name) !== (bRel.name ?? bRel.tag_name)) {
        return { isUpToDate: false, reason: `Release title modified for ${sRel.tag_name}` };
      }
      if ((sRel.body ?? "") !== (bRel.body ?? "")) {
        return { isUpToDate: false, reason: `Release notes modified for ${sRel.tag_name}` };
      }
    }

    return { isUpToDate: true };
  } catch (error: any) {
    if (error.status === 404) {
      return { isUpToDate: false, reason: "Repository does not exist in backup" };
    }
    return { isUpToDate: false, reason: `Check failed (${error.message})` };
  }
}

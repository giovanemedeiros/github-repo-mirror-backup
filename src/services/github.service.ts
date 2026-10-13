import { sourceOctokit } from "../config/octokit.js";
import type { SourceRepository } from "../types/repository.type.js";

/**
 * Fetches all repositories belonging to the primary source account
 * (public, private, forks, and archived) using pagination.
 */
export async function fetchSourceRepositories(): Promise<SourceRepository[]> {
  const rawRepos = await sourceOctokit.paginate(
    sourceOctokit.rest.repos.listForAuthenticatedUser,
    {
      visibility: "all",
      affiliation: "owner",
      per_page: 100,
    }
  );

  return rawRepos.map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    htmlUrl: repo.html_url,
    isPrivate: repo.private,
    isFork: repo.fork,
    isArchived: repo.archived ?? false,
    description: repo.description,
    defaultBranch: repo.default_branch,
  }));
}

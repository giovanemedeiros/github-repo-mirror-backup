export interface SourceRepository {
  name: string;
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  description: string | null;
  defaultBranch: string;
  topics: string[];
  homepage: string | null;
  pushedAt: string | null;
}

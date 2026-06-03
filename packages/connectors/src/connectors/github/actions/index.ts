import type { CodeAction } from '../../../framework';
import { getUser } from './get-user';
import { listUserRepos } from './list-user-repos';
import { listInstallationRepos } from './list-installation-repos';
import { getRepo } from './get-repo';
import { getRepoContents } from './get-repo-contents';
import { listRepoIssues } from './list-repo-issues';
import { getIssue } from './get-issue';
import { createIssue } from './create-issue';
import { updateIssue } from './update-issue';
import { listPullRequests } from './list-pull-requests';
import { getPullRequest } from './get-pull-request';
import { createPullRequest } from './create-pull-request';
import { listPullRequestFiles } from './list-pull-request-files';
import { createPullRequestReview } from './create-pull-request-review';
import { createOrUpdateFile } from './create-or-update-file';
import { updatePullRequest } from './update-pull-request';
import { mergePullRequest } from './merge-pull-request';
import { listIssueComments } from './list-issue-comments';
import { createIssueComment } from './create-issue-comment';
import { updateIssueComment } from './update-issue-comment';

export const githubActions: CodeAction[] = [
  getUser,
  listUserRepos,
  listInstallationRepos,
  getRepo,
  getRepoContents,
  listRepoIssues,
  getIssue,
  createIssue,
  updateIssue,
  listPullRequests,
  getPullRequest,
  createPullRequest,
  listPullRequestFiles,
  createPullRequestReview,
  createOrUpdateFile,
  updatePullRequest,
  mergePullRequest,
  listIssueComments,
  createIssueComment,
  updateIssueComment,
];

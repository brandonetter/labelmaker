const { Octokit } = require("@octokit/rest");
const fetch = require("node-fetch");
const dotenv = require("dotenv");

dotenv.config();
const octokit = new Octokit({
  auth: process.env.AUTH_KEY, // github access token
  request: { fetch },
});

const owner = "JavaScript-Mastery-PRO"; // we would change this to JavaScript-Mastery-Pro
const NEEDS_REVIEW_LABEL = "needs review"; // the label that gets added if the PR is newer than the last label
const MERGE_CONFLICT_LABEL = "merge conflict"; // the label that gets added if the PR is not mergeable

async function getAllReposOfOrganization(org) {
  try {
    let allRepos = [];
    let page = 1;

    while (true) {
      const repos = await octokit.rest.repos.listForOrg({
        org,
        per_page: 100, // Maximum number of results per page
        page,
      });

      if (repos.data.length === 0) break; // Break the loop if no more repos

      allRepos = allRepos.concat(repos.data);
      page++;
    }

    return allRepos;
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return [];
  }
}

async function getAllPRsByName(org, prName) {
  try {
    const repos = await getAllReposOfOrganization(org);
    const matchingPRs = [];
    for (const repo of repos) {
      const prs = await listAllPRs(org, repo.name, "all");

      const matchingPRsInRepo = prs.filter((pr) => pr.title.includes(prName));
      console.log("Found matching PRs in repo:", matchingPRsInRepo.length);
      for (const pr of matchingPRsInRepo) {
        await addLabel(org, repo.name, pr.number, "algorithms");
        console.log("Added label 'algorithms' to PR:", pr.number);
      }
      matchingPRs.push(...matchingPRsInRepo);
    }

    return matchingPRs;
  } catch (error) {
    console.error("Error fetching PRs by name:", error);
    return [];
  }
}

async function listAllPRs(owner, repo, state = "open") {
  try {
    let allPRs = [];
    let page = 1;

    while (true) {
      const prs = await octokit.rest.pulls.list({
        owner,
        repo,
        state,
        per_page: 100, // more than 100 prs is uhh... unlikely
        page,
      });

      if (prs.data.length === 0) break;

      allPRs = allPRs.concat(prs.data);
      page++;
    }

    return allPRs;
  } catch (error) {
    console.error("Error fetching PRs:", error);
    return [];
  }
}

async function addLabel(owner, repo, pull_number, labelToAdd) {
  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pull_number,
      labels: [labelToAdd],
    });
    console.log(`Added label "${labelToAdd}" to PR #${pull_number}`);
  } catch (error) {
    console.error("Error in addLabel:", error);
  }
}
async function getDateOfLastCommit(owner, repo, pull_number) {
  const commits = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number,
  });

  return commits.data.length > 0
    ? commits.data[commits.data.length - 1].commit.committer.date
    : null;
}
(async () => {
  let prs = await getAllPRsByName(owner, "Feedback");
  console.log(prs);
  process.exit(0);
})();

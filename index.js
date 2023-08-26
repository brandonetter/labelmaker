const { Octokit } = require("@octokit/rest");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
const Client = require("pg").Client;

dotenv.config();
const octokit = new Octokit({
  auth: process.env.AUTH_KEY, // github access token
  request: { fetch },
});

const owner = "brandonetter"; // we would change this to JavaScript-Mastery-Pro
const NEEDS_REVIEW_LABEL = "needs review"; // the label that gets added if the PR is newer than the last label
const MERGE_CONFLICT_LABEL = "merge conflict"; // the label that gets added if the PR is not mergeable
const connectionString = process.env.DATABASE_URL; // supabase database url
const client = new Client({ connectionString });

async function getDateOfLastLabelAdded(owner, repo, issue_number) {
  const events = await octokit.rest.issues.listEvents({
    owner,
    repo,
    issue_number,
  });

  const labelEvents = events.data
    .filter((event) => event.event === "labeled")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return labelEvents.length > 0 ? labelEvents[0].created_at : null;
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

async function removeAllLabels(owner, repo, issue_number) {
  try {
    const labels = await octokit.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number,
    });

    for (let label of labels.data) {
      await removeLabel(owner, repo, issue_number, label.name);
    }
  } catch (error) {
    console.error("Error removing all labels:", error);
  }
}
async function removeLabel(owner, repo, issue_number, labelName) {
  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number,
      name: labelName,
    });
    console.log(
      `Label "${labelName}" removed from issue/PR #${issue_number} in ${owner}/${repo}`
    );
  } catch (error) {
    console.error(`Error removing label "${labelName}":`, error);
  }
}

async function checkMergable(owner, repo, pull_number) {
  try {
    const pr = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
    });

    const mergeable = pr.data.mergeable;

    if (mergeable === false) {
      console.log(`PR #${pull_number} is not mergeable. Adding label`);
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pull_number,
        labels: [MERGE_CONFLICT_LABEL],
      });
    }
  } catch (error) {
    console.error("Error fetching PR:", error);
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
async function addLabelIfCommitIsNewer(owner, repo, pull_number, labelToAdd) {
  try {
    const lastLabelDate = await getDateOfLastLabelAdded(
      owner,
      repo,
      pull_number
    );
    const lastCommitDate = await getDateOfLastCommit(owner, repo, pull_number);

    if (!lastCommitDate) {
      console.log("No commits found for the PR.");
      return;
    }

    if (!lastLabelDate || new Date(lastCommitDate) > new Date(lastLabelDate)) {
      await removeAllLabels(owner, repo, pull_number);
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pull_number,
        labels: [labelToAdd],
      });
      console.log(`Added label "${labelToAdd}" to PR #${pull_number}`);
    } else {
      console.log(
        "PR#" +
          pull_number +
          ": Last commit is not newer than the last label. No label added."
      );
    }
  } catch (error) {
    console.error("Error in addLabelIfCommitIsNewer:", error);
  }
}

(async () => {
  await client.connect();
  const query = {
    name: "fetch-repos",
    text: "SELECT * FROM repos",
  };

  const repos = await client.query(query);
  for (let repo of repos.rows) {
    console.log(`Checking repo: ${repo.reponame}`);
    let prs = await listAllPRs(owner, repo.reponame);
    for (let pr of prs) {
      const labels = pr.labels.map((label) => label.name);
      if (labels.includes(NEEDS_REVIEW_LABEL)) {
        console.log(
          `PR #${pr.number} already has the "${NEEDS_REVIEW_LABEL}" label. Skipping...`
        );
        if (!labels.includes(MERGE_CONFLICT_LABEL)) {
          await checkMergable(owner, repo.reponame, pr.number);
        }
        continue;
      }
      await addLabelIfCommitIsNewer(
        owner,
        repo.reponame,
        pr.number,
        NEEDS_REVIEW_LABEL
      );
    }
  }
  process.exit(0);
})();

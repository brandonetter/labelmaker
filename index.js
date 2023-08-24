const { Octokit } = require("@octokit/rest");
const fetch = require("node-fetch");
const dotenv = require("dotenv");

dotenv.config();
const octokit = new Octokit({
  auth: process.env.AUTH_KEY,
  request: { fetch },
});
const repo = "next13promsies";
const owner = "brandonetter";
const issue_number = 7;

const NEEDS_REVIEW_LABEL = "needs review";
const AWAITING_CHANGES_LABEL = "Awaiting Changes";

async function addLabelsToPR(owner, repo, pull_number, labels) {
  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      // pull requests are just issues in the GitHub API, so you can use issue_number interchangeably with pull_number
      issue_number: pull_number,
      labels,
    });
    console.log(
      `Labels ${labels.join(
        ", "
      )} added to PR #${pull_number} in ${owner}/${repo}`
    );
  } catch (error) {
    console.error("Error adding labels:", error);
  }
}
getDateOfLastLabelAdded(owner, repo, issue_number).then((date) => {
  if (date) {
    console.log(`The last label was added on: ${date}`);
  } else {
    console.log("No labels were found for the specified issue or PR.");
  }
});
// Example usage
// addLabelsToPR("brandonetter", "next13promsies", 7, ["label1", "label2"]);

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

async function listAllPRs(owner, repo, state = "open") {
  try {
    let allPRs = [];
    let page = 1;

    while (true) {
      const prs = await octokit.rest.pulls.list({
        owner,
        repo,
        state,
        per_page: 100, // Maximum number of results per page
        page,
      });

      if (prs.data.length === 0) break; // Break the loop if no more PRs

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
        "Last commit is not newer than the last label. No label added."
      );
    }
  } catch (error) {
    console.error("Error in addLabelIfCommitIsNewer:", error);
  }
}

(async () => {
  let prs = await listAllPRs(owner, repo);
  for (let pr of prs) {
    await addLabelIfCommitIsNewer(owner, repo, pr.number, NEEDS_REVIEW_LABEL);
  }
})();
// addLabelIfCommitIsNewer(owner, repo, issue_number, NEEDS_REVIEW_LABEL);

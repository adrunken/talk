const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'your-username/your-repo';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

function parseRepoString(repoString) {
  const parts = repoString.split('/');
  if (parts.length !== 2) {
    throw new Error('GITHUB_REPO must be in format: username/repo');
  }
  return {
    owner: parts[0],
    repo: parts[1],
  };
}

async function makeGitHubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'AI-Code-Modifier',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
          } else {
            resolve(data ? JSON.parse(data) : {});
          }
        } catch (error) {
          reject(new Error(`Failed to parse GitHub response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function getLatestCommitSha(owner, repo, branch) {
  const response = await makeGitHubRequest(
    'GET',
    `/repos/${owner}/${repo}/commits/${branch}`
  );
  return response.sha;
}

async function createBlob(owner, repo, content) {
  const response = await makeGitHubRequest(
    'POST',
    `/repos/${owner}/${repo}/git/blobs`,
    {
      content: content,
      encoding: 'utf-8',
    }
  );
  return response.sha;
}

async function getTree(owner, repo, sha) {
  const response = await makeGitHubRequest(
    'GET',
    `/repos/${owner}/${repo}/git/trees/${sha}`
  );
  return response;
}

async function createTree(owner, repo, parentTreeSha, blobSha, filePath) {
  const response = await makeGitHubRequest(
    'POST',
    `/repos/${owner}/${repo}/git/trees`,
    {
      base_tree: parentTreeSha,
      tree: [
        {
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blobSha,
        },
      ],
    }
  );
  return response.sha;
}

async function createCommit(owner, repo, treeSha, parentSha, message) {
  const response = await makeGitHubRequest(
    'POST',
    `/repos/${owner}/${repo}/git/commits`,
    {
      message,
      tree: treeSha,
      parents: [parentSha],
      author: {
        name: 'AI Code Modifier',
        email: 'ai@codemodifier.local',
        date: new Date().toISOString(),
      },
    }
  );
  return response.sha;
}

async function updateRef(owner, repo, branch, commitSha) {
  await makeGitHubRequest(
    'PATCH',
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      sha: commitSha,
      force: false,
    }
  );
}

async function commitFileToGitHub(filePath, fileContent, commitMessage) {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }

  const { owner, repo } = parseRepoString(GITHUB_REPO);

  const latestCommitSha = await getLatestCommitSha(owner, repo, GITHUB_BRANCH);
  const parentTree = await getTree(owner, repo, latestCommitSha);

  const blobSha = await createBlob(owner, repo, fileContent);
  const treeSha = await createTree(
    owner,
    repo,
    parentTree.sha,
    blobSha,
    filePath
  );
  const newCommitSha = await createCommit(
    owner,
    repo,
    treeSha,
    latestCommitSha,
    commitMessage
  );
  await updateRef(owner, repo, GITHUB_BRANCH, newCommitSha);

  return newCommitSha;
}

module.exports = { commitFileToGitHub };

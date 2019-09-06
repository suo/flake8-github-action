import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as request from 'request'

const { GITHUB_SHA, GITHUB_EVENT_PATH, GITHUB_TOKEN, GITHUB_WORKSPACE } = process.env
const event = require(String(GITHUB_EVENT_PATH))
const { repository } = event
const {
  owner: { login: owner }
} = repository
const { name: repo } = repository

const checkName = 'flake8 lint'

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github.antiope-preview+json',
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'User-Agent': 'flake8-action'
}

async function createCheck() {
  const body = {
    name: checkName,
    head_sha: GITHUB_SHA,
    status: 'in_progress',
    started_at: new Date()
  }

  const { data } = await request.request(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers,
    body
  })
  const { id } = data
  return id
}

async function updateCheck(id, conclusion, output) {
  const body = {
    name: checkName,
    head_sha: GITHUB_SHA,
    status: 'completed',
    completed_at: new Date(),
    conclusion,
    output
  }

  await request.request(`https://api.github.com/repos/${owner}/${repo}/check-runs/${id}`, {
    method: 'PATCH',
    headers,
    body
  })
}


async function runFlake8() {
  await exec.exec('pip3', ['install', 'flake8']);
  let myOutput = '';
  let myError = '';
  let options = {
      listeners: {
          stdout: (data: Buffer) => {
              myOutput += data.toString();
          },
          stderr: (data: Buffer) => {
              myError += data.toString();
          }
      }
  };
  await exec.exec('flake8', ['--exit-zero'], options);
  return myOutput;
}

function parseOutput(output) {
    // Group 0: whole match
    // Group 1: filename
    // Group 2: line number
    // Group 3: column number
    // Group 4: error code
    // Group 5: error description
    let regex = new RegExp(/^(.*?):(\d+):(\d+): (\w\d+) (.*)$/);
    let errors = output.split('\n');
    let matches : any[] = [];
    for (let i = 0; i < errors.length; i++) {
        let error = errors[i];
        let match = error.match(regex);
        if (match) {
          match = {
            path: match[1],
            start_line: match[2],
            end_line: match[2],
            start_column: match[3],
            end_column: match[3],
            annotation_level: "failure",
            message: `[${match[4]}] ${match[5]}`,
          };

          matches.push(match);
      }
    }

    const any_matches = matches.length > 0;
    return {
      conclusion: any_matches ? 'failure' : 'success',
      output: {
        title: checkName,
        summary: `${matches.length} error(s) found`,
        matches,
      },

    };
}

async function run() {
  try {
    const id = await createCheck();
      const myInput = core.getInput('myInput');
      const flake8Output = await runFlake8();
      const { conclusion, output } = parseOutput(flake8Output);
      await updateCheck(id, conclusion, output)
        if (conclusion === 'failure') {
      core.setFailed('flake8 failures found');
    }
  }
    catch (error) {
      core.setFailed(error.message);
  }
}

run();

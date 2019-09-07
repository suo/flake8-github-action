import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

const { GITHUB_TOKEN } = process.env;
const checkName = "flake8 lint"

async function runFlake8() {
  await exec.exec('pip3', ['install', 'flake8']);
  // XXX: the path pip installs to is not on the PATH by default. So we're
  // adding it to the PATH, but I don't know if this location is stable or not.
  core.addPath('/home/runner/.local/bin');

  let myOutput = '';
  let options = {
    listeners: {
      stdout: (data: Buffer) => {
        myOutput += data.toString();
      },
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
  let regex = new RegExp(/^(.*?):(\d+):(\d+): (\w\d+) ([\s|\w]*)/);
  let errors = output.split('\n');
  let annotations: any[] = [];
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

      annotations.push(match);
    }
  }

  const any_matches = annotations.length > 0;
  return {
    conclusion: any_matches ? 'failure' : 'success',
    output: {
      title: checkName,
      summary: `${annotations.length} error(s) found`,
      annotations: annotations,
    },
  };
}

async function createCheck(checkData) {
  const octokit = new github.GitHub(String(GITHUB_TOKEN));
  await octokit.checks.create({
    ...github.context.repo,
    name: checkName,
    head_sha: github.context.sha,
    status: 'completed',
    ...checkData
  });
}


async function run() {
  try {
    const flake8Output = await runFlake8();
    const checkData = parseOutput(flake8Output);
    console.log(checkData);
    await createCheck(checkData);
    if (checkData.conclusion === 'failure') {
      core.setFailed('flake8 failures found');
    }
    core.setFailed('flake8 failures found');
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();

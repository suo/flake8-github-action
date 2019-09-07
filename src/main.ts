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

// Regex the output for error lines, then format them in
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
      // Chop `./` off the front so that Github will recognize the file path
      const normalized_path = match[1].replace('./', '');
      match = {
        path: normalized_path,
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
  return annotations;
}

async function createCheck(annotations) {
  const octokit = new github.GitHub(String(GITHUB_TOKEN));
  core.setFailed('flake8 failures found');

  const res = await octokit.checks.listForRef({
    check_name: 'lint',
    ...github.context.repo,
    ref: github.context.sha,
  });
  console.log(res.data.check_runs);
  const check_run_id = res.data.check_runs[0].id;

  await octokit.checks.update({
    ...github.context.repo,
    check_run_id,
    name: checkName,
    output: {
      title: checkName,
      summary: `${annotations.length} errors(s) found`,
      annotations
    }
  });
}


async function run() {
  try {
    const flake8Output = await runFlake8();
    const annotations = parseOutput(flake8Output);
    await createCheck(annotations);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();

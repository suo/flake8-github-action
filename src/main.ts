import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as octokit from '@octokit/rest';

const { GITHUB_TOKEN } = process.env;

async function runFlake8() {
  let myOutput = '';
  let options = {
    listeners: {
      stdout: (data: Buffer) => {
        myOutput += data.toString();
      },
    }
  };
  await exec.exec('flake8 --exit-zero', [], options);
  return myOutput;
}

type Annotation = octokit.ChecksUpdateParamsOutputAnnotations;
// Regex the output for error lines, then format them in
function parseFlake8Output(output: string): Annotation[] {
  // Group 0: whole match
  // Group 1: filename
  // Group 2: line number
  // Group 3: column number
  // Group 4: error code
  // Group 5: error description
  let regex = new RegExp(/^(.*?):(\d+):(\d+): (\w\d+) ([\s|\w]*)/);
  let errors = output.split('\n');
  let annotations: Annotation[] = [];
  for (let i = 0; i < errors.length; i++) {
    let error = errors[i];
    let match = error.match(regex);
    if (match) {
      // Chop `./` off the front so that Github will recognize the file path
      const normalized_path = match[1].replace('./', '');
      const line = parseInt(match[2]);
      const column = parseInt(match[3]);
      const annotation_level = <const> 'failure';
      const annotation = {
        path: normalized_path,
        start_line: line,
        end_line: line,
        start_column: column,
        end_column: column,
        annotation_level,
        message: `[${match[4]}] ${match[5]}`,
      };

      annotations.push(annotation);
    }
  }
  return annotations;
}

async function createCheck(check_name: string, title: string, annotations: Annotation[]) {
  const octokit = new github.GitHub(String(GITHUB_TOKEN));
  const res = await octokit.checks.listForRef({
    check_name,
    ...github.context.repo,
    ref: github.context.sha
  });

  const check_run_id = res.data.check_runs[0].id;

  await octokit.checks.update({
    ...github.context.repo,
    check_run_id,
    output: {
      title,
      summary: `${annotations.length} errors(s) found`,
      annotations
    }
  });
}

async function run() {
  try {
    const flake8Output = await runFlake8();
    const annotations = parseFlake8Output(flake8Output);
    if (annotations.length > 0) {
      console.log(annotations);
      const checkName = core.getInput('checkName');
      await createCheck(checkName, "flake8 failure", annotations);
      core.setFailed(`${annotations.length} errors(s) found`);
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();

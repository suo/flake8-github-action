"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const github = __importStar(require("@actions/github"));
const { GITHUB_TOKEN } = process.env;
const checkName = "flake8 lint";
function runFlake8() {
    return __awaiter(this, void 0, void 0, function* () {
        yield exec.exec('pip3', ['install', 'flake8']);
        // XXX: the path pip installs to is not on the PATH by default. So we're
        // adding it to the PATH, but I don't know if this location is stable or not.
        core.addPath('/home/runner/.local/bin');
        let myOutput = '';
        let options = {
            listeners: {
                stdout: (data) => {
                    myOutput += data.toString();
                },
            }
        };
        yield exec.exec('flake8', ['--exit-zero'], options);
        return myOutput;
    });
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
    let annotations = [];
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
function createCheck(annotations) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = new github.GitHub(String(GITHUB_TOKEN));
        core.setFailed('flake8 failures found');
        const res = yield octokit.checks.listForRef(Object.assign(Object.assign({ check_name: 'lint' }, github.context.repo), { ref: github.context.sha }));
        console.log(res.data.check_runs);
        const check_run_id = res.data.check_runs[0].id;
        yield octokit.checks.update(Object.assign(Object.assign({}, github.context.repo), { check_run_id, name: checkName, output: {
                title: checkName,
                summary: `${annotations.length} errors(s) found`,
                annotations
            } }));
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const flake8Output = yield runFlake8();
            const annotations = parseOutput(flake8Output);
            yield createCheck(annotations);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();

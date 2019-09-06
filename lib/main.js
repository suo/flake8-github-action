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
const request = __importStar(require("request"));
const { GITHUB_SHA, GITHUB_EVENT_PATH, GITHUB_TOKEN, GITHUB_WORKSPACE } = process.env;
const event = require(String(GITHUB_EVENT_PATH));
const { repository } = event;
const { owner: { login: owner } } = repository;
const { name: repo } = repository;
const checkName = 'flake8 lint';
const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github.antiope-preview+json',
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'flake8-action'
};
function createCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        const body = {
            name: checkName,
            head_sha: GITHUB_SHA,
            status: 'in_progress',
            started_at: new Date()
        };
        const { data } = yield request.request(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
            method: 'POST',
            headers,
            body
        });
        const { id } = data;
        return id;
    });
}
function updateCheck(id, conclusion, output) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = {
            name: checkName,
            head_sha: GITHUB_SHA,
            status: 'completed',
            completed_at: new Date(),
            conclusion,
            output
        };
        yield request.request(`https://api.github.com/repos/${owner}/${repo}/check-runs/${id}`, {
            method: 'PATCH',
            headers,
            body
        });
    });
}
function runFlake8() {
    return __awaiter(this, void 0, void 0, function* () {
        yield exec.exec('pip3', ['install', 'flake8']);
        let myOutput = '';
        let myError = '';
        let options = {
            listeners: {
                stdout: (data) => {
                    myOutput += data.toString();
                },
                stderr: (data) => {
                    myError += data.toString();
                }
            }
        };
        yield exec.exec('flake8', ['--exit-zero'], options);
        return myOutput;
    });
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
    let matches = [];
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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const id = yield createCheck();
            const myInput = core.getInput('myInput');
            const flake8Output = yield runFlake8();
            const { conclusion, output } = parseOutput(flake8Output);
            yield updateCheck(id, conclusion, output);
            if (conclusion === 'failure') {
                core.setFailed('flake8 failures found');
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();

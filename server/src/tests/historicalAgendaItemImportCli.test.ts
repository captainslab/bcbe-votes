import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve(__dirname, "../scripts/importHistoricalAgendaItem.ts");
const source = readFileSync(scriptPath, "utf8");

assert.match(source, /--meetingId/, "script must require explicit --meetingId targeting");
assert.match(source, /--agendaId/, "script must require explicit --agendaId targeting");
assert.match(source, /--enSiteId/, "script must require explicit --enSiteId targeting");
assert.match(source, /--meetingDate/, "script must require explicit --meetingDate targeting");
assert.match(source, /--dry-run/, "script must support dry-run mode");
assert.match(source, /--execute/, "script must support execute mode");
assert.match(source, /Specify exactly one mode: --dry-run or --execute/, "script must refuse missing or conflicting modes");
assert.match(source, /refuses broad\/date-range imports|refuseBroadImportArgs/, "script must explicitly reject broad/date-range arguments");
assert.match(source, /fetchCompleteAgendaItem/, "script must use session-backed agenda fetcher");
assert.doesNotMatch(source, /fetchMeetingDetail\(/, "script must not use direct ViewMeeting HTML fetch as source of truth");
assert.match(source, /persistImportedMeetingVoteItems/, "script must use existing persistence helper");
assert.match(source, /\[REDACTED_SESSION_BACKED_PATH\]/, "script must redact session-backed request paths");
assert.match(source, /createHash\("sha256"\)/, "script must use a one-way agenda source hash");
assert.match(source, /buildSafeAgendaSource/, "script must store a stable non-secret agenda source marker");
assert.doesNotMatch(source, /Buffer\.from\(agendaId\)/, "script must not base64-encode the raw agendaId as its source marker");
assert.match(source, /findExistingVoteItem/, "script must include an idempotence check before execute");
assert.match(source, /itemDetails\.EncrID/, "script must validate returned agenda item identity");
assert.match(source, /rawSourceEvidence/, "script should print source evidence, not session identifiers");
assert.match(source, /href:\s*"\[REDACTED\]"/, "dry-run output must redact browser href");
assert.match(source, /buildMeetingSourceUrl\(options\.meetingId, options\.agendaId\)/, "proposed/persisted meeting source must use agenda hash marker");
assert.doesNotMatch(source, /ViewMeeting\.aspx/, "historical agenda script must not emit or persist direct ViewMeeting URLs");
assert.doesNotMatch(source, /requestPath:\s*fetched\.requestPath/, "dry-run output must not print raw requestPath");
assert.doesNotMatch(source, /requestUrl:\s*fetched\.url/, "dry-run output must not print fetched.url");

const runScript = (args: string[]) =>
  spawnSync("npx", ["tsx", "src/scripts/importHistoricalAgendaItem.ts", ...args], {
    cwd: resolve(__dirname, "../.."),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://invalid/invalid",
    },
  });

const noMode = runScript([
  "--meetingId=12553",
  "--agendaId=G4kK4rcnO1EaEXjfslshDO3kA==",
  "--enSiteId=5NRPgquRlNnivNRBQhp7jw==",
  "--meetingDate=2020-06-25T17:30:00Z",
]);
assert.notEqual(noMode.status, 0, "script must fail when neither --dry-run nor --execute is provided");
assert.match(noMode.stderr, /Specify exactly one mode/, "missing-mode failure must explain required modes");

const broadArg = runScript([
  "--dry-run",
  "--meetingId=12553",
  "--agendaId=G4kK4rcnO1EaEXjfslshDO3kA==",
  "--enSiteId=5NRPgquRlNnivNRBQhp7jw==",
  "--meetingDate=2020-06-25T17:30:00Z",
  "--year=2020",
]);
assert.notEqual(broadArg.status, 0, "script must fail on broad/date-range arguments before fetching");
assert.match(broadArg.stderr, /Refusing broad\/date-range imports/, "broad-arg failure must be explicit");

const help = execFileSync("npx", ["tsx", "src/scripts/importHistoricalAgendaItem.ts", "--help"], {
  cwd: resolve(__dirname, "../.."),
  encoding: "utf8",
});
assert.match(help, /--dry-run/, "help must document dry-run mode");
assert.match(help, /--execute/, "help must document execute mode");

console.log("historical agenda item import CLI guardrails: PASS");

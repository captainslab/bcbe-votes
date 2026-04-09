import { runMinutesVoteExtractionProof } from "../ingestion/workflow/minutesVoteExtractionProof";

const args = process.argv.slice(2);

const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const queries = (readArg("queries") || "carried,no,failed,unanimous,ayes,nays,abstain,approved,passed,denied")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const maxItems = Number(readArg("maxItems") || "8");
const remoteDebugPort = Number(readArg("remoteDebugPort") || "9222");
const probeOutputPath = readArg("probeOutput");
const persist = args.includes("--persist");

const main = async () => {
  const result = await runMinutesVoteExtractionProof({
    queries,
    maxItems,
    remoteDebugPort,
    persist,
    ...(probeOutputPath ? { probeOutputPath } : {}),
  });

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

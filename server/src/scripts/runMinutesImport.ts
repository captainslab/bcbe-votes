import { runBatchMinutesImport } from "../ingestion/workflow/batchMinutesImport";

const defaultProofSlice = ["22486", "22694", "22834", "22981", "23153"];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed: { limit?: number; simbliIds?: string[] } = {};

  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      parsed.limit = Number(arg.slice("--limit=".length));
      continue;
    }

    if (arg.startsWith("--simbliIds=")) {
      parsed.simbliIds = arg
        .slice("--simbliIds=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  return parsed;
};

const main = async () => {
  const args = parseArgs();
  const result = await runBatchMinutesImport({
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    simbliIds: args.simbliIds ?? defaultProofSlice,
  });

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

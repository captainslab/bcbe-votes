import { fetchMeetingListing } from "../ingestion/fetchers/simbliFetcher";
import { normalizeMeetingListingRows } from "../ingestion/normalizers/meetingListingNormalizer";
import { parseMeetingListing } from "../ingestion/parsers/meetingListingParser";

const args = new Set(process.argv.slice(2));
const previewOnly = args.has("--preview") || args.has("--dry-run");

const main = async () => {
  if (previewOnly) {
    const html = await fetchMeetingListing();
    const parsed = parseMeetingListing(html);
    const normalized = normalizeMeetingListingRows(parsed);
    console.log(
      JSON.stringify(
        {
          extractedCount: parsed.length,
          normalizedCount: normalized.meetings.length,
          sampleMeetings: normalized.meetings.slice(0, 5),
          failures: normalized.errors.slice(0, 5),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { importMeetingListing } = await import("../ingestion/workflow/meetingListingImport");
  const result = await importMeetingListing();
  const payload = {
    extractedCount: result.extractedCount,
    normalizedCount: result.normalizedCount,
    savedCount: result.savedCount,
    failedCount: result.failedCount,
    sampleMeetings: result.meetings.slice(0, 5),
    failures: result.failures.slice(0, 5),
  };

  console.log(JSON.stringify(payload, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

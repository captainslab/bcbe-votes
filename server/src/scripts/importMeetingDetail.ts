import { fetchMeetingDetail } from "../ingestion/fetchers/simbliFetcher";
import { parseMeetingDetailPage } from "../ingestion/parsers/meetingDetailParser";

const args = process.argv.slice(2);
const simbliId = args.find((arg) => arg.startsWith("--simbliId="))?.split("=")[1];
const previewOnly = args.includes("--preview") || args.includes("--dry-run");
const targetId = simbliId || "28157";

const main = async () => {
  if (previewOnly) {
    const { html, sourceUrl } = await fetchMeetingDetail(targetId);
    const parsed = parseMeetingDetailPage(html, sourceUrl, targetId);
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  const { importMeetingDetail } = await import("../ingestion/workflow/meetingDetailImport");
  const result = await importMeetingDetail({ simbliId: targetId });
  console.log(JSON.stringify(result, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

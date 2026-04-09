import { fetchSimbliSearchFlow } from "../ingestion/fetchers/simbliSearchFetcher";
import { parseSearchMeetingModuleResponse, parseSearchedMeetingDataResponse } from "../ingestion/parsers/searchMeetingParser";
import {
  normalizeSearchMeetingRows,
  normalizeSearchedMeetingData,
} from "../ingestion/normalizers/searchMeetingNormalizer";

const args = process.argv.slice(2);
const previewOnly = args.includes("--preview") || args.includes("--dry-run");
const query = args.find((arg) => arg.startsWith("--query="))?.split("=")[1] || "board";
const remoteDebugPort = Number(args.find((arg) => arg.startsWith("--remoteDebugPort="))?.split("=")[1] || "9222");

const main = async () => {
  if (previewOnly) {
    const browserRun = await fetchSimbliSearchFlow({ query, remoteDebugPort });
    const searchResponse = parseSearchMeetingModuleResponse(browserRun.searchResponseText);
    const searchedMeetingData = parseSearchedMeetingDataResponse(browserRun.searchedMeetingDataText);
    const searchRows = searchResponse.meetingSearchResponseDTOs ?? [];
    const normalizedSearch = normalizeSearchMeetingRows(searchRows);
    const normalizedMeetings = normalizeSearchedMeetingData(searchedMeetingData);
    console.log(
      JSON.stringify(
        {
          query,
          searchResultsExtracted: searchRows.length,
          searchResultsNormalized: normalizedSearch.meetings.length,
          meetingsExtracted: searchedMeetingData.MeetingList.length,
          meetingsNormalized: normalizedMeetings.meetings.length,
          selectedAgendaId:
            searchRows.find((row) => row.AgendaId && row.AgendaTitle === "Board View")
              ?.AgendaId ??
            searchRows.find((row) => row.AgendaId)?.AgendaId ??
            "",
          cacheKey: JSON.parse(browserRun.searchRequestBody).CacheKey ?? "",
          sampleSearchResults: normalizedSearch.meetings.slice(0, 5),
          sampleMeetings: normalizedMeetings.meetings.slice(0, 5),
          followUpResponseSample: {
            nextItem: searchedMeetingData.NextItem,
            previousItem: searchedMeetingData.PreviousItem,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const { importSearchMeetings } = await import("../ingestion/workflow/searchMeetingImport");
  const result = await importSearchMeetings({ query, remoteDebugPort });
  console.log(
    JSON.stringify(
      {
        query,
        searchResultsExtracted: result.searchResultsExtracted,
        searchResultsNormalized: result.searchResultsNormalized,
        meetingsExtracted: result.meetingsExtracted,
        meetingsNormalized: result.meetingsNormalized,
        savedCount: result.savedCount,
        failedCount: result.failedCount,
        selectedAgendaId: result.selectedAgendaId,
        cacheKey: result.cacheKey,
        sampleSearchResults: result.searchSample,
        sampleMeetings: result.meetingSample,
        failures: result.failures.slice(0, 5),
      },
      null,
      2,
    ),
  );
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

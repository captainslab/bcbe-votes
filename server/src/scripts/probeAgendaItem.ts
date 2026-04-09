import { fetchCompleteAgendaItem } from "../ingestion/fetchers/simbliAgendaFetcher";
import {
  normalizeAgendaItemLoaderResponse,
  parseAgendaItemLoaderResponse,
} from "../ingestion/parsers/agendaItemParser";

const args = process.argv.slice(2);
const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
};

const enSiteId = readArg("enSiteId");
const agendaId = readArg("agendaId");
const meetingIdValue = readArg("meetingId");
const meetingId = meetingIdValue ? Number(meetingIdValue) : undefined;
const remoteDebugPort = Number(readArg("remoteDebugPort") || "9222");

const main = async () => {
  if (!enSiteId || !agendaId) {
    throw new Error("Missing required args: --enSiteId, --agendaId");
  }

  const { url, requestPath, status, text, state } = await fetchCompleteAgendaItem({
    enSiteId,
    agendaId,
    remoteDebugPort,
    ...(meetingId !== undefined ? { meetingId } : {}),
  });
  const parsed = parseAgendaItemLoaderResponse(text);
  const normalized = normalizeAgendaItemLoaderResponse(parsed);
  console.log(
    JSON.stringify(
      {
        url,
        requestPath,
        status,
        browserState: state,
        rawResponseSample: text.slice(0, 2000),
        normalized,
        fieldsAvailable: {
          itemTitle: Boolean(normalized.agendaItemTitle),
          agendaSections: normalized.agendaSectionCandidates.length > 0,
          motionText: normalized.motionTextCandidates.length > 0,
          minutesText: normalized.hasMinutesPayload || normalized.showMinutes,
          voteBearingClues: normalized.voteClues.length > 0,
        },
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

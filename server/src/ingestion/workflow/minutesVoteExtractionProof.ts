import { readFile } from "node:fs/promises";
import { fetchCompleteAgendaItem } from "../fetchers/simbliAgendaFetcher";
import { fetchSearchMeetingModule } from "../fetchers/simbliSearchFetcher";
import {
  normalizeMinutesVoteProof,
  buildMinutesVoteRequestUrl,
  minutesVotePatternRules,
} from "../normalizers/minutesVoteNormalizer";
import { parseAgendaItemLoaderResponse } from "../parsers/agendaItemParser";
import { extractMinutesVoteSummary } from "../parsers/minutesVoteParser";
import { parseSearchMeetingModuleResponse } from "../parsers/searchMeetingParser";
import { normalizeWhitespace } from "../../utils/text";
import type { ParsedVoteItem } from "../parsers/simbliParser";

export type MinutesVoteExtractionProofOptions = {
  queries: string[];
  maxItems: number;
  remoteDebugPort?: number;
  persist?: boolean;
  probeOutputPath?: string;
};

type SampleRow = {
  query: string;
  meetingDate: string;
  meetingTitle: string;
  meetingTypeName: string;
  agendaId: string;
  agendaTitle: string | null;
  enSiteId: string;
  sourceType: string;
  existInMinutes: boolean;
};

type PersistenceResult = {
  requested: boolean;
  attempted: boolean;
  blockedReason: string | null;
  persistedVoteItems: Array<{
    agendaId: string;
    meetingDbId: number;
    voteItemDbId: number;
    voteRecordCount: number;
  }>;
  skippedAgendaIds: Array<{
    agendaId: string;
    reason: string;
  }>;
};

const uniqByAgendaId = (rows: SampleRow[]) => [...new Map(rows.map((row) => [row.agendaId, row])).values()];

type ProofSample = {
  query: string;
  meetingDate: string;
  meetingTitle: string;
  meetingTypeName: string;
  meetingId: number;
  agendaId: string;
  agendaTitle: string | null;
  enSiteId: string;
  sourceType: string;
  existInMinutes: boolean;
  requestPath: string;
  requestUrl: string;
  extractedVote: ReturnType<typeof extractMinutesVoteSummary>;
  normalized: ReturnType<typeof normalizeMinutesVoteProof>;
};

type ProbeOutputSample = {
  query: string;
  meetingDate: string;
  meetingTitle: string;
  agendaTitle: string | null;
  agendaId: string;
  sourceType: string;
  requestPath: string;
  rawPayloadSample: {
    MeetingId: number;
    Meeting?: {
      Title?: string;
      TitleDateTime?: string;
      IsPublished?: boolean;
      IsMinutesPublished?: boolean;
    };
    itemDetails: {
      EncrID: string;
      EncrParentID: string;
      Title: string;
      Sequence: string;
      Level: number;
    };
    Minutes: unknown | null;
    ShowMinutes: boolean;
    UserPermission: {
      CanSeeMinutes: boolean;
    };
  };
};

const tallyBy = <T extends string>(values: T[]) =>
  Object.fromEntries(
    Object.entries(
      values.reduce<Record<string, number>>((acc, value) => {
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((left, right) => right[1] - left[1]),
  );

const hasDatabaseUrl = async () => {
  try {
    const { config } = await import("../../config/env");
    return Boolean(config.databaseUrl);
  } catch {
    return false;
  }
};

const parseToolOutputJson = (text: string) => {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("Probe output does not contain JSON.");
  const end = text.lastIndexOf("\n}");
  if (end < 0) throw new Error("Probe output JSON terminator was not found.");
  return JSON.parse(text.slice(start, end + 2)) as { samples?: ProbeOutputSample[] };
};

const loadSamplesFromProbeOutput = async (probeOutputPath: string) => {
  const raw = await readFile(probeOutputPath, "utf8");
  const parsed = parseToolOutputJson(raw);
  return parsed.samples ?? [];
};

const persistStableSamples = async (
  samples: Array<ReturnType<typeof normalizeMinutesVoteProof> & { sampleRow: SampleRow; requestUrl: string; meetingId: number }>,
  requested: boolean,
): Promise<PersistenceResult> => {
  if (!requested) {
    return {
      requested,
      attempted: false,
      blockedReason: null,
      persistedVoteItems: [],
      skippedAgendaIds: [],
    };
  }

  if (!(await hasDatabaseUrl())) {
    return {
      requested,
      attempted: false,
      blockedReason: "DATABASE_URL is required to persist proof samples.",
      persistedVoteItems: [],
      skippedAgendaIds: samples.map((sample) => ({
        agendaId: sample.sampleRow.agendaId,
        reason: sample.persistReady ? "DATABASE_URL is required to persist proof samples." : "Sample is not persist-ready.",
      })),
    };
  }

  const [{ db, schema }, drizzle] = await Promise.all([import("../../db"), import("drizzle-orm")]);
  const { eq, ilike, or, sql } = drizzle;

  const resolveBoardMemberId = async (tx: any, rawName?: string | null) => {
    if (!rawName) return null;
    const name = normalizeWhitespace(rawName);
    if (!name) return null;

    const existing = await tx
      .select()
      .from(schema.boardMembers)
      .where(
        or(
          ilike(schema.boardMembers.name, name),
          sql`${schema.boardMembers.aliases} @> ${JSON.stringify([name])}::jsonb`,
        ),
      )
      .limit(1);

    if (existing.length) return existing[0].id;

    const [created] = await tx
      .insert(schema.boardMembers)
      .values({
        name,
        aliases: [name],
      })
      .onConflictDoUpdate({
        target: schema.boardMembers.name,
        set: { aliases: sql`array_append(${schema.boardMembers.aliases}, ${name})` },
      })
      .returning();

    return created?.id ?? null;
  };

  const upsertMeeting = async (tx: any, sample: SampleRow, meetingId: number, requestUrl: string) => {
    const [saved] = await tx
      .insert(schema.meetings)
      .values({
        date: new Date(sample.meetingDate),
        title: sample.meetingTitle,
        type: sample.meetingTypeName || sample.meetingTitle,
        simbliSiteId: "200015",
        simbliId: String(meetingId),
        sourceUrl: `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=200015&MID=${meetingId}`,
        minutesUrl: requestUrl,
        ingestionStatus: "partial",
        verificationStatus: "unverified",
      })
      .onConflictDoUpdate({
        target: schema.meetings.simbliId,
        set: {
          date: new Date(sample.meetingDate),
          title: sample.meetingTitle,
          type: sample.meetingTypeName || sample.meetingTitle,
          minutesUrl: requestUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!saved) throw new Error(`Failed to save meeting ${meetingId}`);
    return saved;
  };

  const upsertVoteItem = async (tx: any, meetingDbId: number, item: ParsedVoteItem) => {
    const [saved] = await tx
      .insert(schema.voteItems)
      .values({
        meetingId: meetingDbId,
        agendaSection: item.agendaSection,
        itemTitle: item.itemTitle,
        summaryText: item.summaryText,
        summarySource: item.summarySource,
        summaryConfidenceScore: item.summaryConfidenceScore,
        motionText: item.motionText,
        motionMadeBy: item.motionMadeBy,
        motionSecondedBy: item.motionSecondedBy,
        result: item.result,
        isNonUnanimous: item.isNonUnanimous,
        voteTally: item.voteTally,
        sourceExcerpt: item.sourceExcerpt,
        verificationStatus: item.verificationStatus,
        detectedPattern: item.detectedPattern,
        confidenceScore: item.confidenceScore,
      } as any)
      .onConflictDoUpdate({
        target: [schema.voteItems.meetingId, schema.voteItems.itemTitle, schema.voteItems.motionText],
        set: {
          agendaSection: item.agendaSection,
          summaryText: item.summaryText,
          summarySource: item.summarySource,
          summaryConfidenceScore: item.summaryConfidenceScore,
          motionMadeBy: item.motionMadeBy,
          motionSecondedBy: item.motionSecondedBy,
          result: item.result,
          isNonUnanimous: item.isNonUnanimous,
          voteTally: item.voteTally,
          sourceExcerpt: item.sourceExcerpt,
          verificationStatus: item.verificationStatus,
          detectedPattern: item.detectedPattern,
          confidenceScore: item.confidenceScore,
          updatedAt: new Date(),
        },
      } as any)
      .returning();

    if (!saved) throw new Error(`Failed to save vote item ${item.itemTitle}`);
    return saved;
  };

  const persistedVoteItems: PersistenceResult["persistedVoteItems"] = [];
  const skippedAgendaIds: PersistenceResult["skippedAgendaIds"] = [];

  for (const sample of samples) {
    if (!sample.persistReady) {
      skippedAgendaIds.push({
        agendaId: sample.sampleRow.agendaId,
        reason: "Sample is not persist-ready.",
      });
      continue;
    }

    await db.transaction(async (tx) => {
      const meetingRow = await upsertMeeting(tx, sample.sampleRow, sample.meetingId, sample.requestUrl);
      const voteItemRow = await upsertVoteItem(tx, meetingRow.id, sample.voteItem);

      const motionMakerId = await resolveBoardMemberId(tx, sample.voteItem.motionMadeBy);
      const motionSecondedId = await resolveBoardMemberId(tx, sample.voteItem.motionSecondedBy);

      if (motionMakerId) {
        await tx
          .update(schema.voteItems)
          .set({ motionMadeByMemberId: motionMakerId })
          .where(eq(schema.voteItems.id, voteItemRow.id));
      }

      if (motionSecondedId) {
        await tx
          .update(schema.voteItems)
          .set({ motionSecondedByMemberId: motionSecondedId })
          .where(eq(schema.voteItems.id, voteItemRow.id));
      }

      for (const vote of sample.voteRecords) {
        const memberId = await resolveBoardMemberId(tx, vote.memberName);
        if (!memberId) continue;

        await tx
          .insert(schema.voteRecords)
          .values({
            voteItemId: voteItemRow.id,
            boardMemberId: memberId,
            voteValue: vote.value as typeof schema.voteValueEnum.enumValues[number],
          })
          .onConflictDoUpdate({
            target: [schema.voteRecords.voteItemId, schema.voteRecords.boardMemberId],
            set: { voteValue: vote.value as typeof schema.voteValueEnum.enumValues[number] },
          });
      }

      persistedVoteItems.push({
        agendaId: sample.sampleRow.agendaId,
        meetingDbId: meetingRow.id,
        voteItemDbId: voteItemRow.id,
        voteRecordCount: sample.voteRecords.length,
      });
    });
  }

  return {
    requested,
    attempted: true,
    blockedReason: null,
    persistedVoteItems,
    skippedAgendaIds,
  };
};

export const runMinutesVoteExtractionProof = async (
  options: MinutesVoteExtractionProofOptions,
) => {
  const queries = options.queries.filter(Boolean);
  const remoteDebugPort = options.remoteDebugPort ?? 9222;
  const queryErrors: Array<{ query: string; error: string }> = [];
  let discoveredMinutesRows = 0;
  const samples: ProofSample[] = [];

  if (options.probeOutputPath) {
    const probeSamples = (await loadSamplesFromProbeOutput(options.probeOutputPath)).slice(0, options.maxItems);
    if (probeSamples.length === 0) {
      throw new Error("Probe output did not contain any sample rows.");
    }
    discoveredMinutesRows = probeSamples.length;

    for (const probeSample of probeSamples) {
      const parsedAgendaItem = {
        Id: null,
        MeetingId: probeSample.rawPayloadSample.MeetingId,
        Meeting: {
          ID: probeSample.rawPayloadSample.MeetingId,
          ...(probeSample.rawPayloadSample.Meeting ?? {}),
        },
        SiteId: 200015,
        itemDetails: {
          ...probeSample.rawPayloadSample.itemDetails,
          SelectedTab: 0,
          VisibilityMode: 0,
          IsReady: false,
          IsEditable: false,
          HasStickyNote: false,
          CreatedOn: "",
          CreatedOnTime: "",
          CreatedBy: "",
          ModifiedOn: "",
          ModifiedOnTime: "",
          ModifiedBy: "",
          SiteTimeZoneDate: "",
          IsPublicCommentOn: false,
          HasWorkflow: false,
          Deleted: false,
          Operation: 0,
          MinutesTabHighlighted: Boolean(probeSample.rawPayloadSample.ShowMinutes),
          ContentTabHighlighted: false,
          ParentItemEffectiveVisibility: 0,
          HasAnyChild: false,
        },
        itemContents: [],
        Minutes: probeSample.rawPayloadSample.Minutes,
        PublicComments: [],
        ShowTasks: false,
        Tasks: null,
        UserPermission: {
          UserID: null,
          CanViewActionItem: false,
          CanAccessActionItem: false,
          CanAccessStickyNotes: false,
          CanSeeMinutes: probeSample.rawPayloadSample.UserPermission.CanSeeMinutes,
          IsMeetingAdmin: false,
          CanDownloadOffline: false,
          CanViewManagementItems: false,
          CanViewConfidentialItems: false,
          CanAdministerMinutes: false,
          CanAdministerMeetings: false,
          IsSuperUser: false,
          CanAccessThisMeetingType: true,
        },
        ShowMinutes: probeSample.rawPayloadSample.ShowMinutes,
        SiteName: "BCBE",
      };
      const extractedVote = extractMinutesVoteSummary(parsedAgendaItem);
      const requestUrl = buildMinutesVoteRequestUrl(probeSample.requestPath);
      const sampleRow: SampleRow = {
        query: probeSample.query,
        meetingDate: probeSample.meetingDate,
        meetingTitle: probeSample.meetingTitle,
        meetingTypeName: probeSample.meetingTitle,
        agendaId: probeSample.agendaId,
        agendaTitle: probeSample.agendaTitle,
        enSiteId: "",
        sourceType: probeSample.sourceType,
        existInMinutes: true,
      };
      const normalized = normalizeMinutesVoteProof({
        ...sampleRow,
        requestPath: probeSample.requestPath,
        requestUrl,
        parsedAgendaItem,
        extractedVote,
      });

      samples.push({
        ...sampleRow,
        requestPath: probeSample.requestPath,
        requestUrl,
        meetingId: parsedAgendaItem.MeetingId,
        extractedVote,
        normalized,
      });
    }
  } else {
    const discoveredRows: SampleRow[] = [];

    for (const query of queries) {
      try {
        const searchRun = await fetchSearchMeetingModule({
          query,
          remoteDebugPort,
          timeoutMs: 90_000,
        });
        const parsedSearch = parseSearchMeetingModuleResponse(searchRun.searchResponseText);
        for (const row of parsedSearch.meetingSearchResponseDTOs ?? []) {
          if (!row.ExistInMinutes || !row.AgendaId) continue;
          discoveredRows.push({
            query,
            meetingDate: row.MeetingDate,
            meetingTitle: row.MeetingTitle,
            meetingTypeName: row.MeetingTypeName,
            agendaId: row.AgendaId,
            agendaTitle: row.AgendaTitle,
            enSiteId: row.EnSiteId,
            sourceType: row.SourceType,
            existInMinutes: row.ExistInMinutes,
          });
        }
      } catch (error) {
        queryErrors.push({
          query,
          error: (error as Error).message,
        });
      }
    }

    const sampleRows = uniqByAgendaId(discoveredRows).slice(0, options.maxItems);
    if (sampleRows.length === 0) {
      throw new Error("No minutes-backed agenda items were discovered for the requested queries.");
    }
    discoveredMinutesRows = discoveredRows.length;

    for (const sampleRow of sampleRows) {
      const fetched = await fetchCompleteAgendaItem({
        agendaId: sampleRow.agendaId,
        enSiteId: sampleRow.enSiteId,
        remoteDebugPort,
      });
      const parsedAgendaItem = parseAgendaItemLoaderResponse(fetched.text);
      const extractedVote = extractMinutesVoteSummary(parsedAgendaItem);
      const requestUrl = buildMinutesVoteRequestUrl(fetched.requestPath);
      const normalized = normalizeMinutesVoteProof({
        ...sampleRow,
        requestPath: fetched.requestPath,
        requestUrl,
        parsedAgendaItem,
        extractedVote,
      });

      samples.push({
        ...sampleRow,
        requestPath: fetched.requestPath,
        requestUrl,
        meetingId: parsedAgendaItem.MeetingId,
        extractedVote,
        normalized,
      });
    }
  }

  const persistence = await persistStableSamples(
    samples.map((sample) => ({
      ...sample.normalized,
      sampleRow: {
        query: sample.query,
        meetingDate: sample.meetingDate,
        meetingTitle: sample.meetingTitle,
        meetingTypeName: sample.meetingTypeName,
        agendaId: sample.agendaId,
        agendaTitle: sample.agendaTitle,
        enSiteId: sample.enSiteId,
        sourceType: sample.sourceType,
        existInMinutes: sample.existInMinutes,
      },
      requestUrl: sample.requestUrl,
      meetingId: sample.meetingId,
    })),
    Boolean(options.persist),
  );
  const distributionByVoteShape = tallyBy(samples.map((sample) => sample.normalized.bucket));

  return {
    queries,
    queryErrors,
    discoveredMinutesRows,
    sampledItems: samples.length,
    distributionByVoteShape,
    exactFailureCases: samples
      .flatMap((sample) =>
        sample.normalized.failureCodes.map((failureCode) => ({
          agendaId: sample.agendaId,
          meetingId: sample.meetingId,
          meetingDate: sample.meetingDate,
          meetingTitle: sample.meetingTitle,
          agendaTitle: sample.agendaTitle,
          failureCode,
          warnings: sample.normalized.warnings,
        })),
      )
      .sort((left, right) => (left.agendaTitle ?? "").localeCompare(right.agendaTitle ?? "")),
    confidenceAndVerificationRules: Object.fromEntries(
      Object.keys(distributionByVoteShape).map((bucket) => [
        bucket,
        minutesVotePatternRules[bucket as keyof typeof minutesVotePatternRules],
      ]),
    ),
    persistence,
    samples: samples.map((sample) => ({
      query: sample.query,
      meetingDate: sample.meetingDate,
      meetingTitle: sample.meetingTitle,
      meetingId: sample.meetingId,
      agendaId: sample.agendaId,
      agendaTitle: sample.agendaTitle,
      requestUrl: sample.requestUrl,
      extractedVote: sample.extractedVote,
      normalized: sample.normalized,
    })),
  };
};

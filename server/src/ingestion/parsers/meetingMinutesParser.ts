import type { AgendaItemLoaderResponse } from "./agendaItemParser";
import { normalizeWhitespace } from "../../utils/text";

type MeetingOnlineVoting = {
  VotingHTML?: Array<string | null> | null;
  Minutes?: string | null;
};

export type MeetingMinutesNode = {
  EncrId: string | null;
  Title: string | null;
  Minutes: string | null;
  VotingHTML: Array<string | null> | null;
  VotingHTMLs: Array<string | null> | null;
  ChildMinutesLst: MeetingMinutesNode[] | null;
  IsReady: boolean;
  Visibility: number;
  Level: number;
  HyperLinks: unknown[] | null;
  Attachments: unknown[] | null;
  MeetingOnlineVotings: MeetingOnlineVoting[] | null;
  AllVotingApproved: boolean;
  AllVotingNotApproved: boolean;
};

export type MeetingMinutesResponse = {
  RSSFeedLink: string;
  AttendessHtml: string | null;
  MeetingMinutes: MeetingMinutesNode | null;
  LstItemMinutes: MeetingMinutesNode[];
  PrintSettings: unknown;
};

export type FlattenedMeetingMinutesItem = {
  agendaId: string;
  parentAgendaId: string | null;
  level: number;
  title: string;
  minutesHtml: string | null;
  votingHtml: string[];
};

type SyntheticMeetingContext = {
  simbliId: string;
  title: string;
  date: string;
  siteId?: string;
};

const uniq = <T>(values: T[]) => [...new Set(values)];

const toNonEmptyStrings = (values: Array<string | null> | null | undefined) =>
  (values ?? [])
    .map((value) => normalizeWhitespace(value ?? ""))
    .filter(Boolean);

const getMinutesHtml = (item: MeetingMinutesNode) =>
  item.MeetingOnlineVotings?.find((candidate) => normalizeWhitespace(candidate.Minutes ?? ""))?.Minutes ??
  item.Minutes;

const getVotingHtml = (item: MeetingMinutesNode) =>
  uniq([
    ...toNonEmptyStrings(item.VotingHTML),
    ...toNonEmptyStrings(item.VotingHTMLs),
    ...(item.MeetingOnlineVotings ?? []).flatMap((candidate) => toNonEmptyStrings(candidate.VotingHTML)),
  ]);

const flattenMeetingMinutesNode = (
  item: MeetingMinutesNode,
  parentAgendaId: string | null,
  level: number,
): FlattenedMeetingMinutesItem[] => {
  const agendaId = normalizeWhitespace(item.EncrId ?? "");
  const title = normalizeWhitespace(item.Title ?? "");
  const current: FlattenedMeetingMinutesItem[] =
    agendaId && title
      ? [
          {
            agendaId,
            parentAgendaId,
            level,
            title,
            minutesHtml: getMinutesHtml(item),
            votingHtml: getVotingHtml(item),
          },
        ]
      : [];

  const children = (item.ChildMinutesLst ?? []).flatMap((child) =>
    flattenMeetingMinutesNode(child, agendaId || parentAgendaId, level + 1),
  );

  return [...current, ...children];
};

export const parseMeetingMinutesResponse = (text: string) =>
  JSON.parse(text) as MeetingMinutesResponse;

export const flattenMeetingMinutesItems = (response: MeetingMinutesResponse) =>
  response.LstItemMinutes.flatMap((item) => flattenMeetingMinutesNode(item, null, 1));

export const toSyntheticAgendaItemLoaderResponse = (
  meeting: SyntheticMeetingContext,
  item: FlattenedMeetingMinutesItem,
): AgendaItemLoaderResponse => ({
  Id: null,
  MeetingId: Number(meeting.simbliId),
  Meeting: {
    ID: Number(meeting.simbliId),
    Title: meeting.title,
    TitleDateTime: meeting.date,
    IsPublished: true,
    IsMinutesPublished: true,
    Address1: null,
    Address2: null,
    Address3: null,
  },
  SiteId: Number(meeting.siteId ?? "200015"),
  itemDetails: {
    EncrID: item.agendaId,
    EncrParentID: item.parentAgendaId ?? "",
    SelectedTab: 2,
    Title: item.title,
    Sequence: item.title.split(/\s+/)[0] ?? "",
    Level: item.level,
    VisibilityMode: 0,
    IsReady: true,
    IsEditable: false,
    HasStickyNote: false,
    CreatedOn: "",
    CreatedOnTime: "",
    CreatedBy: "",
    ModifiedOn: "",
    ModifiedOnTime: "",
    ModifiedBy: "",
    SiteTimeZoneDate: "CT",
    IsPublicCommentOn: false,
    HasWorkflow: false,
    Deleted: false,
    Operation: 1,
    MinutesTabHighlighted: true,
    ContentTabHighlighted: false,
    ParentItemEffectiveVisibility: 0,
    HasAnyChild: false,
  },
  itemContents: [],
  Minutes: {
    EncrId: item.agendaId,
    Title: item.title,
    Minutes: item.minutesHtml,
    VotingHTML: item.votingHtml,
  },
  PublicComments: [],
  ShowTasks: false,
  Tasks: null,
  UserPermission: {
    UserID: null,
    CanViewActionItem: false,
    CanAccessActionItem: false,
    CanAccessStickyNotes: false,
    CanSeeMinutes: true,
    IsMeetingAdmin: false,
    CanDownloadOffline: false,
    CanViewManagementItems: false,
    CanViewConfidentialItems: false,
    CanAdministerMinutes: false,
    CanAdministerMeetings: false,
    IsSuperUser: false,
    CanAccessThisMeetingType: true,
  },
  ShowMinutes: true,
  SiteName: "Baldwin County Board of Education",
});

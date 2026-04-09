import { normalizeWhitespace } from "../../utils/text";

export type AgendaItemLoaderResponse = {
  Id: number | null;
  MeetingId: number;
  Meeting: {
    ID: number;
    Title?: string;
    TitleDateTime?: string;
    IsPublished?: boolean;
    IsMinutesPublished?: boolean;
    Address1?: string | null;
    Address2?: string | null;
    Address3?: string | null;
  };
  SiteId: number;
  itemDetails: {
    EncrID: string;
    EncrParentID: string;
    SelectedTab: number;
    Title: string;
    Sequence: string;
    Level: number;
    VisibilityMode: number;
    IsReady: boolean;
    IsEditable: boolean;
    HasStickyNote: boolean;
    CreatedOn: string;
    CreatedOnTime: string;
    CreatedBy: string;
    ModifiedOn: string;
    ModifiedOnTime: string;
    ModifiedBy: string;
    SiteTimeZoneDate: string;
    IsPublicCommentOn: boolean;
    HasWorkflow: boolean;
    Deleted: boolean;
    Operation: number;
    MinutesTabHighlighted: boolean;
    ContentTabHighlighted: boolean;
    ParentItemEffectiveVisibility: number;
    HasAnyChild: boolean;
  };
  itemContents: Array<{
    FieldName: string;
    FieldTitle: string;
    ControlType: number;
    Content: string;
    Date: string | null;
    IsEdit: boolean;
    HasData?: boolean;
    IsExpanded?: boolean;
    Attachments: Array<{
      AttachmentID: number;
      Title: string;
      FileName: string;
      FileExtension: string;
      FileIcon: string;
      EncrId: string;
      OrigSchoolId: string;
      IsDeleted: boolean;
    }> | null;
    HyperLinks: unknown[] | null;
  }>;
  Minutes: unknown | null;
  PublicComments: unknown[];
  ShowTasks: boolean;
  Tasks: unknown[] | null;
  UserPermission: {
    UserID: string | null;
    CanViewActionItem: boolean;
    CanAccessActionItem: boolean;
    CanAccessStickyNotes: boolean;
    CanSeeMinutes: boolean;
    IsMeetingAdmin: boolean;
    CanDownloadOffline: boolean;
    CanViewManagementItems: boolean;
    CanViewConfidentialItems: boolean;
    CanAdministerMinutes: boolean;
    CanAdministerMeetings: boolean;
    IsSuperUser: boolean;
    CanAccessThisMeetingType: boolean;
  };
  ShowMinutes: boolean;
  SiteName: string;
};

export const parseAgendaItemLoaderResponse = (text: string) =>
  JSON.parse(text) as AgendaItemLoaderResponse;

export type NormalizedAgendaItemContentBlock = {
  fieldName: string;
  fieldTitle: string;
  textPreview: string | null;
  attachmentCount: number;
  attachmentTitles: string[];
};

export type NormalizedAgendaItemProbe = {
  meetingId: number;
  siteId: number;
  meetingTitle: string | null;
  meetingDateText: string | null;
  agendaItemTitle: string;
  agendaItemSequence: string;
  agendaItemLevel: number;
  agendaItemId: string;
  parentAgendaId: string;
  contentBlocks: NormalizedAgendaItemContentBlock[];
  contentFieldNames: string[];
  agendaSectionCandidates: string[];
  motionTextCandidates: string[];
  voteClues: string[];
  minutesPreview: string | null;
  hasMinutesPayload: boolean;
  showMinutes: boolean;
  canSeeMinutes: boolean;
  attachments: Array<{
    attachmentId: number;
    title: string;
    fileName: string;
    fileExtension: string;
  }>;
  publicCommentsCount: number;
  showTasks: boolean;
};

const stripHtml = (value?: string | null) =>
  normalizeWhitespace((value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " "));

const toPreview = (value?: string | null, maxLength = 280) => {
  const normalized = stripHtml(value);
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const asText = (value: unknown) => {
  if (typeof value === "string") return stripHtml(value);
  if (value === null || value === undefined) return "";
  return stripHtml(JSON.stringify(value));
};

const motionPattern = /\b(motion|moved|move to|second|approve|adopt|recommendation|resolution)\b/i;
const votePattern = /\b(vote|voting|yes|no|nay|aye|passed|failed|carried|adopted|approved|unanimous)\b/i;

export const normalizeAgendaItemLoaderResponse = (
  response: AgendaItemLoaderResponse,
): NormalizedAgendaItemProbe => {
  const contentBlocks = response.itemContents.map((item) => {
    const textPreview = toPreview(item.Content);
    const attachments = item.Attachments ?? [];
    return {
      fieldName: normalizeWhitespace(item.FieldName),
      fieldTitle: normalizeWhitespace(item.FieldTitle),
      textPreview,
      attachmentCount: attachments.length,
      attachmentTitles: attachments.map((attachment) => normalizeWhitespace(attachment.Title || attachment.FileName)),
    };
  });

  const attachments = response.itemContents.flatMap((item) =>
    (item.Attachments ?? []).map((attachment) => ({
      attachmentId: attachment.AttachmentID,
      title: normalizeWhitespace(attachment.Title),
      fileName: normalizeWhitespace(attachment.FileName),
      fileExtension: normalizeWhitespace(attachment.FileExtension),
    })),
  );

  const textSources = [
    normalizeWhitespace(response.itemDetails.Title),
    ...contentBlocks.flatMap((block) => [block.fieldName, block.fieldTitle, block.textPreview ?? ""]),
    asText(response.Minutes),
  ].filter(Boolean);

  const motionTextCandidates = [...new Set(textSources.filter((value) => motionPattern.test(value)))];
  const voteClues = [...new Set(textSources.filter((value) => votePattern.test(value)))];
  const agendaSectionCandidates = [
    ...new Set(
      contentBlocks
        .flatMap((block) => [block.fieldTitle, block.fieldName])
        .filter((value) => Boolean(value) && !/^content$/i.test(value)),
    ),
  ];
  const minutesPreview = toPreview(asText(response.Minutes));

  return {
    meetingId: response.MeetingId,
    siteId: response.SiteId,
    meetingTitle: response.Meeting?.Title ? normalizeWhitespace(response.Meeting.Title) : null,
    meetingDateText: response.Meeting?.TitleDateTime ? normalizeWhitespace(response.Meeting.TitleDateTime) : null,
    agendaItemTitle: normalizeWhitespace(response.itemDetails.Title),
    agendaItemSequence: normalizeWhitespace(response.itemDetails.Sequence),
    agendaItemLevel: response.itemDetails.Level,
    agendaItemId: response.itemDetails.EncrID,
    parentAgendaId: response.itemDetails.EncrParentID,
    contentBlocks,
    contentFieldNames: contentBlocks.map((block) => block.fieldName),
    agendaSectionCandidates,
    motionTextCandidates,
    voteClues,
    minutesPreview,
    hasMinutesPayload: Boolean(asText(response.Minutes)),
    showMinutes: response.ShowMinutes,
    canSeeMinutes: response.UserPermission.CanSeeMinutes,
    attachments,
    publicCommentsCount: response.PublicComments.length,
    showTasks: response.ShowTasks,
  };
};

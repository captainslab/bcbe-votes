export type SearchMeetingModuleRow = {
  UniqueId: string;
  MeetingId: string;
  MeetingDate: string;
  MeetingTitle: string;
  AgendaId: string;
  AgendaTitle: string | null;
  MeetingTypeId: string;
  MeetingTypeName: string;
  SiteId: number;
  EnSiteId: string;
  State: string;
  Industry: string | null;
  OrganizationName: string;
  SourceType: string;
  RowType: string | null;
  Count: number;
  Index: number;
  ParentIndex: number;
  Expanded: boolean;
  Show: boolean;
  ExistInAgenda: boolean;
  ExistInMinutes: boolean;
  ExistInPublicComments: boolean;
  MeetingStatus: string;
  Population: number;
  RegionId: number;
  Region: string;
};

export type SearchMeetingModuleResponse = {
  meetingSearchResponseDTOs: SearchMeetingModuleRow[];
};

export type SearchedMeetingDataMeetingRow = {
  Id: number;
  Name: string;
  SiteId: number;
  EnSiteId: string;
  MtId: number;
  AId: string;
  IsSelected: boolean;
  ExistInMinutes: boolean;
  ExistInAgenda: boolean;
};

export type SearchedMeetingTypeRow = {
  Id: number;
  Name: string;
  SiteId: number;
  EnSiteId: string | null;
  MtId: number;
  AId: string | null;
  IsSelected: boolean;
  ExistInMinutes: boolean;
  ExistInAgenda: boolean;
};

export type SearchedMeetingDataResponse = {
  NextItem: {
    SiteId: number;
    EnSiteId: string;
    AgendaId: string;
    Title: string;
    SiteName: string;
    MeetingTitle: string;
    OtherSite: boolean;
    ExistInAgenda: boolean;
    ExistInMinutes: boolean;
    StateId: number | null;
    MeetingId: number;
    MeetingTypeId: number;
  };
  PreviousItem: {
    SiteId: number;
    EnSiteId: string;
    AgendaId: string;
    Title: string;
    SiteName: string;
    MeetingTitle: string;
    OtherSite: boolean;
    ExistInAgenda: boolean;
    ExistInMinutes: boolean;
    StateId: number | null;
    MeetingId: number;
    MeetingTypeId: number;
  };
  MeetingTypeList: SearchedMeetingTypeRow[];
  MeetingList: SearchedMeetingDataMeetingRow[];
};

export const parseSearchMeetingModuleResponse = (text: string) =>
  JSON.parse(text) as SearchMeetingModuleResponse;

export const parseSearchedMeetingDataResponse = (text: string) =>
  JSON.parse(text) as SearchedMeetingDataResponse;

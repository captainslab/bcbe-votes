import type { CanonicalBoardMemberName } from "./boardVotes";

export type MemberProfile = {
  canonicalName: CanonicalBoardMemberName;
  district: string | null;
  roleTitle: string | null;
  officialProfileUrl: string | null;
  officialContactUrl: string | null;
  officialContactEmail: string | null;
  officialPhone: string | null;
  termStart: number | null;
  termEnd: number | null;
  districtDescription: string[] | null;
  committees: string[] | null;
  profileSourceUrls: string[];
  profileVerificationStatus: "verified" | "needs_review";
  profileLastReviewedAt: string | null;
};

const PROFILE_SOURCE_URL = "https://www.bcbe.org/board-of-education/bcbe-board-members";
const PROFILE_LAST_REVIEWED_AT = "2026-05-01T20:00:00.000Z";

const sourcedMemberProfiles: Record<CanonicalBoardMemberName, Omit<MemberProfile, "canonicalName">> = {
  "Ken Bradley": {
    district: "District 1",
    roleTitle: null,
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:bradley4baldwin1@gmail.com",
    officialContactEmail: "bradley4baldwin1@gmail.com",
    officialPhone: "251-406-8258",
    termStart: 2024,
    termEnd: 2030,
    districtDescription: [
      "Bay Minette Elementary",
      "Bay Minette Middle",
      "Baldwin County High",
      "Delta Elementary",
      "Perdido School",
      "Pine Grove Elementary",
      "Stapleton School",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
  "Andrea Lindsey": {
    district: "District 2",
    roleTitle: null,
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:larryandrea@hotmail.com",
    officialContactEmail: "larryandrea@hotmail.com",
    officialPhone: "251-586-4274",
    termStart: 2024,
    termEnd: 2030,
    districtDescription: [
      "Daphne East Elementary",
      "Daphne Elementary",
      "Daphne Middle",
      "Daphne High",
      "W.J. Carroll Intermediate",
      "Baldwin County Virtual School",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
  "Tony Myrick": {
    district: "District 3",
    roleTitle: "Board President",
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:myrick_78@hotmail.com",
    officialContactEmail: "myrick_78@hotmail.com",
    officialPhone: null,
    termStart: 2020,
    termEnd: 2026,
    districtDescription: [
      "Robertsdale Elementary",
      "Central Baldwin Middle",
      "Robertsdale High",
      "Elsanor Elementary",
      "Rosinton Elementary",
      "Summerdale School",
      "CF Taylor Alternative Program",
      "Silverhill Elementary",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
  "Rondi Kirby": {
    district: "District 4",
    roleTitle: null,
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:rondikirbydistrict4@gmail.com",
    officialContactEmail: "rondikirbydistrict4@gmail.com",
    officialPhone: null,
    termStart: 2022,
    termEnd: 2028,
    districtDescription: [
      "Foley Elementary",
      "Florence Mathis Elementary",
      "Foley Middle",
      "Foley High",
      "Magnolia School",
      "Swift School",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
  "Jason P. Woerner": {
    district: "District 5",
    roleTitle: null,
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:jwoerner.bcbe@gmail.com",
    officialContactEmail: "jwoerner.bcbe@gmail.com",
    officialPhone: "251-232-0038",
    termStart: 2020,
    termEnd: 2026,
    districtDescription: [
      "Elberta Elementary",
      "Elberta High",
      "Elberta Middle",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
  "Cecil Christenberry": {
    district: "District 6",
    roleTitle: null,
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:cecilchristenberry@gmail.com",
    officialContactEmail: "cecilchristenberry@gmail.com",
    officialPhone: null,
    termStart: 2020,
    termEnd: 2026,
    districtDescription: [
      "Fairhope East Elementary",
      "Fairhope West Elementary",
      "Fairhope Midlde",
      "Fairhope High",
      "J. Larry Newton",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
  "April Bradley": {
    district: "District 7",
    roleTitle: "Board Vice President",
    officialProfileUrl: PROFILE_SOURCE_URL,
    officialContactUrl: "mailto:bradleyapril@bellsouth.net",
    officialContactEmail: "bradleyapril@bellsouth.net",
    officialPhone: null,
    termStart: 2022,
    termEnd: 2028,
    districtDescription: [
      "Rockwell Elementary",
      "Spanish Fort Elementary",
      "Stonebridge Elementary",
      "Spanish Fort Middle",
      "Spanish Fort High",
      "Loxley Elementary",
      "Belforest Elementary",
    ],
    committees: null,
    profileSourceUrls: [PROFILE_SOURCE_URL],
    profileVerificationStatus: "verified",
    profileLastReviewedAt: PROFILE_LAST_REVIEWED_AT,
  },
};

export const getSourcedMemberProfile = (canonicalName: CanonicalBoardMemberName): MemberProfile => ({
  canonicalName,
  ...sourcedMemberProfiles[canonicalName],
});

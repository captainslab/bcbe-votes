import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemberNoVoteItems,
  buildSourceAuditInfo,
  categorizeVoteItemText,
  getCanonicalBoardMemberName,
  sanitizePublicVoteDisplayText,
} from "../utils/boardVotes";

test("categorizes personnel votes from sourced motion text", () => {
  const result = categorizeVoteItemText({
    itemTitle: "Personnel Report",
    motionText: "Approve the personnel recommendations as presented.",
  });

  assert.equal(result.category, "Personnel");
  assert.ok(result.categoryConfidence >= 0.8);
});

test("categorizes budget votes from sourced item text", () => {
  const result = categorizeVoteItemText({
    itemTitle: "Amendment to FY26 budget",
    sourceExcerpt: "The board approved the budget transfer and appropriation.",
  });

  assert.equal(result.category, "Budget / Finance");
  assert.ok(result.categoryConfidence >= 0.8);
});

test("categorizes contracts/procurement votes from sourced item text", () => {
  const result = categorizeVoteItemText({
    itemTitle: "RFP for district copier services",
    motionText: "Approve contract award to the selected vendor.",
  });

  assert.equal(result.category, "Contracts / Procurement");
  assert.ok(result.categoryConfidence >= 0.8);
});

test("categorizes facilities/construction votes from sourced text", () => {
  const result = categorizeVoteItemText({
    itemTitle: "Capital improvement at Bay Minette campus",
    summaryText: "Board approved renovation work for the media center building.",
  });

  assert.equal(result.category, "Facilities / Construction");
  assert.ok(result.categoryConfidence >= 0.8);
});

test("categorizes policy/governance votes from sourced text", () => {
  const result = categorizeVoteItemText({
    itemTitle: "Board policy revision",
    sourceExcerpt: "Resolution adopting updates to policy manual.",
  });

  assert.equal(result.category, "Policy / Governance");
  assert.ok(result.categoryConfidence >= 0.8);
});

test("returns Needs review when the source text is too generic", () => {
  const result = categorizeVoteItemText({
    itemTitle: "Item 7",
    motionText: "Approved.",
  });

  assert.equal(result.category, "Needs review");
  assert.ok(result.categoryConfidence <= 0.5);
});

test("returns Needs review for parser-artifact text even if it contains category words", () => {
  const result = categorizeVoteItemText({
    itemTitle: "Budget transfer",
    sourceExcerpt: "Motion made by Tony Myrick. Voting: Tony Myrick - Yes Andrea Lindsey - Yes",
  });

  assert.equal(result.category, "Needs review");
  assert.ok(result.categoryConfidence <= 0.2);
});

test("rejects non-board names and parser artifacts", () => {
  assert.equal(getCanonicalBoardMemberName("Mike Johnson"), null);
  assert.equal(getCanonicalBoardMemberName("Motion seconded by Andrea Lindsey"), null);
  assert.equal(getCanonicalBoardMemberName("UNANIMOUSLY APPROVED"), null);
  assert.equal(getCanonicalBoardMemberName("Mrs. April Bradley"), "April Bradley");
  assert.equal(getCanonicalBoardMemberName("Kenneth Bradley"), "Ken Bradley");
});

test("builds member no-vote items from real no votes only", () => {
  const items = buildMemberNoVoteItems("April Bradley", [
    {
      voteItemId: 11,
      meetingId: 101,
      meetingDate: "2026-04-01T00:00:00.000Z",
      meetingTitle: "Regular Board Meeting",
      meetingType: "Regular Meeting",
      sourceUrl: "https://example.com/meeting/101",
      itemTitle: "Approve technology purchase",
      motionText: "Move to approve the technology purchase.",
      summaryText: "Technology purchase approved.",
      result: "Approved",
      verificationStatus: "verified",
      confidenceScore: 0.91,
      sourceExcerpt: "April Bradley voted no.",
      category: "Technology",
      categoryConfidence: 0.92,
      voteRecords: [
        { boardMember: { name: "April Bradley" }, voteValue: "no" },
        { boardMember: { name: "Tony Myrick" }, voteValue: "yes" },
      ],
    },
    {
      voteItemId: 12,
      meetingId: 102,
      meetingDate: "2026-04-15T00:00:00.000Z",
      meetingTitle: "Regular Board Meeting",
      meetingType: "Regular Meeting",
      sourceUrl: null,
      itemTitle: "Approve field trip",
      motionText: "Motion to approve the field trip.",
      summaryText: null,
      result: "Approved",
      verificationStatus: "needs_review",
      confidenceScore: 0.44,
      sourceExcerpt: null,
      category: "Needs review",
      categoryConfidence: 0.4,
      voteRecords: [
        { boardMember: { name: "April Bradley" }, voteValue: "yes" },
      ],
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.itemTitle, "Approve technology purchase");
  assert.equal(items[0]?.memberVote, "No");
  assert.equal(items[0]?.sourceAvailability, "available");
  assert.equal(items[0]?.sourceUrl, "https://example.com/meeting/101");
});

test("sanitizes public vote display fields without mutating raw stored text", () => {
  assert.equal(
    sanitizePublicVoteDisplayText(
      "Motion made by: Andrea Lindsey Motion seconded by: Kenneth Bradley Voting: Tony Myrick - Yes Jason Woerner - No",
    ),
    "Needs review",
  );
  assert.equal(sanitizePublicVoteDisplayText("Voting: Unanimously Approved a."), "Needs review");
  assert.equal(
    sanitizePublicVoteDisplayText(
      "The superintendent recommends adoption of the revised Board Policy Manual. Motion seconded by: Andrea Lindsey Voting: Tony Myrick - No",
    ),
    "The superintendent recommends adoption of the revised Board Policy Manual.",
  );
  assert.equal(
    sanitizePublicVoteDisplayText("Budget amendment approved for FY 2026."),
    "Budget amendment approved for FY 2026.",
  );
});

test("sanitizes no-vote display fields before returning member detail items", () => {
  const items = buildMemberNoVoteItems("Tony Myrick", [
    {
      voteItemId: 13,
      meetingId: 103,
      meetingDate: "2026-04-20T00:00:00.000Z",
      meetingTitle: "Regular Board Meeting",
      meetingType: "Regular Meeting",
      sourceUrl: "https://example.com/meeting/103",
      itemTitle: "Revised policy manual",
      motionText:
        "Motion made by: Tony Myrick Motion seconded by: Andrea Lindsey Voting: Tony Myrick - No Andrea Lindsey - Yes Mike Johnson - Yes",
      summaryText: "ACTION AGENDA",
      result: "Mrs. April Bradley and Mrs. Rondi Kirby. Unanimously Approved.",
      verificationStatus: "verified",
      confidenceScore: 0.83,
      sourceExcerpt:
        'The superintendent recommends adoption of a motion "to approve the revised Board Policy Manual as stipulated in the agenda exhibit." Motion made by: Cecil Christenberry Motion seconded by: Andrea Lindsey Yes: Mike Johnson Yes: Andrea Lindsey No: Tony Myrick No: Rondi Kirby',
      category: "Policy / Governance",
      categoryConfidence: 0.9,
      voteRecords: [
        { boardMember: { name: "Tony Myrick" }, voteValue: "no" },
        { boardMember: { name: "Andrea Lindsey" }, voteValue: "yes" },
      ],
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.motionText, "Needs review");
  assert.equal(items[0]?.summaryText, "Needs review");
  assert.equal(items[0]?.overallOutcome, "Needs review");
  assert.match(items[0]?.sourceExcerpt ?? "", /revised Board Policy Manual/i);
  assert.doesNotMatch(
    items[0]?.sourceExcerpt ?? "",
    /Motion seconded by|Voting:|Mike Johnson|Mrs\.?|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS/i,
  );
  assert.equal(items[0]?.sourceUrl, "https://example.com/meeting/103");
  assert.equal(items[0]?.verificationStatus, "verified");
  assert.equal(items[0]?.category, "Policy / Governance");
});

test("marks missing source links as unavailable", () => {
  const source = buildSourceAuditInfo(null);

  assert.equal(source.sourceAvailability, "unavailable");
  assert.equal(source.sourceLabel, "Source unavailable");
});

test("handles null/undefined fields gracefully", () => {
  const items = buildMemberNoVoteItems("Tony Myrick", [
    {
      voteItemId: 99,
      meetingId: 99,
      meetingDate: "2026-04-20T00:00:00.000Z",
      meetingTitle: null,
      meetingType: null,
      sourceUrl: null,
      itemTitle: null,
      motionText: null,
      summaryText: null,
      result: null,
      verificationStatus: "needs_review",
      confidenceScore: null,
      sourceExcerpt: null,
      category: "Needs review",
      categoryConfidence: 0.1,
      voteRecords: [
        { boardMember: { name: "Tony Myrick" }, voteValue: "no" },
      ],
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.motionText, "Needs review");
  assert.equal(items[0]?.summaryText, "Needs review");
  assert.equal(items[0]?.overallOutcome, "Needs review");
  assert.equal(items[0]?.sourceExcerpt, "Needs review");
  assert.equal(items[0]?.meetingTitle, "Needs review");
  assert.equal(items[0]?.itemTitle, "Needs review");
});

test("sanitizes all parser artifact patterns in noVoteItems", () => {
  const items = buildMemberNoVoteItems("April Bradley", [
    {
      voteItemId: 88,
      meetingId: 88,
      meetingDate: "2026-04-20T00:00:00.000Z",
      meetingTitle: "Test Meeting",
      meetingType: "Regular Meeting",
      sourceUrl: "https://example.com/meeting/88",
      itemTitle: "Test item",
      motionText: "Mrs. April Bradley made a motion",
      summaryText: "Motion seconded by Mike Johnson",
      result: "Voting: Yes - April Bradley",
      verificationStatus: "needs_review",
      confidenceScore: 0.5,
      sourceExcerpt: "Mr. Myrick called for the vote. All voiced approval.",
      category: "Needs review",
      categoryConfidence: 0.1,
      voteRecords: [{ boardMember: { name: "April Bradley" }, voteValue: "no" }],
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.motionText, "Needs review");
  assert.equal(items[0]?.summaryText, "Needs review");
  assert.equal(items[0]?.overallOutcome, "Needs review");
  // sourceExcerpt is truncated at "All voiced approval" parser artifact
  assert.equal(items[0]?.sourceExcerpt, "Mr. Myrick called for the vote.");
  assert.doesNotMatch(
    items[0]?.sourceExcerpt ?? "",
    /Motion seconded by|Voting:|Mike Johnson|Mrs\\.?|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS/i,
  );
});

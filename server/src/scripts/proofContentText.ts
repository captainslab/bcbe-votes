/**
 * Proof script: verifies contentText extraction pipeline without requiring a live browser.
 *
 * Steps:
 * 1. Build a synthetic AgendaItemLoaderResponse with realistic personnel HTML in itemContents
 * 2. Call buildPersistedMinutesVoteOutput — assert contentText is extracted
 * 3. DB UPDATE one existing vote item with the extracted contentText
 * 4. Query back to confirm the write
 * 5. Print a search simulation over the stored value
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { AgendaItemLoaderResponse } from "../ingestion/parsers/agendaItemParser";
import { buildPersistedMinutesVoteOutput } from "../services/minutesVoteService";

const PROOF_VOTE_ITEM_ID = 571; // APPROVAL OF MINUTES, meeting 8 (2025-12-11 Regular)

const syntheticPersonnelHtml = `
<table>
  <thead><tr><th>Name</th><th>Classification</th><th>School/Position</th><th>Replacing</th><th>Effective Date</th></tr></thead>
  <tbody>
    <tr>
      <td>Aaron Kilgore</td>
      <td>Classified</td>
      <td>EBAE/Custodian 12 month</td>
      <td>Amber Clark</td>
      <td>04/08/2026</td>
    </tr>
    <tr>
      <td>Maria Sanchez</td>
      <td>Certified</td>
      <td>Bay Minette Elementary/2nd Grade Teacher</td>
      <td>New Position</td>
      <td>08/01/2026</td>
    </tr>
  </tbody>
</table>
<p>Recommendation: The superintendent recommends approval of the assignments listed above.</p>
`;

const buildSyntheticResponse = (): AgendaItemLoaderResponse => ({
  Id: null,
  MeetingId: 27255,
  Meeting: {
    ID: 27255,
    Title: "Regular Board Meeting",
    TitleDateTime: "December 11, 2025",
    IsPublished: true,
    IsMinutesPublished: true,
    Address1: null,
    Address2: null,
    Address3: null,
  },
  SiteId: 200015,
  itemDetails: {
    EncrID: "proof-item-001",
    EncrParentID: "proof-parent-001",
    SelectedTab: 2,
    Title: "APPOINTMENTS/ASSIGNMENTS - CLASSIFIED PERSONNEL",
    Sequence: "6.1",
    Level: 2,
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
  itemContents: [
    {
      FieldName: "content",
      FieldTitle: "Agenda Content",
      ControlType: 1,
      Content: syntheticPersonnelHtml,
      Date: null,
      IsEdit: false,
      HasData: true,
      IsExpanded: true,
      Attachments: [],
      HyperLinks: null,
    },
    {
      FieldName: "recommendation",
      FieldTitle: "Superintendent Recommendation",
      ControlType: 1,
      Content: "<p>The superintendent recommends adoption of a motion to approve the classified personnel assignments. Aaron Kilgore, EBAE/Custodian 12 month, replacing Amber Clark, effective 04/08/2026.</p>",
      Date: null,
      IsEdit: false,
      HasData: true,
      IsExpanded: true,
      Attachments: [],
      HyperLinks: null,
    },
  ],
  Minutes: {
    EncrId: "proof-item-001",
    Title: "APPOINTMENTS/ASSIGNMENTS - CLASSIFIED PERSONNEL",
    Minutes: "<p>Motion was made by Board Member A to approve the classified personnel assignments. Seconded by Board Member B. Vote: Yes - 7, No - 0. Motion carried unanimously.</p>",
    VotingHTML: ["<p>Yes: 7 No: 0 Abstain: 0</p>"],
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

const searchSimulation = (contentText: string, terms: string[]) => {
  const lower = contentText.toLowerCase();
  return terms.map((term) => ({
    term,
    found: lower.includes(term.toLowerCase()),
  }));
};

const main = async () => {
  console.log("=== contentText Pipeline Proof ===\n");

  // Step 1: Extract via buildPersistedMinutesVoteOutput
  console.log("Step 1: Extract contentText from synthetic AgendaItemLoaderResponse");
  const response = buildSyntheticResponse();
  const output = buildPersistedMinutesVoteOutput(response);
  const { contentText } = output.voteItem;

  if (!contentText) {
    console.error("FAIL: contentText is null — extraction did not fire");
    process.exitCode = 1;
    return;
  }
  console.log(`  ✓ contentText extracted (${contentText.length} chars)`);
  console.log(`  Preview: "${contentText.slice(0, 200)}"\n`);

  // Step 2: DB state before
  const before = await db.query.voteItems.findFirst({
    where: eq(schema.voteItems.id, PROOF_VOTE_ITEM_ID),
    columns: { id: true, itemTitle: true, contentText: true },
  });
  console.log(`Step 2: DB state before UPDATE (vote_item id=${PROOF_VOTE_ITEM_ID})`);
  console.log(`  itemTitle: "${before?.itemTitle}"`);
  console.log(`  content_text IS NULL: ${before?.contentText == null}\n`);

  // Step 3: DB UPDATE
  console.log("Step 3: UPDATE vote_item.content_text");
  await db
    .update(schema.voteItems)
    .set({ contentText })
    .where(eq(schema.voteItems.id, PROOF_VOTE_ITEM_ID));
  console.log("  ✓ UPDATE executed\n");

  // Step 4: DB state after
  const after = await db.query.voteItems.findFirst({
    where: eq(schema.voteItems.id, PROOF_VOTE_ITEM_ID),
    columns: { id: true, itemTitle: true, contentText: true },
  });
  console.log("Step 4: DB state after UPDATE");
  console.log(`  content_text IS NULL: ${after?.contentText == null}`);
  console.log(`  content_text length: ${after?.contentText?.length ?? 0}`);
  console.log(`  Stored snippet: "${after?.contentText?.slice(0, 150)}"\n`);

  // Step 5: Search simulation
  console.log("Step 5: Search simulation over stored contentText");
  const searchTerms = ["custodian", "Kilgore", "04/08/2026", "Amber Clark", "mental health", "teacher"];
  const results = searchSimulation(after?.contentText ?? "", searchTerms);
  results.forEach(({ term, found }) => {
    console.log(`  "${term}": ${found ? "✓ FOUND" : "✗ not found"}`);
  });

  const allExpectedFound = results.slice(0, 4).every((r) => r.found);
  const notPresentCorrectlyMissing = !results[4]?.found;

  console.log(`\nSearch proof: expected terms found=${allExpectedFound}, absent term correctly missing=${notPresentCorrectlyMissing}`);

  if (allExpectedFound && notPresentCorrectlyMissing) {
    console.log("\n=== PASS ===");
  } else {
    console.log("\n=== FAIL ===");
    process.exitCode = 1;
  }
};

main()
  .catch((err) => {
    console.error("Script error:", err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));

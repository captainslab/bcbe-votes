---
name: import
description: |
  Run the full bcbe-votes vote import pipeline. Use when the user wants to import meetings, sync votes, run entity extraction, or refresh imported data. Covers: meeting listing fetch, detail import, board member alias normalization, and parallel LLM entity extraction for personnel and property actions. Pass a Simbli meeting ID to target one meeting, or leave blank for a full batch run.
argument-hint: "[simbli-meeting-id]"
allowed-tools:
  - Bash(cd *)
  - Bash(npm run *)
  - Bash(curl *)
  - Agent
---

# bcbe-votes Import Pipeline

**Target:** $ARGUMENTS *(blank = full batch run; a Simbli meeting ID = single-meeting run)*

All commands run from `/home/jordan/Projects/bcbe-votes/server`. The server must have `DATABASE_URL` in its environment (`.env` is loaded automatically by the scripts).

---

## Step 1 — Fetch meeting listing
*Skip this step for single-meeting runs.*

```bash
cd /home/jordan/Projects/bcbe-votes/server && npm run import:meetings
```

Upserts the meeting listing from Simbli. Sets `ingestionStatus = "partial"` for new meetings. Safe to rerun.

---

## Step 2 — Import meeting details and vote items

**Single meeting:**
```bash
curl -s -u "$ADMIN_BASIC_USER:$ADMIN_BASIC_PASS" \
  -X POST http://localhost:4100/admin/import-meeting/$ARGUMENTS
```

**Full batch:**
```bash
curl -s -u "$ADMIN_BASIC_USER:$ADMIN_BASIC_PASS" \
  -X POST http://localhost:4100/admin/batch-detail-import
```

This fetches vote items and vote records for each meeting, resolves board member names, and writes to `vote_items` and `vote_records`. Idempotent via upsert.

---

## Step 3 — Normalize board member aliases

```bash
cd /home/jordan/Projects/bcbe-votes/server && npm run normalize:member-aliases
```

Merges duplicate board member rows created by name spelling variants. Reassigns `vote_records`, `motionMadeByMemberId`, and `motionSecondedByMemberId` to the canonical member, then deletes the duplicates. Run after every import.

---

## Step 4 — Entity extraction *(FAN OUT — deploy both agents in one parallel call)*

**When this step is reached, spawn exactly two agents simultaneously in a single message — do not run them sequentially.**

- **Agent A — Personnel entities:**
  ```bash
  cd /home/jordan/Projects/bcbe-votes/server && npm run extract:personnel-entities
  ```
  Extracts `{personName, actionType, position, school, effectiveDate}` from Personnel/HR vote items via GPT-4o-mini. Only processes rows where `personnelEntities IS NULL`. Idempotent.

- **Agent B — Property entities:**
  ```bash
  cd /home/jordan/Projects/bcbe-votes/server && npm run extract:property-entities
  ```
  Extracts `{actionType, partyName, location, address, statedUse, term}` from Facilities & Property vote items via GPT-4o-mini. Only processes rows where `propertyEntities IS NULL`. Idempotent.

Wait for both agents to complete before continuing.

*If `OPENROUTER_API_KEY` is not set, both scripts will skip silently — note this in the summary.*

---

## Step 5 — Verify

```bash
curl -s -u "$ADMIN_BASIC_USER:$ADMIN_BASIC_PASS" \
  http://localhost:4100/admin/import-logs | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.slice(0,3).forEach(r=>console.log(JSON.stringify(r,null,2)))"
```

Report back:
- Meetings processed
- Vote items created / updated
- Vote records flagged as low-confidence
- Any `errorSummary` entries
- Whether entity extraction ran or was skipped (no API key)
- Any anomalies: zero votes on a meeting that should have them, board members still unresolved, tally mismatches

---

## Data model reminders

| Table | Key columns written | Trigger |
|---|---|---|
| `meetings` | `ingestionStatus`, `simbliId` | Steps 1–2 |
| `vote_items` | `itemTitle`, `motionText`, `voteTally`, `isNonUnanimous`, `confidence`, `personnelEntities`, `propertyEntities` | Steps 2, 4 |
| `vote_records` | `voteValue`, `boardMemberId`, `voteItemId` | Step 2 |
| `board_members` | `name`, `aliases` | Steps 2–3 |
| `import_logs` | `completedAt`, `votesCreated`, `errorSummary` | Step 2 |

Analytics (`/api/stats`, `/api/alliances`, `/api/members`) are computed on-demand — no cache to bust after import.

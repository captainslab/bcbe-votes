const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:4000/api";

const canonicalMembers = [
  "Ken Bradley",
  "Andrea Lindsey",
  "Tony Myrick",
  "Rondi Kirby",
  "Jason P. Woerner",
  "Cecil Christenberry",
  "April Bradley",
] as const;

const leakPattern =
  /(^|\b)(Mike Johnson|Voting:|Motion seconded by|Unanimously Approved|ACTION AGENDA|SUPERINTENDENT RECOMMENDATIONS|Mrs\.?|Ms\.?|Mr\.?|Miss|Dr\.?)(\b|$)/i;

type MemberStat = {
  memberId: number;
  name: string;
};

type Alliance = {
  memberAId: number;
  memberBId: number;
};

type MemberDetail = {
  id: number;
  name: string;
  stats?: Record<string, unknown> | null;
  noVoteItems?: Array<Record<string, unknown>> | null;
};

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const fieldsToScan = [
  "itemTitle",
  "motionText",
  "summaryText",
  "sourceExcerpt",
  "overallOutcome",
  "meetingTitle",
  "meetingType",
] as const;

const main = async () => {
  const members = await getJson<MemberStat[]>("/members");
  const alliances = await getJson<Alliance[]>("/alliances");

  const names = Array.from(new Set(members.map((member) => member.name))).sort();
  const extras = names.filter((name) => !canonicalMembers.includes(name as (typeof canonicalMembers)[number]));
  const memberNameLeaks = names.filter((name) => leakPattern.test(name));

  const memberNameById = new Map<number, string>(members.map((member) => [member.memberId, member.name]));

  const orphanPairs = alliances.filter(
    (pair) => !memberNameById.has(pair.memberAId) || !memberNameById.has(pair.memberBId),
  );

  const nonCanonicalPairs = alliances.filter((pair) => {
    const memberA = memberNameById.get(pair.memberAId);
    const memberB = memberNameById.get(pair.memberBId);
    return !memberA || !memberB || !canonicalMembers.includes(memberA as (typeof canonicalMembers)[number]) || !canonicalMembers.includes(memberB as (typeof canonicalMembers)[number]);
  });

  const memberDetailShape = [] as Array<{
    memberId: number;
    name: string;
    hasProfileBasics: boolean;
    hasStats: boolean;
    hasNoVoteItemsArray: boolean;
    noVoteItemsCount: number;
  }>;

  const noVoteItemLeaks = [] as Array<{
    memberId: number;
    memberName: string;
    noVoteItemIndex: number;
    field: string;
    value: string;
  }>;

  for (const member of members) {
    const detail = await getJson<MemberDetail>(`/members/${member.memberId}`);
    const noVoteItems = Array.isArray(detail.noVoteItems) ? detail.noVoteItems : [];

    memberDetailShape.push({
      memberId: member.memberId,
      name: member.name,
      hasProfileBasics: typeof detail.id === "number" && typeof detail.name === "string",
      hasStats: Boolean(detail.stats && typeof detail.stats === "object"),
      hasNoVoteItemsArray: Array.isArray(detail.noVoteItems),
      noVoteItemsCount: noVoteItems.length,
    });

    noVoteItems.forEach((item, index) => {
      fieldsToScan.forEach((field) => {
        const value = item[field];
        if (typeof value === "string" && leakPattern.test(value)) {
          noVoteItemLeaks.push({
            memberId: member.memberId,
            memberName: member.name,
            noVoteItemIndex: index,
            field,
            value: value.slice(0, 240),
          });
        }
      });
    });
  }

  const membersWithNoVoteItems = memberDetailShape.filter((entry) => entry.noVoteItemsCount > 0);

  console.log(
    JSON.stringify(
      {
        canonicalMemberCount: names.length,
        canonicalNames: names,
        extras,
        memberNameLeakCount: memberNameLeaks.length,
        memberNameLeaks,
        orphanPairs: orphanPairs.length,
        nonCanonicalPairs: nonCanonicalPairs.length,
        memberDetailShape,
        memberDetailsComplete: memberDetailShape.every(
          (entry) => entry.hasProfileBasics && entry.hasStats && entry.hasNoVoteItemsArray,
        ),
        membersWithNoVoteItemsCount: membersWithNoVoteItems.length,
        membersWithNoVoteItems,
        leakCount: noVoteItemLeaks.length,
        noVoteItemLeaks,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { voteValueEnum } from "../db/schema";

const voteMap: Record<string, typeof voteValueEnum.enumValues[number]> = {
  yes: "yes",
  y: "yes",
  approve: "yes",
  approved: "yes",
  no: "no",
  nay: "no",
  oppose: "no",
  opposed: "no",
  abstain: "abstain",
  abstained: "abstain",
  recused: "recused",
  recuse: "recused",
  absent: "absent",
  "not present": "absent",
};

export const normalizeVoteValue = (raw: string) => {
  const key = raw.toLowerCase().trim();
  return (voteMap[key] ?? "abstain") as typeof voteValueEnum.enumValues[number];
};

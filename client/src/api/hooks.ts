import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { CategoryStat, Meeting, MemberCategoryStat, MemberNoVoteItem, MemberProfile, MemberStat, PairwiseAlignment, SummaryStats, VoteItem } from "../types";

export const useSummary = () =>
  useQuery({
    queryKey: ["summary"],
    queryFn: async () => {
      const res = await api.get<{ summary: SummaryStats; recentVotes: VoteItem[]; categoryStats: CategoryStat[] }>("/stats");
      return res.data;
    },
  });

export const useMeetings = () =>
  useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await api.get<Meeting[]>("/meetings", { params: { limit: 200 } });
      return res.data;
    },
  });

export const useMeeting = (id?: string | number) =>
  useQuery({
    queryKey: ["meeting", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<Meeting & { voteItems: VoteItem[] }>(`/meetings/${id}`);
      return res.data;
    },
  });

export const useVotes = (nonUnanimousOnly = true) =>
  useQuery({
    queryKey: ["votes", nonUnanimousOnly],
    queryFn: async () => {
      const res = await api.get<VoteItem[]>(`/votes`, { params: { nonUnanimousOnly, limit: 200 } });
      return res.data;
    },
  });

export const useVote = (id?: string | number) =>
  useQuery({
    queryKey: ["vote", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<VoteItem>(`/votes/${id}`);
      return res.data;
    },
  });

export const useMembers = () =>
  useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const res = await api.get<MemberStat[]>("/members");
      return res.data;
    },
  });

type MemberDetailResponse = {
  id: number;
  name: string;
  district?: string;
  profile?: MemberProfile;
  stats?: MemberStat;
  noVoteItems?: MemberNoVoteItem[];
  categoryStats?: MemberCategoryStat[];
};

export const useMember = (id?: string | number) =>
  useQuery({
    queryKey: ["member", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<MemberDetailResponse>(`/members/${id}`);
      return res.data;
    },
  });

export const useAlignment = () =>
  useQuery({
    queryKey: ["alliances"],
    queryFn: async () => {
      const res = await api.get<PairwiseAlignment[]>("/alliances");
      return res.data;
    },
  });

export const useMemberAlignment = (id?: string | number) =>
  useQuery({
    queryKey: ["member-alignment", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<PairwiseAlignment[]>(`/members/${id}/alignment`);
      return res.data;
    },
  });

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { MemberStat, Meeting, PairwiseAlignment, SummaryStats, VoteItem } from "../types";

export const useSummary = () =>
  useQuery({
    queryKey: ["summary"],
    queryFn: async () => {
      const res = await api.get<{ summary: SummaryStats; recentVotes: VoteItem[] }>("/stats");
      return res.data;
    },
  });

export const useMeetings = () =>
  useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await api.get<Meeting[]>("/meetings");
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
      const res = await api.get<VoteItem[]>(`/votes`, { params: { nonUnanimousOnly } });
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

export const useMember = (id?: string | number) =>
  useQuery({
    queryKey: ["member", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get(`/members/${id}`);
      return res.data as { id: number; name: string; district?: string; stats?: MemberStat };
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

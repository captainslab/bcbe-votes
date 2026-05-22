import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Board, CategoryStat, ExecSessionDetailRow, ExecSessionSummaryData, Meeting, MemberCategoryStat, MemberMotionItem, MemberNoVoteItem, MemberProfile, MemberStat, PairwiseAlignment, SummaryStats, TranscriptData, TranscriptListItem, TranscriptSearchResult, VendorEntry, VendorProfile, VendorsResponse, VoteItem } from "../types";

export const useHubBoards = () =>
  useQuery({
    queryKey: ["hub-boards"],
    queryFn: async () => {
      const res = await api.get<Board[]>("/boards");
      return res.data;
    },
  });

export const useSummary = () =>
  useQuery({
    queryKey: ["summary"],
    queryFn: async () => {
      const res = await api.get<{ summary: SummaryStats; recentVotes: VoteItem[]; categoryStats: CategoryStat[] }>("/stats");
      return res.data;
    },
  });

export const useExecSessionSummary = () =>
  useQuery({
    queryKey: ["exec-sessions-summary"],
    queryFn: async () => {
      const res = await api.get<ExecSessionSummaryData>("/exec-sessions/summary");
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

export const useExecSessionDetail = () =>
  useQuery({
    queryKey: ["exec-sessions-detail"],
    queryFn: async () => {
      const res = await api.get<ExecSessionDetailRow[]>("/exec-sessions/detail");
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
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

export const useTranscript = (id?: string | number) =>
  useQuery({
    queryKey: ["transcript", id],
    enabled: Boolean(id),
    queryFn: async () => {
      try {
        const res = await api.get<TranscriptData>(`/meetings/${id}/transcript`);
        return res.data;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "response" in err &&
          (err as { response?: { status?: number } }).response?.status === 404
        ) {
          return null;
        }
        throw err;
      }
    },
  });

export const useVotes = (nonUnanimousOnly = true) =>
  useQuery({
    queryKey: ["votes", nonUnanimousOnly],
    queryFn: async () => {
      const res = await api.get<VoteItem[]>(`/votes`, { params: { nonUnanimousOnly, limit: 5000 } });
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
  motions?: { made: MemberMotionItem[]; seconded: MemberMotionItem[] };
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

export const useDistrictRequestCounts = () =>
  useQuery({
    queryKey: ["districtRequestCounts"],
    queryFn: async () => {
      const res = await api.get<{ boardName: string; state: string; count: number }[]>("/district-requests/counts");
      return res.data;
    },
  });

export const submitDistrictRequest = async (data: {
  boardName: string;
  state: string;
  email: string;
  type: "resident" | "operator";
  name?: string;
  role?: string;
}) => {
  const res = await api.post<{ success: boolean; duplicate?: boolean; id?: number }>("/district-requests", data);
  return res.data;
};

export type BoardSubmission = {
  id: number;
  boardName: string;
  state: string;
  slug: string;
  goalAmount: number;
  pledgedAmount: number;
  status: string;
  createdAt: string;
  pledgeCount?: number;
  pledges?: { pledgerName: string; amount: number; createdAt: string }[];
};

export const useBoards = () =>
  useQuery({
    queryKey: ["boards"],
    queryFn: async () => {
      const res = await api.get<BoardSubmission[]>("/boards");
      return res.data;
    },
  });

export const useBoard = (slug?: string) =>
  useQuery({
    queryKey: ["board", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await api.get<BoardSubmission>(`/boards/${slug}`);
      return res.data;
    },
  });

export const createBoardCheckout = async (data: {
  boardName: string;
  state: string;
  submitterName: string;
  submitterEmail: string;
  packageId?: "community_request" | "founder_launch" | "founder_full_history";
}) => {
  const res = await api.post<{ url: string }>("/boards/create-checkout", data);
  return res.data;
};

export type BoardCheckoutSession = {
  id: string;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  automaticTaxEnabled: boolean;
  customerEmail: string | null;
  boardName: string | null;
  state: string | null;
  packageId: string | null;
  packageName: string | null;
  boardUrl: string | null;
};

export const getBoardCheckoutSession = async (sessionId: string) => {
  const res = await api.get<BoardCheckoutSession>(`/boards/checkout-session/${encodeURIComponent(sessionId)}`);
  return res.data;
};

export const createDonationCheckout = async (data: {
  amount: number;
  name?: string;
  email?: string;
}) => {
  const res = await api.post<{ url: string }>("/donations/create-checkout", data);
  return res.data;
};

export const useVendors = () =>
  useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await api.get<VendorsResponse>("/vendors");
      return res.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour — matches server cache
  });

export const useVendorProfile = (slug: string) =>
  useQuery({
    queryKey: ["vendor", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await api.get<VendorProfile>(`/vendors/${slug}`);
      return res.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

export type { VendorEntry, VendorProfile, VendorsResponse };

export const useTranscriptSearch = (query: string) =>
  useQuery({
    queryKey: ["transcript-search", query],
    queryFn: async () => {
      if (!query || query.trim().length < 2) return [];
      const res = await api.get<TranscriptSearchResult[]>("/transcripts/search", { params: { q: query } });
      return res.data;
    },
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });

export const useTranscriptList = () =>
  useQuery({
    queryKey: ["transcript-list"],
    queryFn: async () => {
      const res = await api.get<TranscriptListItem[]>("/transcripts");
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

export const submitPledge = async (
  slug: string,
  data: { pledgerName: string; pledgerEmail: string; amount: number },
) => {
  const res = await api.post<{ success: boolean; funded: boolean; duplicate?: boolean }>(
    `/boards/${slug}/pledge`,
    data,
  );
  return res.data;
};

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMembers } from "../api/hooks";
import { StatCard } from "../components/StatCard";

const memberPortraits: Record<string, string> = {
  "Ken Bradley": "/board-members/ken-bradley.jpg",
  "Andrea Lindsey": "/board-members/andrea-lindsey.jpg",
  "Tony Myrick": "/board-members/tony-myrick.jpg",
  "Rondi Kirby": "/board-members/rondi-kirby.jpg",
  "Jason P. Woerner": "/board-members/jason-p-woerner.jpg",
  "Cecil Christenberry": "/board-members/cecil-christenberry.jpg",
  "April Bradley": "/board-members/april-bradley.jpg",
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

const MemberAvatar = ({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) => {
  const [errored, setErrored] = useState(false);
  const src = memberPortraits[name];
  const dim = size === "lg" ? "h-20 w-20" : "h-10 w-10";
  const textSize = size === "lg" ? "text-xl" : "text-sm";

  if (!src || errored) {
    return (
      <div
        className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-slate-300 ${textSize} font-semibold text-slate-600`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`${dim} shrink-0 rounded-full object-cover object-top`}
      onError={() => setErrored(true)}
    />
  );
};

export const Members = () => {
  const { data, isLoading, error } = useMembers();

  if (isLoading) return <p>Loading members…</p>;
  if (error) return <p className="text-red-600">Failed to load members.</p>;
  if (!data) return null;

  const totalRecordedVotes = data.reduce((sum, m) => sum + m.totalVotes, 0);
  const totalYesVotes = data.reduce((sum, m) => sum + m.yesCount, 0);
  const totalNoAbstain = data.reduce((sum, m) => sum + m.noCount + m.abstainCount, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Board Members</h1>
        <p className="text-sm text-slate-600">
          Roll-call vote counts for each board member. Only items where individual member votes were recorded are included — unanimous summary items are not counted.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Members tracked" value={data.length} helper="From imported voting records" />
        <StatCard label="Total roll-call votes" value={totalRecordedVotes.toLocaleString()} helper="Explicit per-member records only" />
        <StatCard label="Yes votes (all members)" value={totalYesVotes.toLocaleString()} helper={`No / abstained: ${totalNoAbstain.toLocaleString()}`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">Member</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Roll-call votes</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Yes votes</th>
              <th className="px-4 py-3 font-semibold text-slate-700">No / abstained</th>
              <th className="hidden px-4 py-3 font-semibold text-slate-700 sm:table-cell">Top no/abstained category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((member) => (
              <tr key={member.memberId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/members/${member.memberId}`}
                    className="flex items-center gap-3 font-semibold text-slate-900 hover:underline"
                  >
                    <MemberAvatar name={member.name} size="sm" />
                    <span className="flex flex-wrap items-center gap-2">
                      {member.name}
                      {!member.isActive && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Former member
                        </span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{member.totalVotes}</td>
                <td className="px-4 py-3 text-slate-700">{member.yesCount}</td>
                <td className="px-4 py-3 text-slate-700">{member.noCount + member.abstainCount}</td>
                <td className="hidden px-4 py-3 text-slate-700 sm:table-cell">
                  {member.topNoAbstainCategory ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Portraits: Baldwin County Public Schools</p>
    </div>
  );
};

import { Link } from "react-router-dom";
import { useMembers } from "../api/hooks";
import { StatCard } from "../components/StatCard";

export const Members = () => {
  const { data, isLoading, error } = useMembers();

  if (isLoading) return <p>Loading members…</p>;
  if (error) return <p className="text-red-600">Failed to load members.</p>;
  if (!data) return null;

  const highestYesRate = data.length
    ? Math.max(...data.map((m) => (m.totalVotes ? (m.yesCount / m.totalVotes) * 100 : 0)))
    : 0;
  const highestDissentRate = data.length ? Math.max(...data.map((m) => m.dissentRate * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Board Members</h1>
        <p className="text-sm text-slate-600">
          Per-member voting behavior, approval rates, dissent history, and participation counts.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Members tracked" value={data.length} helper="From imported voting records" />
        <StatCard label="Highest yes rate" value={`${highestYesRate.toFixed(1)}%`} />
        <StatCard label="Highest dissent rate" value={`${highestDissentRate.toFixed(1)}%`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">Member</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Votes</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Yes rate</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Dissent rate</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Non-unanimous</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((member) => (
              <tr key={member.memberId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/members/${member.memberId}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {member.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{member.totalVotes}</td>
                <td className="px-4 py-3 text-slate-700">
                  {(member.totalVotes ? (member.yesCount / member.totalVotes) * 100 : 0).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {(member.dissentRate * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-slate-700">{member.nonUnanimousParticipation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

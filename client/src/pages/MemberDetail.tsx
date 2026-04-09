import { Link, useParams } from "react-router-dom";
import { useMember, useMemberAlignment } from "../api/hooks";

export const MemberDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error } = useMember(id);
  const alignment = useMemberAlignment(id);

  if (isLoading) return <p>Loading member…</p>;
  if (error) return <p className="text-red-600">Failed to load member.</p>;
  if (!data) return null;

  const stats = data.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Baldwin County Board of Education</p>
          <h1 className="text-3xl font-semibold text-slate-900">{data.name}</h1>
        </div>
        <Link to="/members" className="text-sm font-semibold text-slate-700 hover:underline">
          Back to members
        </Link>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Total votes</p>
            <p className="text-2xl font-semibold text-slate-900">{stats.totalVotes}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Dissent rate</p>
            <p className="text-2xl font-semibold text-slate-900">
              {(stats.dissentRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Alignment</p>
            <p className="text-2xl font-semibold text-slate-900">
              {(stats.majorityAlignmentRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Pairwise alignment</h2>
        <p className="text-sm text-slate-500">
          Overlapping votes with each other member and how often they matched.
        </p>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">With</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Overlap</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Alignment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {alignment.data?.map((pair) => (
                <tr key={`${pair.memberAId}-${pair.memberBId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">
                    Member {pair.memberAId === Number(id) ? pair.memberBId : pair.memberAId}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{pair.overlap}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {(pair.alignmentRate * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

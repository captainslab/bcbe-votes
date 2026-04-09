import { useAlignment, useMembers } from "../api/hooks";

export const Alliances = () => {
  const { data, isLoading, error } = useAlignment();
  const members = useMembers();

  if (isLoading) return <p>Loading alliances…</p>;
  if (error) return <p className="text-red-600">Failed to load alliances.</p>;
  if (!data) return null;

  const sorted = [...data].sort((a, b) => b.alignmentRate - a.alignmentRate);
  const memberNameById = new Map((members.data ?? []).map((member) => [member.memberId, member.name]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pairwise Alignment</h1>
        <p className="text-sm text-slate-600">
          Percentage of overlapping votes where members matched each other.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">Member A</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Member B</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Overlap</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Alignment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sorted.map((row) => (
              <tr key={`${row.memberAId}-${row.memberBId}`} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">
                  {memberNameById.get(row.memberAId) || `Member ${row.memberAId}`}
                </td>
                <td className="px-4 py-3 text-slate-800">
                  {memberNameById.get(row.memberBId) || `Member ${row.memberBId}`}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.overlap}</td>
                <td className="px-4 py-3 text-slate-700">
                  {(row.alignmentRate * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

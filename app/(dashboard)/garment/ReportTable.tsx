/** The garment reports' table: a header row and rows of cells, or a dash when there is nothing. */
export function ReportTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="neu-card p-4 text-sm text-muted">—</p>;
  return (
    <section className="neu-card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

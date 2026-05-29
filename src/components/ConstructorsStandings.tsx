const mockConstructors = [
  { pos: 1, team: 'McLaren', color: '#FF8700', points: 490, gap: 'Leader' },
  { pos: 2, team: 'Ferrari', color: '#E8002D', points: 455, gap: '-35' },
  { pos: 3, team: 'Red Bull Racing', color: '#3671C6', points: 360, gap: '-130' },
  { pos: 4, team: 'Mercedes', color: '#27F4D2', points: 280, gap: '-210' },
  { pos: 5, team: 'Williams', color: '#00A0E9', points: 165, gap: '-325' },
  { pos: 6, team: 'Aston Martin', color: '#229971', points: 110, gap: '-380' },
  { pos: 7, team: 'Cadillac', color: '#FFB800', points: 85, gap: '-405' },
  { pos: 8, team: 'Audi', color: '#E20613', points: 60, gap: '-430' },
  { pos: 9, team: 'Haas', color: '#FFFFFF', points: 25, gap: '-465' },
  { pos: 10, team: 'Racing Bulls', color: '#0029FF', points: 15, gap: '-475' },
  { pos: 11, team: 'Alpine', color: '#FF87BC', points: 5, gap: '-485' },
];

export const ConstructorsStandings = () => {
  return (
    <div className="flex-1 bg-panel rounded-xl border border-line p-6 flex flex-col min-h-0 w-[800px] mx-auto">
      <h2 className="text-muted text-sm font-bold tracking-widest mb-6 border-b border-line pb-4">2026 WORLD CONSTRUCTORS' CHAMPIONSHIP</h2>
      <div className="flex-1 pr-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-muted text-xs border-b border-line/50">
              <th className="pb-3 w-16">POS</th>
              <th className="pb-3">CONSTRUCTOR</th>
              <th className="pb-3 text-right">GAP</th>
              <th className="pb-3 text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {mockConstructors.map((c) => (
              <tr key={c.pos} className="border-b border-line hover:bg-panel-alt transition-colors group">
                <td className="py-2.5 font-bold text-2xl">{c.pos}</td>
                <td className="py-2.5 font-bold text-xl uppercase tracking-wider">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-6 rounded" style={{ backgroundColor: c.color }}></div>
                    {c.team}
                  </div>
                </td>
                <td className="py-2.5 text-muted text-right font-mono">{c.gap}</td>
                <td className="py-2.5 font-bold text-2xl text-right text-accent">{c.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const mockDrivers = [
  { pos: 1, driver: 'Lando Norris', team: 'McLaren', color: '#FF8700', points: 312, trend: 'same' },
  { pos: 2, driver: 'Max Verstappen', team: 'Red Bull Racing', color: '#3671C6', points: 295, trend: 'same' },
  { pos: 3, driver: 'Charles Leclerc', team: 'Ferrari', color: '#E8002D', points: 245, trend: 'up' },
  { pos: 4, driver: 'Lewis Hamilton', team: 'Ferrari', color: '#E8002D', points: 210, trend: 'down' },
  { pos: 5, driver: 'George Russell', team: 'Mercedes', color: '#27F4D2', points: 185, trend: 'same' },
  { pos: 6, driver: 'Oscar Piastri', team: 'McLaren', color: '#FF8700', points: 178, trend: 'same' },
  { pos: 7, driver: 'Carlos Sainz', team: 'Williams', color: '#00A0E9', points: 140, trend: 'up' },
  { pos: 8, driver: 'Fernando Alonso', team: 'Aston Martin', color: '#229971', points: 95, trend: 'down' },
  { pos: 9, driver: 'Sergio Perez', team: 'Cadillac', color: '#FFB800', points: 65, trend: 'up' },
  { pos: 10, driver: 'Nico Hülkenberg', team: 'Audi', color: '#E20613', points: 42, trend: 'same' },
];

export const DriversStandings = () => {
  return (
    <div className="flex-1 bg-panel rounded-xl border border-line p-6 flex flex-col min-h-0">
      <h2 className="text-muted text-sm font-bold tracking-widest mb-6 border-b border-line pb-4">2026 WORLD DRIVERS' CHAMPIONSHIP</h2>
      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-muted text-xs border-b border-line/50">
              <th className="pb-3 w-12">POS</th>
              <th className="pb-3">DRIVER</th>
              <th className="pb-3">TEAM</th>
              <th className="pb-3 text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {mockDrivers.map((d) => (
              <tr key={d.pos} className="border-b border-line hover:bg-panel-alt transition-colors group">
                <td className="py-4 font-bold text-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center">{d.pos}</span>
                    {d.trend === 'up' && <span className="text-accent text-xs">▲</span>}
                    {d.trend === 'down' && <span className="text-f1-red text-xs">▼</span>}
                    {d.trend === 'same' && <span className="text-muted text-xs opacity-50">-</span>}
                  </div>
                </td>
                <td className="py-4 font-bold text-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 rounded" style={{ backgroundColor: d.color }}></div>
                    {d.driver}
                  </div>
                </td>
                <td className="py-4 text-muted uppercase text-sm font-bold">{d.team}</td>
                <td className="py-4 font-bold text-xl text-right text-accent">{d.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

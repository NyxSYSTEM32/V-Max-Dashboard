import type { ChampionshipStandings, DriverStanding } from "../lib/standings";

type Props = {
	error: string | null;
	isLoading: boolean;
	standings: ChampionshipStandings;
	onRefresh: () => void;
};

const getTrendMarker = (driver: DriverStanding) => {
	if (driver.trend === "up") return <span className="text-accent text-xs">UP</span>;
	if (driver.trend === "down") return <span className="text-f1-red text-xs">DN</span>;
	return <span className="text-muted text-xs opacity-50">--</span>;
};

const formatUpdatedAt = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const DriversStandings = ({ error, isLoading, standings, onRefresh }: Props) => {
	return (
		<div className="flex-1 bg-panel rounded-xl border border-line p-6 flex flex-col min-h-0">
			<div className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-4">
				<div>
					<h2 className="text-muted text-sm font-bold tracking-widest">2026 WORLD DRIVERS' CHAMPIONSHIP</h2>
					<div className="mt-2 flex flex-wrap gap-3 text-[10px] uppercase text-muted">
						<span>Source: {standings.source}</span>
						<span>Session: {standings.sessionKey ?? "--"}</span>
						<span>Updated: {formatUpdatedAt(standings.updatedAt)}</span>
						{error && <span className="text-warning">Cache fallback: {error}</span>}
					</div>
				</div>
				<button onClick={onRefresh} className="rounded border border-line bg-bg px-3 py-2 text-xs font-bold uppercase text-white transition-colors hover:border-accent hover:text-accent">
					{isLoading ? "Updating" : "Refresh"}
				</button>
			</div>

			<div className="flex-1 overflow-y-auto pr-6 custom-scrollbar">
				<table className="w-full text-left border-collapse">
					<thead>
						<tr className="text-muted text-xs border-b border-line/50">
							<th className="pb-3 w-16">POS</th>
							<th className="pb-3">DRIVER</th>
							<th className="pb-3">TEAM</th>
							<th className="pb-3 text-right">GAIN</th>
							<th className="pb-3 text-right">PTS</th>
						</tr>
					</thead>
					<tbody>
						{standings.drivers.map((driver) => (
							<tr key={driver.driverNumber} className="border-b border-line hover:bg-panel-alt transition-colors group">
								<td className="py-3 font-bold text-lg">
									<div className="flex items-center gap-3">
										<span className="w-6 text-center">{driver.pos}</span>
										{getTrendMarker(driver)}
									</div>
								</td>
								<td className="py-3 font-bold text-lg">
									<div className="flex items-center gap-3">
										<div className="w-1.5 h-6 rounded" style={{ backgroundColor: driver.color }} />
										<div>
											<div>{driver.driver}</div>
											<div className="text-[10px] text-muted">{driver.acronym} - #{driver.driverNumber}</div>
										</div>
									</div>
								</td>
								<td className="py-3 text-muted uppercase text-sm font-bold">{driver.team}</td>
								<td className="py-3 text-right text-xs font-bold text-muted">{driver.pointsGained > 0 ? `+${driver.pointsGained}` : driver.pointsGained}</td>
								<td className="py-3 font-bold text-xl text-right text-accent">{driver.points}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};

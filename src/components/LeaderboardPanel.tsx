import { memo } from "react";

import type { LeaderboardEntry, SectorStatus } from "../types/ipc";

const getCompoundClass = (compound?: string) => {
	switch (compound) {
		case "SOFT":
			return "bg-f1-red text-white";
		case "MEDIUM":
			return "bg-warning text-bg";
		case "HARD":
			return "bg-white text-bg";
		case "INTERMEDIATE":
			return "bg-accent text-bg";
		case "WET":
			return "bg-sky-400 text-bg";
		default:
			return "bg-panel-alt text-muted";
	}
};

const getCompoundLabel = (compound?: string) => compound?.slice(0, 1) ?? "-";
const getCompoundTitle = (compound?: string, tyreAge?: number) => `${compound ?? "NO TYRE"}${Number.isFinite(tyreAge) ? ` - ${tyreAge}L` : ""}`;
const getTyreAgeTone = (tyreAge?: number) => {
	if (!Number.isFinite(tyreAge)) return "text-muted";
	if ((tyreAge ?? 0) >= 20) return "text-warning";
	if ((tyreAge ?? 0) >= 12) return "text-white";
	return "text-muted";
};
const getGapClass = (gap: string) => {
	if (gap === "Leader") return "text-accent";
	if (gap === "--") return "text-muted";
	return "text-accent";
};
const getPositionClass = (pos: number | string) => {
	if (pos === 1) return "text-accent";
	if (pos === 2 || pos === 3) return "text-white";
	return "text-muted";
};

const getSectorClass = (status?: SectorStatus) => {
	switch (status) {
		case "overall":
			return "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.75)]";
		case "personal":
			return "bg-accent shadow-[0_0_7px_rgba(51,230,161,0.55)]";
		case "completed":
			return "bg-warning/90";
		default:
			return "bg-panel-alt border border-line";
	}
};

const getSectorTitle = (sector: number, status?: string, value?: number) => {
	const label = status === "overall" ? "Overall best" : status === "personal" ? "Personal best" : status === "completed" ? "Completed" : "No sector yet";
	return `S${sector}: ${label}${Number.isFinite(value) ? ` (${value?.toFixed(3)}s)` : ""}`;
};

type Props = {
	focusedDriverNumber: string;
	leaderboard: LeaderboardEntry[];
	onFocusedDriverChange: (driverNumber: string) => void;
};

const LeaderboardPanel = ({ focusedDriverNumber, leaderboard, onFocusedDriverChange }: Props) => (
	<div className="flex-1 bg-panel rounded-xl border border-line p-4 flex flex-col min-h-0">
		<div className="mb-3 flex items-center justify-between gap-3">
			<h2 className="text-muted text-xs font-bold tracking-widest">TIMING TOWER</h2>
			<span className="text-[10px] font-bold uppercase text-muted">{leaderboard.length > 0 ? `${leaderboard.length} cars` : "standby"}</span>
		</div>
		<div className="mb-2 grid grid-cols-[2rem_0.5rem_minmax(3rem,1fr)_2.8rem_2.2rem_2.1rem_4.3rem] items-center gap-1 px-1 text-[9px] font-bold uppercase tracking-wider text-muted">
			<span>POS</span>
			<span />
			<span>DRV</span>
			<span>S1-3</span>
			<span>TY</span>
			<span>LAP</span>
			<span className="text-right">GAP</span>
		</div>
		<div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
			{leaderboard.length > 0 ? (
				leaderboard.map((driver) => {
					const isFocused = driver.driverNumber === focusedDriverNumber;
					return (
						<button
							key={driver.driverNumber}
							onClick={() => onFocusedDriverChange(driver.driverNumber)}
							className={`group mb-1 grid w-full grid-cols-[2rem_0.5rem_minmax(3rem,1fr)_2.8rem_2.2rem_2.1rem_4.3rem] items-center gap-1 rounded-md border px-1.5 py-1.5 text-left text-sm transition-colors hover:border-line hover:bg-panel-alt ${
								isFocused ? "border-accent/60 bg-accent/10 text-white shadow-[inset_2px_0_0_var(--color-accent),0_0_14px_rgba(51,230,161,0.10)]" : "border-transparent border-b-line/80"
							}`}
						>
							<span className={`font-black tabular-nums ${getPositionClass(driver.pos)}`}>{driver.pos}</span>
							<div className="h-6 w-1 rounded shadow-[0_0_10px_currentColor]" style={{ backgroundColor: driver.color, color: driver.color }} />
							<span className="min-w-0">
								<span className="block truncate font-black leading-4 text-white">{driver.driver}</span>
								<span className="block truncate text-[8px] font-bold uppercase tracking-wider text-muted">
									{driver.dataStatus ?? driver.positionSource ?? "REPLAY"}
								</span>
							</span>
							<div className="flex w-10 items-center justify-between" aria-label={`${driver.driver} sectors`}>
								{[1, 2, 3].map((sector) => {
									const snapshot = driver.sectors?.[sector - 1];
									return (
										<span
											key={sector}
											title={getSectorTitle(sector, snapshot?.status, snapshot?.value)}
											className={`h-2.5 w-2.5 rounded-[2px] transition-colors ${getSectorClass(snapshot?.status)}`}
										/>
									);
								})}
							</div>
							<span title={getCompoundTitle(driver.compound, driver.tyreAge)} className="flex items-center gap-1">
								<span className={`flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-black ${getCompoundClass(driver.compound)}`}>
									{getCompoundLabel(driver.compound)}
								</span>
								<span className={`text-[8px] font-black tabular-nums ${getTyreAgeTone(driver.tyreAge)}`}>
									{Number.isFinite(driver.tyreAge) ? `${driver.tyreAge}L` : "--"}
								</span>
							</span>
							<span className="text-[10px] text-muted tabular-nums">{driver.lap ? `L${driver.lap}` : "--"}</span>
							<span className={`truncate rounded border border-transparent px-1 text-right text-xs font-black tabular-nums ${getGapClass(driver.gap)} ${driver.gap === "Leader" ? "bg-accent/10" : ""}`}>{driver.gap}</span>
						</button>
					);
				})
			) : (
				<div className="text-muted text-xs text-center mt-10">Waiting for replay telemetry...</div>
			)}
		</div>
	</div>
);

export default memo(LeaderboardPanel);

import { memo } from "react";

import type { ActiveTab } from "../types/ui";
import type { AppMode, LiveHealth } from "../types/ipc";

type Props = {
	activeTab: ActiveTab;
	currentLap: number;
	liveHealth: LiveHealth;
	liveHealthLabel: string;
	mode: AppMode;
	totalLaps: number | null;
	uaSafetyModeEnabled: boolean;
	onModeChange: (mode: AppMode) => void;
	onTabChange: (tab: ActiveTab) => void;
};

const liveHealthClass: Record<LiveHealth, string> = {
	idle: "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.45)]",
	healthy: "bg-accent shadow-[0_0_10px_rgba(51,230,161,0.55)] animate-pulse",
	degraded: "bg-warning shadow-[0_0_10px_rgba(245,200,106,0.55)]",
	poor: "bg-f1-red shadow-[0_0_10px_rgba(255,24,1,0.6)] animate-pulse",
};

const HeaderBar = ({ activeTab, currentLap, liveHealth, liveHealthLabel, mode, totalLaps, uaSafetyModeEnabled, onModeChange, onTabChange }: Props) => {
	const tabClass = (tab: ActiveTab) =>
		`px-4 py-2 rounded-lg text-xs font-bold tracking-wider transition-colors uppercase ${
			activeTab === tab ? "bg-f1-red text-white" : "hover:bg-panel-alt text-muted"
		}`;

	return (
		<header className="relative z-10 flex justify-between items-center bg-panel p-4 rounded-xl border border-line drag-region">
			<div className="flex items-center gap-8 no-drag">
				<div className="text-f1-red font-bold text-xl tracking-widest select-none cursor-default">V-MAX</div>
				<div className="flex gap-2">
					<button onClick={() => onTabChange("telemetry")} className={tabClass("telemetry")}>
						Live Telemetry
					</button>
					<button onClick={() => onTabChange("drivers")} className={tabClass("drivers")}>
						Drivers
					</button>
					<button onClick={() => onTabChange("constructors")} className={tabClass("constructors")}>
						Constructors
					</button>
					<button onClick={() => onTabChange("media")} className={tabClass("media")}>
						Media
					</button>
					{uaSafetyModeEnabled && (
						<button onClick={() => onTabChange("ua-monitor")} className={tabClass("ua-monitor")}>
							UA Monitor
						</button>
					)}
					<button onClick={() => onTabChange("settings")} className={tabClass("settings")}>
						Settings
					</button>
				</div>
			</div>
			<div className="flex gap-4 items-center no-drag">
				<div className="text-sm text-muted">{currentLap > 0 ? `LAP ${currentLap} / ${totalLaps ?? "--"}` : `LAP -- / ${totalLaps ?? "--"}`}</div>
				<div className="flex items-center bg-panel-alt p-1 rounded-lg border border-line">
					<button
						onClick={() => onModeChange("archive")}
						className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
							mode === "archive" ? "bg-zinc-700 text-white shadow-sm" : "text-muted hover:text-white"
						}`}
					>
						REPLAY MODE
					</button>
					<button
						onClick={() => onModeChange("live")}
						className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
							mode === "live" ? "bg-panel text-white shadow-sm border border-line" : "text-muted hover:text-white"
						}`}
					>
						<div className={`w-2 h-2 rounded-full ${liveHealthClass[liveHealth]}`} />
						<span>LIVE MODE</span>
						<span className="max-w-24 truncate text-[9px] text-muted">{liveHealthLabel}</span>
					</button>
				</div>
			</div>
		</header>
	);
};

export default memo(HeaderBar);

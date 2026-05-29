import { memo, useMemo, useState } from "react";

import type { AppMode, DriverMap, RaceControlMessage, TrackFlag } from "../types/ipc";

type Props = {
	drivers: DriverMap;
	latestRaceControl?: RaceControlMessage;
	messages: RaceControlMessage[];
	mode: AppMode;
	trackFlag: TrackFlag;
};

type RaceControlFilter = "all" | "flags" | "incidents" | "penalties" | "straight";

const filters: { id: RaceControlFilter; label: string }[] = [
	{ id: "all", label: "ALL" },
	{ id: "flags", label: "FLAGS" },
	{ id: "incidents", label: "INCIDENTS" },
	{ id: "penalties", label: "PENALTIES" },
	{ id: "straight", label: "STRAIGHT" },
];

const getDriverLabel = (drivers: DriverMap, driverNumber?: string) => {
	if (!driverNumber) return null;
	const driver = drivers[driverNumber];
	const code = driver?.Tla ?? driverNumber;
	return { code, text: `${code}${driver?.FullName ? ` ${driver.FullName}` : ""}`, title: `CAR ${driverNumber}${driver?.FullName ? ` - ${driver.FullName}` : ""}` };
};

const getMessageSearchText = (message: RaceControlMessage, drivers: DriverMap) =>
	[
		message.message,
		message.category,
		message.flag,
		message.scope,
		message.driverNumber ? `car ${message.driverNumber}` : "",
		getDriverLabel(drivers, message.driverNumber)?.text,
		message.lap ? `lap ${message.lap} l${message.lap}` : "",
		message.sector ? `sector ${message.sector} s${message.sector}` : "",
	]
		.filter(Boolean)
		.join(" ")
		.toUpperCase();

const getMessageTone = (message: RaceControlMessage) => {
	const text = message.message.toUpperCase();
	if (text.includes("OVERTAKE ENABLED")) return { label: "STRAIGHT", className: "border-accent text-accent bg-accent/10" };
	if (text.includes("OVERTAKE DISABLED")) return { label: "LOCKED", className: "border-muted text-muted bg-panel-alt" };
	if (text.includes("PENALTY")) return { label: "PENALTY", className: "border-f1-red text-f1-red bg-f1-red/10" };
	if (text.includes("TIME ") && text.includes(" DELETED")) return { label: "LAP DEL", className: "border-warning text-warning bg-warning/10" };
	if (text.includes("UNDER INVESTIGATION")) return { label: "INVEST", className: "border-warning text-warning bg-warning/10" };
	if (text.includes("INCIDENT")) return { label: "INCIDENT", className: "border-line text-text bg-panel-alt" };
	return { label: message.category ?? "INFO", className: "border-line text-muted bg-panel-alt" };
};

const matchesFilter = (message: RaceControlMessage, filter: RaceControlFilter) => {
	if (filter === "all") return true;

	const text = message.message.toUpperCase();
	const flag = message.flag?.toUpperCase() ?? "";
	const category = message.category?.toUpperCase() ?? "";

	if (filter === "flags") return Boolean(flag) || text.includes("FLAG") || category.includes("SAFETY");
	if (filter === "incidents") return text.includes("INCIDENT") || text.includes("INVESTIGAT") || text.includes("NOTED");
	if (filter === "penalties") return text.includes("PENALTY") || text.includes("DELETED") || text.includes("TRACK LIMIT");
	if (filter === "straight") return text.includes("OVERTAKE") || text.includes("STRAIGHT");

	return true;
};

const formatRaceControlText = (message: string) => {
	if (message.toUpperCase() === "OVERTAKE ENABLED") return "STRAIGHT MODE AVAILABLE";
	if (message.toUpperCase() === "OVERTAKE DISABLED") return "STRAIGHT MODE DISABLED";
	return message;
};

const isPriorityMessage = (message: RaceControlMessage) => {
	const text = message.message.toUpperCase();
	return text.includes("PENALTY") || text.includes("UNDER INVESTIGATION") || text.includes("DELETED") || text.includes("OVERTAKE ENABLED");
};

const RaceControlPanel = ({ drivers, latestRaceControl, messages, mode, trackFlag }: Props) => {
	const [activeFilter, setActiveFilter] = useState<RaceControlFilter>("all");
	const [searchTerm, setSearchTerm] = useState("");
	const [driverFilter, setDriverFilter] = useState<string>("all");
	const driverFilters = useMemo(() => {
		const driverNumbers = Array.from(new Set(messages.map((message) => message.driverNumber).filter(Boolean) as string[]));
		return driverNumbers.slice(-8).reverse();
	}, [messages]);
	const normalizedSearch = searchTerm.trim().toUpperCase();
	const filteredMessages = useMemo(() => {
		return messages.filter((message) => {
			if (!matchesFilter(message, activeFilter)) return false;
			if (driverFilter !== "all" && message.driverNumber !== driverFilter) return false;
			if (normalizedSearch && !getMessageSearchText(message, drivers).includes(normalizedSearch)) return false;
			return true;
		});
	}, [activeFilter, driverFilter, drivers, messages, normalizedSearch]);
	const visibleMessages = filteredMessages.slice(-12).reverse();
	const priorityMessages = filteredMessages.filter(isPriorityMessage).slice(-2).reverse();

	return (
		<div className="h-64 shrink-0 bg-panel rounded-xl border border-line p-4 flex flex-col min-h-0 overflow-hidden">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="text-muted text-xs font-bold tracking-widest">RACE CONTROL</h2>
				<span className="text-[10px] text-muted font-bold uppercase">{messages.length > 0 ? `${filteredMessages.length}/${messages.length} events` : "archive"}</span>
			</div>
			<div className="mb-2 flex items-center gap-3 text-sm">
				<span className="text-muted">{latestRaceControl?.lap ? `L${latestRaceControl.lap}` : mode.toUpperCase()}</span>
				<span className={trackFlag === "Red" ? "text-f1-red" : trackFlag === "Green" ? "text-accent" : "text-warning font-bold"}>
					{trackFlag === "Chequered" ? "Session Ended" : `${trackFlag} Flag`}
				</span>
			</div>
			<div className="mb-2 grid grid-cols-[1fr_5.5rem] gap-2">
				<input
					value={searchTerm}
					onChange={(event) => setSearchTerm(event.target.value)}
					placeholder="Search steward archive"
					className="h-7 rounded border border-line bg-bg px-2 text-[10px] font-bold uppercase text-white outline-none transition-colors placeholder:text-muted focus:border-accent"
				/>
				<button
					onClick={() => {
						setSearchTerm("");
						setDriverFilter("all");
						setActiveFilter("all");
					}}
					className="h-7 rounded border border-line bg-panel-alt px-2 text-[9px] font-bold text-muted transition-colors hover:border-accent hover:text-white"
				>
					RESET
				</button>
			</div>
			<div className="mb-2 flex gap-1 overflow-x-auto pb-1 custom-scrollbar">
				{filters.map((filter) => (
					<button
						key={filter.id}
						onClick={() => setActiveFilter(filter.id)}
						className={`rounded border px-2 py-1 text-[9px] font-bold transition-colors ${
							activeFilter === filter.id ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel-alt text-muted hover:text-white"
						}`}
					>
						{filter.label}
					</button>
				))}
			</div>
			<div className="mb-2 flex gap-1 overflow-x-auto pb-1 custom-scrollbar">
				<button
					onClick={() => setDriverFilter("all")}
					className={`rounded border px-2 py-1 text-[9px] font-bold transition-colors ${
						driverFilter === "all" ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel-alt text-muted hover:text-white"
					}`}
				>
					ALL CARS
				</button>
				{driverFilters.map((driverNumber) => (
					<button
						key={driverNumber}
						onClick={() => setDriverFilter(driverNumber)}
						className={`rounded border px-2 py-1 text-[9px] font-bold transition-colors ${
							driverFilter === driverNumber ? "border-warning bg-warning/15 text-warning" : "border-line bg-panel-alt text-muted hover:text-white"
						}`}
						title={getDriverLabel(drivers, driverNumber)?.title}
					>
						{getDriverLabel(drivers, driverNumber)?.code ?? driverNumber}
					</button>
				))}
			</div>
			<div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
				{priorityMessages.length > 0 && (
					<div className="mb-2 grid gap-1">
						{priorityMessages.map((message) => {
							const tone = getMessageTone(message);
							return (
								<div key={`priority.${message.date}.${message.message}`} className={`rounded border px-2 py-1 ${tone.className}`}>
									<div className="flex items-center justify-between gap-2 text-[8px] font-black uppercase">
										<span>{tone.label}</span>
										<span>{message.lap ? `L${message.lap}` : "--"}</span>
									</div>
									<div className="truncate text-[9px] font-bold uppercase">{formatRaceControlText(message.message)}</div>
								</div>
							);
						})}
					</div>
				)}
				{visibleMessages.length > 0 ? (
					visibleMessages.map((message) => {
						const tone = getMessageTone(message);
						const driverLabel = getDriverLabel(drivers, message.driverNumber);
						return (
							<div key={`${message.date}.${message.message}`} className="rounded border border-line/60 bg-bg/30 px-2 py-1">
								<div className="flex items-center gap-2 text-[9px] uppercase text-muted">
									<span>{message.lap ? `L${message.lap}` : "--"}</span>
									<span className={`rounded border px-1.5 py-0.5 ${tone.className}`}>{tone.label}</span>
									{message.sector && <span>S{message.sector}</span>}
									{driverLabel && <span title={driverLabel.title}>{driverLabel.code}</span>}
									{message.flag && <span>{message.flag}</span>}
								</div>
								<div className="truncate text-[10px] uppercase text-text/80">{formatRaceControlText(message.message)}</div>
							</div>
						);
					})
				) : (
					<div className="text-[10px] uppercase text-muted">No race control messages for this filter</div>
				)}
			</div>
		</div>
	);
};

export default memo(RaceControlPanel);

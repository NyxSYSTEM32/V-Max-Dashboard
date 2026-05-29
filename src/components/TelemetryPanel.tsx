import { memo } from "react";

import type { DataSourceStatus, LapSummary, SectorStatus, StintSummary, Telemetry, WeatherSnapshot } from "../types/ipc";

type Tone = "accent" | "warning" | "danger" | "purple" | "muted";
type TelemetrySample = Pick<Telemetry, "driverNumber" | "speed" | "throttle" | "brake"> & { time: number };
const telemetryTraceCache = new Map<string, TelemetrySample[]>();

const toneClass: Record<Tone, string> = {
	accent: "text-accent border-accent/50 bg-accent/10",
	warning: "text-warning border-warning/50 bg-warning/10",
	danger: "text-f1-red border-f1-red/50 bg-f1-red/10",
	purple: "text-fuchsia-300 border-fuchsia-400/60 bg-fuchsia-500/10",
	muted: "text-muted border-line bg-panel-alt/60",
};

const mguWindowBars = Array.from({ length: 18 }, (_, i) => 0.45 + ((i % 6) + 1) / 12);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const formatLapTime = (value?: number) => {
	if (!Number.isFinite(value)) return "--";

	const totalSeconds = Math.max(0, value ?? 0);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds - minutes * 60;
	return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
};
const formatDelta = (value?: number) => {
	if (!Number.isFinite(value)) return "--";
	if (Math.abs(value ?? 0) < 0.001) return "+0.000";
	return `+${value?.toFixed(3)}`;
};

const getAeroEstimate = (telemetry: { speed: number; throttle: number; brake: number }) => {
	if (telemetry.brake > 2 || telemetry.speed < 160) return { label: "CORNER", tone: "accent" as Tone, confidence: "INFERRED" };
	if (telemetry.speed > 235 && telemetry.throttle > 65) return { label: "STRAIGHT", tone: "warning" as Tone, confidence: "INFERRED" };
	return { label: "TRANSITION", tone: "muted" as Tone, confidence: "INFERRED" };
};

const getEnergyEstimate = (telemetry: { speed: number; throttle: number; brake: number }) => {
	if (telemetry.brake > 8) return { label: "HARVEST", tone: "warning" as Tone, value: clamp(telemetry.brake, 0, 100), caption: "BRAKE REGEN" };
	if (telemetry.throttle < 8 && telemetry.speed > 120) return { label: "LIFT REGEN", tone: "warning" as Tone, value: 35, caption: "LIFT-OFF" };
	if (telemetry.throttle > 65) return { label: "DEPLOY", tone: "accent" as Tone, value: clamp(telemetry.throttle, 0, 100), caption: "MGU-K EST." };
	return { label: "BALANCE", tone: "muted" as Tone, value: 15, caption: "NEUTRAL" };
};

const updateTelemetryTrace = (telemetry: Telemetry) => {
	const sample: TelemetrySample = {
		driverNumber: telemetry.driverNumber,
		speed: telemetry.speed,
		throttle: telemetry.throttle,
		brake: telemetry.brake,
		time: Date.now(),
	};
	const current = telemetryTraceCache.get(telemetry.driverNumber) ?? [];
	const previous = current.at(-1);
	const unchanged = previous && previous.speed === sample.speed && previous.throttle === sample.throttle && previous.brake === sample.brake;
	const next = unchanged ? current : [...current.slice(-41), sample];

	telemetryTraceCache.set(telemetry.driverNumber, next);
	return { samples: next, previousSample: previous };
};

const getLapPhase = (telemetry: { speed: number; throttle: number; brake: number }) => {
	if (telemetry.brake > 35) return { label: "BRAKING", tone: "danger" as Tone, meta: "DECEL" };
	if (telemetry.speed < 145 && telemetry.throttle < 35) return { label: "APEX", tone: "purple" as Tone, meta: "ROTATION" };
	if (telemetry.throttle > 55 && telemetry.speed < 210) return { label: "TRACTION", tone: "accent" as Tone, meta: "EXIT" };
	if (telemetry.speed > 235 && telemetry.throttle > 65) return { label: "STRAIGHT", tone: "warning" as Tone, meta: "DEPLOY" };
	return { label: "BLEND", tone: "muted" as Tone, meta: "TRANSITION" };
};

const SystemTile = ({ label, value, meta, tone = "muted" }: { label: string; value: string; meta: string; tone?: Tone }) => (
	<div className={`rounded-lg border px-3 py-2 ${toneClass[tone]}`}>
		<div className="text-[9px] text-muted font-bold tracking-widest uppercase">{label}</div>
		<div className="mt-1 text-sm font-bold uppercase">{value}</div>
		<div className="mt-0.5 text-[9px] text-muted font-bold uppercase">{meta}</div>
	</div>
);

const TelemetryBar = ({ label, value, colorClass }: { label: string; value: number; colorClass: string }) => (
	<div>
		<div className="flex justify-between text-xs mb-2">
			<span className="text-muted">{label}</span>
			<span className="font-bold">{Math.round(value)}%</span>
		</div>
		<div className="h-2 w-full bg-panel-alt rounded-full overflow-hidden">
			<div className={`h-full transition-all duration-150 ease-linear ${colorClass}`} style={{ width: `${clamp(value, 0, 100)}%` }} />
		</div>
	</div>
);

const MiniTrace = ({ samples }: { samples: TelemetrySample[] }) => {
	const visibleSamples = samples.slice(-42);
	const maxSpeed = Math.max(1, ...visibleSamples.map((sample) => sample.speed));

	return (
		<div className="mb-5 rounded-lg border border-line bg-panel-alt/40 p-3">
			<div className="mb-3 flex items-center justify-between">
				<span className="text-[10px] font-bold tracking-widest text-muted">SPEED / PEDAL TRACE</span>
				<span className="text-[10px] font-bold text-muted">{visibleSamples.length > 1 ? `${visibleSamples.length} SAMPLES` : "ARMING"}</span>
			</div>
			<div className="grid h-28 grid-cols-[auto_1fr] gap-x-3 gap-y-2">
				<span className="self-center text-[9px] font-bold text-sky-300">SPD</span>
				<div className="flex items-end gap-0.5 rounded border border-line bg-bg/60 p-1">
					{visibleSamples.map((sample, index) => (
						<div key={`${sample.time}.spd.${index}`} className="flex-1 rounded-t bg-sky-300/80" style={{ height: `${clamp((sample.speed / maxSpeed) * 100, 3, 100)}%` }} />
					))}
				</div>
				<span className="self-center text-[9px] font-bold text-accent">THR</span>
				<div className="flex items-end gap-0.5 rounded border border-line bg-bg/60 p-1">
					{visibleSamples.map((sample, index) => (
						<div key={`${sample.time}.thr.${index}`} className="flex-1 rounded-t bg-accent/80" style={{ height: `${clamp(sample.throttle, 3, 100)}%` }} />
					))}
				</div>
				<span className="self-center text-[9px] font-bold text-f1-red">BRK</span>
				<div className="flex items-end gap-0.5 rounded border border-line bg-bg/60 p-1">
					{visibleSamples.map((sample, index) => (
						<div key={`${sample.time}.brk.${index}`} className="flex-1 rounded-t bg-f1-red/80" style={{ height: `${clamp(sample.brake, 3, 100)}%` }} />
					))}
				</div>
			</div>
		</div>
	);
};

const getSectorTone = (status?: SectorStatus): Tone => {
	if (status === "overall") return "purple";
	if (status === "personal") return "accent";
	if (status === "completed") return "warning";
	return "muted";
};

const getSectorLabel = (status?: SectorStatus) => {
	if (status === "overall") return "PURPLE";
	if (status === "personal") return "PB";
	if (status === "completed") return "SET";
	return "WAIT";
};

const getCompoundTone = (compound?: string): Tone => {
	if (compound === "SOFT") return "danger";
	if (compound === "MEDIUM") return "warning";
	if (compound === "INTERMEDIATE") return "accent";
	return compound ? "muted" : "muted";
};

const StintPanel = ({ stintSummary }: { stintSummary: StintSummary | null }) => {
	const compound = stintSummary?.compound ?? "NO FEED";
	const stintRange = stintSummary?.lapStart ? `L${stintSummary.lapStart}-${stintSummary.lapEnd ?? "--"}` : "NO STINT";

	return (
		<div className="mb-5 rounded-lg border border-line bg-panel-alt/40 p-3">
			<div className="mb-3 flex items-center justify-between">
				<span className="text-[10px] font-bold tracking-widest text-muted">STINT / TYRE</span>
				<span className="text-[10px] font-bold text-muted">{stintRange}</span>
			</div>
			<div className="grid grid-cols-3 gap-2">
				<SystemTile label="COMPOUND" value={compound} meta={stintSummary?.stintNumber ? `STINT ${stintSummary.stintNumber}` : "NO DATA"} tone={getCompoundTone(stintSummary?.compound)} />
				<SystemTile label="TYRE AGE" value={Number.isFinite(stintSummary?.tyreAge) ? `${stintSummary?.tyreAge}L` : "--"} meta="CURRENT" tone={(stintSummary?.tyreAge ?? 0) >= 18 ? "warning" : "accent"} />
				<SystemTile label="STINT LAP" value={Number.isFinite(stintSummary?.stintLap) ? `${stintSummary?.stintLap}` : "--"} meta="RUN" tone="muted" />
			</div>
		</div>
	);
};

const LapSectorPanel = ({ lapSummary }: { lapSummary: LapSummary | null }) => (
	<div className="mb-5 rounded-lg border border-line bg-panel-alt/40 p-3">
		<div className="mb-3 flex items-center justify-between">
			<span className="text-[10px] font-bold tracking-widest text-muted">LAP / SECTOR</span>
			<div className="flex items-center gap-2">
				{lapSummary?.sectorsSource === "last" && <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[8px] font-black text-warning">LAST</span>}
				<span className="text-[10px] font-bold text-accent">{lapSummary?.currentLap ? `L${lapSummary.currentLap}` : "NO LAP"}</span>
			</div>
		</div>
		<div className="mb-3 grid grid-cols-3 gap-2">
			<SystemTile label="LAST" value={formatLapTime(lapSummary?.lastLapTime)} meta={lapSummary?.lastLap ? `LAP ${lapSummary.lastLap}` : "NO TIME"} tone={lapSummary?.lastLapTime ? "warning" : "muted"} />
			<SystemTile label="BEST" value={formatLapTime(lapSummary?.bestLapTime)} meta={lapSummary?.bestLap ? `LAP ${lapSummary.bestLap}` : "NO TIME"} tone={lapSummary?.bestLapTime ? "accent" : "muted"} />
			<SystemTile label="DELTA" value={formatDelta(lapSummary?.deltaToBest)} meta="TO BEST" tone={(lapSummary?.deltaToBest ?? 0) > 0.001 ? "warning" : "accent"} />
		</div>
		<div className="grid grid-cols-3 gap-2">
			{[1, 2, 3].map((sector) => {
				const snapshot = lapSummary?.sectors?.[sector - 1];
				const tone = getSectorTone(snapshot?.status);
				return (
					<div key={sector} className={`rounded-lg border px-2 py-2 ${toneClass[tone]}`}>
						<div className="flex items-center justify-between gap-2">
							<span className="text-[9px] font-bold text-muted">S{sector}</span>
							<span className="text-[8px] font-black">{getSectorLabel(snapshot?.status)}</span>
						</div>
						<div className="mt-1 text-sm font-bold tabular-nums">{formatLapTime(snapshot?.value)}</div>
						<div className="mt-0.5 text-[8px] font-bold text-muted tabular-nums">{formatDelta(snapshot?.deltaToPersonal)} PB</div>
					</div>
				);
			})}
		</div>
		{lapSummary?.sectorsSource === "last" && lapSummary.sectorsLap && (
			<div className="mt-2 text-[9px] font-bold uppercase tracking-widest text-muted">Showing completed lap {lapSummary.sectorsLap} until current S1 is set</div>
		)}
	</div>
);

type Props = {
	focusedCode: string;
	lapSummary: LapSummary | null;
	sourceMessage: string;
	sourceStatus: DataSourceStatus;
	stintSummary: StintSummary | null;
	telemetry: Telemetry;
	weather: WeatherSnapshot | null;
};

const TelemetryPanel = ({ focusedCode, lapSummary, sourceMessage, sourceStatus, stintSummary, telemetry, weather }: Props) => {
	const rpm = telemetry.rpm ?? 0;
	const rpmLoad = rpm > 0 ? clamp((rpm / 12000) * 100, 0, 100) : 0;
	const aeroEstimate = getAeroEstimate(telemetry);
	const energyEstimate = getEnergyEstimate(telemetry);
	const lapPhase = getLapPhase(telemetry);
	const estimatedKw = energyEstimate.label === "DEPLOY" ? Math.round((energyEstimate.value / 100) * 350) : 0;
	const { samples: traceSamples, previousSample } = updateTelemetryTrace(telemetry);
	const speedDelta = previousSample?.driverNumber === telemetry.driverNumber ? telemetry.speed - previousSample.speed : 0;
	const speedDeltaLabel = `${speedDelta >= 0 ? "+" : ""}${Math.round(speedDelta)} KM/H`;
	const speedDeltaTone = speedDelta > 2 ? "accent" : speedDelta < -2 ? "danger" : "muted";

	return (
		<div className="col-span-3 bg-panel rounded-xl border border-line p-4 flex flex-col transition-all duration-300 min-h-0 overflow-y-auto custom-scrollbar">
			<div className="flex items-start justify-between gap-3 mb-4">
				<h2 className="text-muted text-xs font-bold tracking-widest">2026 TELEMETRY ({focusedCode})</h2>
				<span className={sourceStatus === "error" ? "text-f1-red text-[10px] font-bold uppercase" : "text-muted text-[10px] font-bold uppercase"}>
					{sourceStatus}
				</span>
			</div>
			<div className="mb-4 min-h-8 text-[10px] text-muted uppercase leading-relaxed">{sourceMessage}</div>

			<div className="grid grid-cols-2 gap-3 mb-5">
				<div>
					<div className="text-4xl font-bold transition-all duration-100">
						{telemetry.speed}
						<span className="text-sm text-muted">KM/H</span>
					</div>
					<div className="text-xs text-muted mt-1">SPEED</div>
				</div>
				<div className="text-right">
					<div className="text-4xl font-bold text-accent transition-all duration-100">{telemetry.gear}</div>
					<div className="text-xs text-muted mt-1">GEAR</div>
				</div>
			</div>

			<div className="mb-5 grid grid-cols-2 gap-2">
				<SystemTile label="PHASE" value={lapPhase.label} meta={lapPhase.meta} tone={lapPhase.tone} />
				<SystemTile label="SPEED DELTA" value={speedDeltaLabel} meta="LAST SAMPLE" tone={speedDeltaTone} />
			</div>

			<LapSectorPanel lapSummary={lapSummary} />
			<StintPanel stintSummary={stintSummary} />
			<MiniTrace samples={traceSamples} />

			<div className="space-y-4">
				<TelemetryBar label="THROTTLE" value={telemetry.throttle} colorClass="bg-accent shadow-[0_0_8px_#33E6A1]" />
				<TelemetryBar label="BRAKE" value={telemetry.brake} colorClass="bg-f1-red shadow-[0_0_8px_#FF1801]" />
				<TelemetryBar label="RPM LOAD" value={rpmLoad} colorClass="bg-warning shadow-[0_0_8px_#F5C86A]" />
			</div>

			<div className="mt-5 grid grid-cols-2 gap-2">
				<SystemTile label="RPM" value={rpm > 0 ? rpm.toLocaleString() : "NO FEED"} meta="CAR DATA" tone={rpm > 0 ? "warning" : "muted"} />
				<SystemTile label="AERO" value={aeroEstimate.label} meta={aeroEstimate.confidence} tone={aeroEstimate.tone} />
				<SystemTile label="ENERGY" value={energyEstimate.label} meta={energyEstimate.caption} tone={energyEstimate.tone} />
				<SystemTile label="OVERRIDE" value="NO FEED" meta="DETECTION GAP" tone="muted" />
			</div>

			<div className="mt-5 rounded-lg border border-line bg-panel-alt/40 p-3">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-[10px] text-muted font-bold tracking-widest">WEATHER</span>
					<span className={`text-[10px] font-bold ${weather?.rainfall ? "text-warning" : "text-accent"}`}>{weather?.rainfall ? "RAIN" : weather ? "DRY" : "NO FEED"}</span>
				</div>
				<div className="grid grid-cols-4 gap-2 text-center">
					<div>
						<div className="text-sm font-bold">{weather ? `${weather.airTemperature.toFixed(1)}°` : "--"}</div>
						<div className="text-[9px] text-muted">AIR</div>
					</div>
					<div>
						<div className="text-sm font-bold">{weather ? `${weather.trackTemperature.toFixed(1)}°` : "--"}</div>
						<div className="text-[9px] text-muted">TRACK</div>
					</div>
					<div>
						<div className="text-sm font-bold">{weather ? `${Math.round(weather.humidity)}%` : "--"}</div>
						<div className="text-[9px] text-muted">HUM</div>
					</div>
					<div>
						<div className="text-sm font-bold">{weather ? `${weather.windSpeed.toFixed(1)}` : "--"}</div>
						<div className="text-[9px] text-muted">WIND</div>
					</div>
				</div>
			</div>

			<div className="mt-5 border border-line rounded-lg bg-panel-alt/50 p-3">
				<div className="flex items-center justify-between mb-2">
					<span className="text-[10px] text-muted font-bold tracking-widest">MGU-K WINDOW</span>
					<span className="text-[10px] text-accent font-bold">{estimatedKw > 0 ? `${estimatedKw} KW EST.` : "STANDBY"}</span>
				</div>
				<div className="h-16 flex items-end gap-1 opacity-80">
					{mguWindowBars.map((multiplier, i) => {
						const wave = energyEstimate.value * multiplier;
						return <div key={i} className="flex-1 rounded-t bg-accent/70" style={{ height: `${clamp(wave, 8, 100)}%` }} />;
					})}
				</div>
			</div>
		</div>
	);
};

export default memo(TelemetryPanel);

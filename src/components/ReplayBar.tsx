import { memo } from "react";

import type { AppMode, ReplayControlState, TrackFlag } from "../types/ipc";

type PopupType = "info" | "penalty" | "investigation" | "overtake";

type Props = {
	focusedCode: string;
	focusedDriverNumber: string;
	mode: AppMode;
	replayControl: ReplayControlState;
	replayTime: string;
	developerModeEnabled: boolean;
	onJumpReplay: (seconds: number) => void;
	onManualTrackFlag: (flag: TrackFlag) => void;
	onReplayPlayingChange: (isPlaying: boolean) => void;
	onReplaySpeedChange: (speed: number) => void;
	onSeekReplay: (progress: number) => void;
	onShowPopup: (type: PopupType, title: string, text: string) => void;
};

const ReplayBar = ({
	focusedCode,
	focusedDriverNumber,
	mode,
	replayControl,
	replayTime,
	developerModeEnabled,
	onJumpReplay,
	onManualTrackFlag,
	onReplayPlayingChange,
	onReplaySpeedChange,
	onSeekReplay,
	onShowPopup,
}: Props) => (
	<div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-1.5 bg-panel p-2 rounded-xl border border-line z-50 overflow-hidden">
		<span className="text-xs text-muted font-bold mr-2 uppercase">Replay:</span>
		<button
			onClick={() => onReplayPlayingChange(!replayControl.isPlaying)}
			disabled={mode !== "archive"}
			className="w-9 h-7 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
			aria-label={replayControl.isPlaying ? "Pause replay" : "Play replay"}
		>
			{replayControl.isPlaying ? "II" : ">"}
		</button>
		{[0.5, 1, 2, 4].map((speed) => (
			<button
				key={speed}
				onClick={() => onReplaySpeedChange(speed)}
				disabled={mode !== "archive"}
				className={`px-2 py-1 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer ${
					replayControl.speed === speed ? "text-accent border-accent/60" : ""
				}`}
			>
				{speed}x
			</button>
		))}
		<button
			onClick={() => onJumpReplay(-10)}
			disabled={mode !== "archive" || replayControl.total === 0}
			className="px-2 py-1 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer"
		>
			-10s
		</button>
		<input
			aria-label="Replay timeline"
			type="range"
			min={0}
			max={1000}
			value={Math.round(replayControl.progress * 1000)}
			disabled={mode !== "archive" || replayControl.total === 0}
			onChange={(event) => onSeekReplay(Number(event.target.value) / 1000)}
			className="w-36 accent-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
		/>
		<button
			onClick={() => onJumpReplay(10)}
			disabled={mode !== "archive" || replayControl.total === 0}
			className="px-2 py-1 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer"
		>
			+10s
		</button>
		<span className="w-12 text-[10px] text-muted tabular-nums">
			{replayControl.total > 0 ? `${Math.round(replayControl.progress * 100)}%` : "--"}
		</span>
		<span className="w-16 text-[10px] text-muted tabular-nums">{replayTime}</span>
		<span className="w-20 text-[10px] text-muted tabular-nums">
			{replayControl.total > 0 ? `${replayControl.currentIndex}/${replayControl.total}` : "0/0"}
		</span>
		{developerModeEnabled && (
			<>
				<div className="w-px h-6 bg-line mx-1.5" />
				<span className="text-xs text-warning font-bold mr-1 uppercase">Dev Sim:</span>
				{(["Green", "Yellow", "Red", "SC", "Chequered"] satisfies TrackFlag[]).map((flag) => (
					<button key={flag} onClick={() => onManualTrackFlag(flag)} className="px-2.5 py-1 bg-panel-alt hover:bg-line border border-line rounded text-xs font-bold transition-colors uppercase cursor-pointer">
						{flag}
					</button>
				))}
				<div className="w-px h-6 bg-line mx-1.5" />
				<button onClick={() => onShowPopup("overtake", "RACE CONTROL", "OVERTAKE MODE ENABLED")} className="px-2.5 py-1 bg-accent/20 text-accent hover:bg-accent/40 border border-accent/50 rounded text-xs font-bold uppercase cursor-pointer">
					Overtake
				</button>
				<button onClick={() => onShowPopup("investigation", "INCIDENT", `CAR ${focusedDriverNumber} (${focusedCode}) UNDER INVESTIGATION`)} className="px-2.5 py-1 bg-warning/20 text-warning hover:bg-warning/40 border border-warning/50 rounded text-xs font-bold uppercase cursor-pointer">
					Investigate
				</button>
				<button onClick={() => onShowPopup("penalty", "PENALTY", `5 SECOND TIME PENALTY FOR CAR ${focusedDriverNumber} (${focusedCode}) - TRACK LIMITS`)} className="px-2.5 py-1 bg-f1-red/20 text-f1-red hover:bg-f1-red/40 border border-f1-red/50 rounded text-xs font-bold uppercase cursor-pointer">
					Penalty
				</button>
			</>
		)}
		{!developerModeEnabled && (
			<span className="ml-2 rounded border border-line bg-bg px-2 py-1 text-[10px] font-bold uppercase text-muted">
				Dev locked
			</span>
		)}
	</div>
);

export default memo(ReplayBar);

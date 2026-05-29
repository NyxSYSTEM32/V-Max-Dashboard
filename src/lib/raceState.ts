import type {
	AppMode,
	DataSourceStatus,
	DriverMap,
	DriverPositions,
	F1DataEvent,
	LeaderboardEntry,
	LapSummary,
	LiveHealth,
	PerformanceEvent,
	PitEvent,
	RaceControlMessage,
	ReplayControlState,
	StintSummary,
	TeamRadioMessage,
	Telemetry,
	TrackBounds,
	TrackFlag,
	TrackPathPoint,
	WeatherSnapshot,
} from "../types/ipc";

export type RaceState = {
	mode: AppMode;
	sourceStatus: DataSourceStatus;
	sourceMessage: string;
	liveHealth: LiveHealth;
	liveHealthLabel: string;
	focusedDriverNumber: string;
	telemetry: Telemetry;
	trackFlag: TrackFlag;
	leaderboard: LeaderboardEntry[];
	drivers: DriverMap;
	positions: DriverPositions;
	trackBounds: TrackBounds | null;
	trackPath: TrackPathPoint[];
	raceControlMessages: RaceControlMessage[];
	teamRadioMessages: TeamRadioMessage[];
	teamRadioAlertMessages: TeamRadioMessage[];
	performanceEvents: PerformanceEvent[];
	pitEvents: PitEvent[];
	totalLaps: number | null;
	weather: WeatherSnapshot | null;
	lapSummary: LapSummary | null;
	stintSummary: StintSummary | null;
	replayControl: ReplayControlState;
};

export type RaceAction =
	| { type: "reset"; mode?: AppMode }
	| { type: "set-mode"; mode: AppMode }
	| { type: "set-focused-driver"; driverNumber: string }
	| { type: "manual-track-flag"; flag: TrackFlag }
	| { type: "event"; event: F1DataEvent };

export const DEFAULT_FOCUSED_DRIVER = "1";
export const DEFAULT_TELEMETRY: Telemetry = { driverNumber: DEFAULT_FOCUSED_DRIVER, speed: 0, gear: 0, throttle: 0, brake: 0 };
export const DEFAULT_REPLAY_CONTROL: ReplayControlState = { isPlaying: false, speed: 1, currentIndex: 0, total: 0, progress: 0 };

export const createInitialRaceState = (mode: AppMode = "archive"): RaceState => ({
	mode,
	sourceStatus: "idle",
	sourceMessage: "Waiting for data source",
	liveHealth: "idle",
	liveHealthLabel: "NO SESSION",
	focusedDriverNumber: DEFAULT_FOCUSED_DRIVER,
	telemetry: DEFAULT_TELEMETRY,
	trackFlag: "Green",
	leaderboard: [],
	drivers: {},
	positions: {},
	trackBounds: null,
	trackPath: [],
	raceControlMessages: [],
	teamRadioMessages: [],
	teamRadioAlertMessages: [],
	performanceEvents: [],
	pitEvents: [],
	totalLaps: null,
	weather: null,
	lapSummary: null,
	stintSummary: null,
	replayControl: DEFAULT_REPLAY_CONTROL,
});

export const resetRaceState = (current: RaceState, mode = current.mode): RaceState => ({
	...createInitialRaceState(mode),
	sourceStatus: "connecting",
	sourceMessage: mode === "live" ? "Connecting to live timing" : "Loading local replay",
	liveHealth: mode === "live" ? "degraded" : "idle",
	liveHealthLabel: mode === "live" ? "CONNECTING" : "REPLAY",
});

const areTrackBoundsEqual = (a: TrackBounds | null, b: TrackBounds | null | undefined) => {
	if (b === undefined) return true;
	if (a === null || b === null) return a === b;
	return a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;
};

const areTrackPathsEqual = (a: TrackPathPoint[], b: TrackPathPoint[] | undefined) => {
	if (!b) return true;
	if (a.length !== b.length) return false;
	const firstA = a[0];
	const firstB = b[0];
	const lastA = a[a.length - 1];
	const lastB = b[b.length - 1];
	return firstA?.x === firstB?.x && firstA?.y === firstB?.y && lastA?.x === lastB?.x && lastA?.y === lastB?.y;
};

export const reduceRaceState = (state: RaceState, action: RaceAction): RaceState => {
	if (action.type === "reset") {
		return resetRaceState(state, action.mode);
	}

	if (action.type === "set-mode") {
		return resetRaceState(state, action.mode);
	}

	if (action.type === "manual-track-flag") {
		return { ...state, trackFlag: action.flag };
	}

	if (action.type === "set-focused-driver") {
		return {
			...state,
			focusedDriverNumber: action.driverNumber,
			telemetry: { ...state.telemetry, driverNumber: action.driverNumber },
			teamRadioMessages: [],
			teamRadioAlertMessages: [],
		};
	}

	const event = action.event;

	if (event.type === "race-frame") {
		const trackBounds = areTrackBoundsEqual(state.trackBounds, event.trackBounds) ? state.trackBounds : (event.trackBounds ?? state.trackBounds);
		const trackPath = areTrackPathsEqual(state.trackPath, event.trackPath) ? state.trackPath : (event.trackPath ?? state.trackPath);

		return {
			...state,
			sourceStatus: state.sourceStatus === "connecting" || state.sourceStatus === "idle" ? "ready" : state.sourceStatus,
			sourceMessage:
				state.sourceStatus === "connecting" || state.sourceStatus === "idle"
					? getDefaultSourceMessage(state.mode, "ready")
					: state.sourceMessage,
			telemetry: event.telemetry,
			focusedDriverNumber: event.telemetry.driverNumber,
			leaderboard: event.leaderboard,
			drivers: event.drivers,
			positions: event.positions,
			trackBounds,
			trackPath,
			trackFlag: event.trackFlag ?? state.trackFlag,
			raceControlMessages: event.raceControlMessages ?? state.raceControlMessages,
			teamRadioMessages: event.teamRadioMessages ?? state.teamRadioMessages,
			teamRadioAlertMessages: event.teamRadioAlertMessages ?? state.teamRadioAlertMessages,
			performanceEvents: event.performanceEvents ?? state.performanceEvents,
			pitEvents: event.pitEvents ?? state.pitEvents,
			totalLaps: event.totalLaps ?? state.totalLaps,
			weather: event.weather !== undefined ? event.weather : state.weather,
			lapSummary: event.lapSummary !== undefined ? event.lapSummary : state.lapSummary,
			stintSummary: event.stintSummary !== undefined ? event.stintSummary : state.stintSummary,
			replayControl: event.replayControl ?? state.replayControl,
		};
	}

	if (event.type === "telemetry") {
		return {
			...state,
			telemetry: {
				driverNumber: event.driverNumber,
				speed: event.speed,
				gear: event.gear,
				throttle: event.throttle,
				brake: event.brake,
				rpm: event.rpm,
			},
			focusedDriverNumber: event.driverNumber,
			leaderboard: event.leaderboard ?? state.leaderboard,
		};
	}

	if (event.type === "driver-focus") {
		return {
			...state,
			focusedDriverNumber: event.driverNumber,
			telemetry: { ...state.telemetry, driverNumber: event.driverNumber },
		};
	}

	if (event.type === "track-status") {
		return { ...state, trackFlag: event.flag };
	}

	if (event.type === "race-control") {
		return {
			...state,
			trackFlag: event.trackFlag ?? state.trackFlag,
			raceControlMessages: event.messages,
		};
	}

	if (event.type === "map-data") {
		const trackBounds = areTrackBoundsEqual(state.trackBounds, event.trackBounds) ? state.trackBounds : (event.trackBounds ?? state.trackBounds);
		const trackPath = areTrackPathsEqual(state.trackPath, event.trackPath) ? state.trackPath : (event.trackPath ?? state.trackPath);

		return {
			...state,
			drivers: event.drivers ?? state.drivers,
			positions: event.positions ?? state.positions,
			trackBounds,
			trackPath,
		};
	}

	if (event.type === "replay-control") {
		return { ...state, replayControl: event.control };
	}

	if (event.mode !== state.mode && event.status !== "connecting") {
		return state;
	}

	return {
		...state,
		mode: event.mode,
		sourceStatus: event.status,
		sourceMessage: event.message ?? getDefaultSourceMessage(event.mode, event.status),
		liveHealth: event.liveHealth ?? (event.mode === "live" ? getDefaultLiveHealth(event.status) : "idle"),
		liveHealthLabel: event.liveHealthLabel ?? (event.mode === "live" ? getDefaultLiveHealthLabel(event.status) : "REPLAY"),
	};
};

export const getDefaultSourceMessage = (mode: AppMode, status: DataSourceStatus) => {
	if (status === "connecting") return mode === "live" ? "Connecting to live timing" : "Loading local replay";
	if (status === "ready") return mode === "live" ? "Live timing connected" : "Local replay running";
	if (status === "error") return mode === "live" ? "Live timing failed" : "Local replay failed";
	if (status === "stopped") return "Data source stopped";
	return "Waiting for data source";
};

export const getDefaultLiveHealth = (status: DataSourceStatus): LiveHealth => {
	if (status === "ready") return "healthy";
	if (status === "connecting") return "degraded";
	if (status === "error") return "poor";
	return "idle";
};

export const getDefaultLiveHealthLabel = (status: DataSourceStatus) => {
	if (status === "ready") return "HEALTHY";
	if (status === "connecting") return "CONNECTING";
	if (status === "error") return "OFFLINE";
	if (status === "stopped") return "STOPPED";
	return "NO SESSION";
};

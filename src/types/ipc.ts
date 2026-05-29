export type AppMode = "live" | "archive";

export type TrackFlag = "Green" | "Yellow" | "Red" | "SC" | "VSC" | "VSC Ending" | "Chequered";

export type Telemetry = {
	driverNumber: string;
	speed: number;
	gear: number;
	throttle: number;
	brake: number;
	rpm?: number;
};

export type LeaderboardEntry = {
	pos: number | string;
	driverNumber: string;
	driver: string;
	gap: string;
	color: string;
	speed?: number;
	gear?: number;
	dataStatus?: string;
	positionSource?: string;
	gapSource?: string;
	lap?: number;
	compound?: string;
	tyreAge?: number;
};

export type ReplaySession = {
	session_key: number;
	session_name: string;
	year: number;
	country_name?: string;
	date_start?: string;
	circuit_key?: number;
	circuit_short_name?: string;
	driver_count?: number;
	telemetry_records?: number;
	location_records?: number;
	position_records?: number;
	interval_records?: number;
	lap_records?: number;
	stint_records?: number;
	race_control_records?: number;
};

export type DriverMapEntry = {
	RacingNumber: string;
	BroadcastName?: string;
	Tla: string;
	TeamColour?: string;
	TeamName?: string;
	FullName?: string;
};

export type DriverMap = Record<string, DriverMapEntry>;

export type DriverPosition = {
	x?: number;
	y?: number;
	X?: number;
	Y?: number;
	Z?: number;
};

export type DriverPositions = Record<string, DriverPosition>;

export type TrackBounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

export type TrackPathPoint = {
	x: number;
	y: number;
};

export type RaceControlMessage = {
	date: string;
	lap?: number;
	message: string;
	category?: string;
	flag?: string;
	scope?: string;
	sector?: number;
	driverNumber?: string;
};

export type DataSourceStatus = "idle" | "connecting" | "ready" | "error" | "stopped";

export type ReplayControlState = {
	isPlaying: boolean;
	speed: number;
	currentIndex: number;
	total: number;
	progress: number;
	currentTimestamp?: string;
};

export type ReplayCommand =
	| { type: "play" }
	| { type: "pause" }
	| { type: "set-speed"; speed: number }
	| { type: "seek"; progress: number }
	| { type: "jump"; seconds: number };

export type F1DataEvent =
	| {
			type: "race-frame";
			telemetry: Telemetry;
			leaderboard: LeaderboardEntry[];
			drivers: DriverMap;
			positions: DriverPositions;
			trackBounds?: TrackBounds | null;
			trackPath?: TrackPathPoint[];
			trackFlag?: TrackFlag;
			raceControlMessages?: RaceControlMessage[];
			replayControl?: ReplayControlState;
	  }
	| {
			type: "telemetry";
			driverNumber: string;
			speed: number;
			gear: number;
			throttle: number;
			brake: number;
			rpm?: number;
			leaderboard?: LeaderboardEntry[];
	  }
	| {
			type: "track-status";
			flag: TrackFlag;
	  }
	| {
			type: "map-data";
			drivers?: DriverMap;
			positions?: DriverPositions;
			trackBounds?: TrackBounds | null;
			trackPath?: TrackPathPoint[];
	  }
	| {
			type: "race-control";
			trackFlag?: TrackFlag;
			messages: RaceControlMessage[];
	  }
	| {
			type: "source-status";
			mode: AppMode;
			status: DataSourceStatus;
			message?: string;
	  }
	| {
			type: "replay-control";
			control: ReplayControlState;
	  }
	| {
			type: "driver-focus";
			driverNumber: string;
	  };

export type ElectronAPI = {
	onF1Data: (callback: (data: F1DataEvent) => void) => () => void;
	setMode: (mode: AppMode) => void;
	getSessions: () => Promise<ReplaySession[]>;
	setReplaySession: (sessionKey: number) => void;
	setReplayControl: (command: ReplayCommand) => void;
	setFocusedDriver: (driverNumber: string) => void;
};

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
	sectors?: SectorSnapshot[];
};

export type SectorStatus = "none" | "completed" | "personal" | "overall";

export type SectorSnapshot = {
	sector: number;
	status: SectorStatus;
	value?: number;
	lap?: number;
	bestPersonal?: number;
	bestOverall?: number;
	deltaToPersonal?: number;
	deltaToOverall?: number;
};

export type LapSummary = {
	driverNumber: string;
	currentLap?: number;
	lastLap?: number;
	lastLapTime?: number;
	bestLap?: number;
	bestLapTime?: number;
	deltaToBest?: number;
	sectorsLap?: number;
	sectorsSource?: "current" | "last";
	sectors: SectorSnapshot[];
};

export type PerformanceEventType = "fastest-lap" | "personal-lap" | "purple-sector";

export type PerformanceEvent = {
	id: string;
	type: PerformanceEventType;
	date: string;
	driverNumber: string;
	lap: number;
	sector?: number;
	value: number;
	delta?: number;
};

export type PitEvent = {
	id: string;
	date: string;
	driverNumber: string;
	lap: number;
	stintNumber: number;
	compound: string;
	tyreAgeAtStart: number;
};

export type StintSummary = {
	driverNumber: string;
	stintNumber?: number;
	compound?: string;
	lapStart?: number;
	lapEnd?: number;
	stintLap?: number;
	tyreAge?: number;
	tyreAgeAtStart?: number;
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
	team_radio_records?: number;
	weather_records?: number;
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

export type TeamRadioMessage = {
	date: string;
	driverNumber: string;
	recordingUrl: string;
};

export type WeatherSnapshot = {
	date: string;
	airTemperature: number;
	trackTemperature: number;
	humidity: number;
	pressure: number;
	rainfall: number;
	windDirection: number;
	windSpeed: number;
};

export type DataSourceStatus = "idle" | "connecting" | "ready" | "error" | "stopped";
export type LiveHealth = "idle" | "healthy" | "degraded" | "poor";

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
			teamRadioMessages?: TeamRadioMessage[];
			teamRadioAlertMessages?: TeamRadioMessage[];
			performanceEvents?: PerformanceEvent[];
			pitEvents?: PitEvent[];
			totalLaps?: number;
			weather?: WeatherSnapshot | null;
			lapSummary?: LapSummary | null;
			stintSummary?: StintSummary | null;
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
			liveHealth?: LiveHealth;
			liveHealthLabel?: string;
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
	openExternalUrl: (url: string) => Promise<boolean>;
	setReplaySession: (sessionKey: number) => void;
	setReplayControl: (command: ReplayCommand) => void;
	setFocusedDriver: (driverNumber: string) => void;
	setDiscordPresenceEnabled: (enabled: boolean) => void;
};

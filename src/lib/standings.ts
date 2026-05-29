export type StandingsSource = "openf1" | "cache" | "fallback";

export type DriverStanding = {
	pos: number;
	previousPos: number;
	driverNumber: string;
	driver: string;
	acronym: string;
	team: string;
	color: string;
	points: number;
	pointsStart: number;
	pointsGained: number;
	trend: "up" | "down" | "same";
};

export type ConstructorStanding = {
	pos: number;
	previousPos: number;
	team: string;
	color: string;
	points: number;
	pointsStart: number;
	pointsGained: number;
	gap: string;
	drivers: string[];
	trend: "up" | "down" | "same";
};

export type ChampionshipStandings = {
	drivers: DriverStanding[];
	constructors: ConstructorStanding[];
	sessionKey: number | null;
	meetingKey: number | null;
	source: StandingsSource;
	updatedAt: string;
};

type OpenF1DriverStanding = {
	meeting_key: number;
	session_key: number;
	driver_number: number;
	position_start: number;
	position_current: number;
	points_start: number;
	points_current: number;
};

type OpenF1TeamStanding = {
	meeting_key: number;
	session_key: number;
	team_name: string;
	position_start: number;
	position_current: number;
	points_start: number;
	points_current: number;
};

type OpenF1Driver = {
	driver_number: number;
	full_name?: string;
	name_acronym?: string;
	team_name?: string;
	team_colour?: string;
};

const CACHE_KEY = "vmax.championshipStandings.v1";
const OPENF1 = "https://api.openf1.org/v1";

const fallbackDrivers: DriverStanding[] = [
	{ pos: 1, previousPos: 1, driverNumber: "12", driver: "Andrea Kimi Antonelli", acronym: "ANT", team: "Mercedes", color: "#27F4D2", points: 131, pointsStart: 106, pointsGained: 25, trend: "same" },
	{ pos: 2, previousPos: 2, driverNumber: "63", driver: "George Russell", acronym: "RUS", team: "Mercedes", color: "#27F4D2", points: 88, pointsStart: 88, pointsGained: 0, trend: "same" },
	{ pos: 3, previousPos: 3, driverNumber: "16", driver: "Charles Leclerc", acronym: "LEC", team: "Ferrari", color: "#E8002D", points: 75, pointsStart: 63, pointsGained: 12, trend: "same" },
];

const fallbackConstructors: ConstructorStanding[] = [
	{ pos: 1, previousPos: 1, team: "Mercedes", color: "#27F4D2", points: 219, pointsStart: 194, pointsGained: 25, gap: "Leader", drivers: ["ANT", "RUS"], trend: "same" },
	{ pos: 2, previousPos: 2, team: "Ferrari", color: "#E8002D", points: 147, pointsStart: 117, pointsGained: 30, gap: "-72", drivers: ["LEC", "HAM"], trend: "same" },
	{ pos: 3, previousPos: 3, team: "McLaren", color: "#F47600", points: 106, pointsStart: 106, pointsGained: 0, gap: "-113", drivers: ["NOR", "PIA"], trend: "same" },
];

const normalizeColor = (value?: string) => (value ? `#${value.replace("#", "")}` : "#747D8C");

const getTrend = (positionStart: number, positionCurrent: number): "up" | "down" | "same" => {
	if (positionCurrent < positionStart) return "up";
	if (positionCurrent > positionStart) return "down";
	return "same";
};

const formatName = (value?: string) => {
	if (!value) return "Unknown Driver";
	return value
		.toLowerCase()
		.split(" ")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
};

export const loadCachedStandings = (): ChampionshipStandings | null => {
	try {
		const raw = window.localStorage.getItem(CACHE_KEY);
		return raw ? (JSON.parse(raw) as ChampionshipStandings) : null;
	} catch {
		return null;
	}
};

export const saveCachedStandings = (standings: ChampionshipStandings) => {
	window.localStorage.setItem(CACHE_KEY, JSON.stringify(standings));
};

export const createFallbackStandings = (): ChampionshipStandings => ({
	drivers: fallbackDrivers,
	constructors: fallbackConstructors,
	sessionKey: 11291,
	meetingKey: 1285,
	source: "fallback",
	updatedAt: new Date().toISOString(),
});

export const fetchOpenF1Standings = async (sessionKey: number | "latest" = "latest"): Promise<ChampionshipStandings> => {
	const query = `session_key=${sessionKey}`;
	const [driverStandingsResponse, teamStandingsResponse, driversResponse] = await Promise.all([
		fetch(`${OPENF1}/championship_drivers?${query}`),
		fetch(`${OPENF1}/championship_teams?${query}`),
		fetch(`${OPENF1}/drivers?${query}`),
	]);

	if (!driverStandingsResponse.ok) throw new Error(`Driver standings failed: ${driverStandingsResponse.status}`);
	if (!teamStandingsResponse.ok) throw new Error(`Team standings failed: ${teamStandingsResponse.status}`);
	if (!driversResponse.ok) throw new Error(`Drivers failed: ${driversResponse.status}`);

	const [driverStandings, teamStandings, drivers] = await Promise.all([
		driverStandingsResponse.json() as Promise<OpenF1DriverStanding[]>,
		teamStandingsResponse.json() as Promise<OpenF1TeamStanding[]>,
		driversResponse.json() as Promise<OpenF1Driver[]>,
	]);

	const driverByNumber = new Map(drivers.map((driver) => [driver.driver_number, driver]));
	const teamDrivers = new Map<string, string[]>();
	const teamColors = new Map<string, string>();

	drivers.forEach((driver) => {
		if (!driver.team_name) return;
		const acronym = driver.name_acronym ?? String(driver.driver_number);
		teamDrivers.set(driver.team_name, [...(teamDrivers.get(driver.team_name) ?? []), acronym]);
		teamColors.set(driver.team_name, normalizeColor(driver.team_colour));
	});

	const normalizedDrivers = driverStandings
		.map((standing) => {
			const driver = driverByNumber.get(standing.driver_number);
			const points = Number(standing.points_current) || 0;
			const pointsStart = Number(standing.points_start) || 0;

			return {
				pos: Number(standing.position_current) || 0,
				previousPos: Number(standing.position_start) || 0,
				driverNumber: String(standing.driver_number),
				driver: formatName(driver?.full_name),
				acronym: driver?.name_acronym ?? String(standing.driver_number),
				team: driver?.team_name ?? "Unknown Team",
				color: normalizeColor(driver?.team_colour),
				points,
				pointsStart,
				pointsGained: points - pointsStart,
				trend: getTrend(Number(standing.position_start), Number(standing.position_current)),
			} satisfies DriverStanding;
		})
		.sort((a, b) => a.pos - b.pos);

	const leaderPoints = Math.max(...teamStandings.map((standing) => Number(standing.points_current) || 0), 0);
	const normalizedConstructors = teamStandings
		.map((standing) => {
			const points = Number(standing.points_current) || 0;
			const pointsStart = Number(standing.points_start) || 0;
			const gap = leaderPoints === points ? "Leader" : `-${leaderPoints - points}`;

			return {
				pos: Number(standing.position_current) || 0,
				previousPos: Number(standing.position_start) || 0,
				team: standing.team_name,
				color: teamColors.get(standing.team_name) ?? "#747D8C",
				points,
				pointsStart,
				pointsGained: points - pointsStart,
				gap,
				drivers: teamDrivers.get(standing.team_name) ?? [],
				trend: getTrend(Number(standing.position_start), Number(standing.position_current)),
			} satisfies ConstructorStanding;
		})
		.sort((a, b) => a.pos - b.pos);

	return {
		drivers: normalizedDrivers,
		constructors: normalizedConstructors,
		sessionKey: driverStandings[0]?.session_key ?? teamStandings[0]?.session_key ?? null,
		meetingKey: driverStandings[0]?.meeting_key ?? teamStandings[0]?.meeting_key ?? null,
		source: "openf1",
		updatedAt: new Date().toISOString(),
	};
};

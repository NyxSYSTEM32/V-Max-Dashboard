import { memo, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { fetchMap } from "../lib/fetchMap";
import { createSectors, findYellowSectors, getSectorColor, type MapSector, prioritizeColoredSectors, rad, rotate } from "../lib/map";
import { getTrackStatusMessage } from "../lib/getTrackStatusMessage";
import type { Message, PositionCar, TrackStatus } from "../types/state";
import type { TrackPosition } from "../types/map";
import type { DriverMap, DriverPosition, DriverPositions, LeaderboardEntry, TrackBounds, TrackPathPoint } from "../types/ipc";

const SPACE = 1000;
const ROTATION_FIX = 90;

type Corner = {
	number: number;
	labelPos: TrackPosition;
};

type Props = {
	filter?: string[];
	circuitKey?: number;
	drivers?: DriverMap;
	focusedDriverNumber?: string;
	trackStatus?: TrackStatus;
	positions?: DriverPositions;
	leaderboard?: LeaderboardEntry[];
	raceControlMessages?: Message[];
	trackBounds?: TrackBounds | null;
	trackPath?: TrackPathPoint[];
};

type TrailPoint = TrackPosition & { time: number; color?: string };
const raceSectorStyles = [
	{ label: "S1", color: "#33E6A1", offsetX: 0, offsetY: -820 },
	{ label: "S2", color: "#F5C86A", offsetX: -220, offsetY: -980 },
	{ label: "S3", color: "#E879F9", offsetX: 0, offsetY: -900 },
];

const normalizePosition = (position: DriverPosition): PositionCar | null => {
	const x = position.X ?? position.x;
	const y = position.Y ?? position.y;

	if (x === undefined || y === undefined) return null;

	return { Status: "OnTrack", X: x, Y: y, Z: position.Z ?? 0 };
};

const buildBounds = (sourcePoints: TrackPosition[], sourceBounds?: TrackBounds | null) => {
	if (sourceBounds) {
		const minX = sourceBounds.minX - SPACE;
		const minY = sourceBounds.minY - SPACE;
		const widthX = sourceBounds.maxX - sourceBounds.minX + SPACE * 2;
		const widthY = sourceBounds.maxY - sourceBounds.minY + SPACE * 2;

		return [minX, minY, widthX, widthY] as const;
	}

	const pointsX = sourcePoints.map((item) => item.x);
	const pointsY = sourcePoints.map((item) => item.y);
	const minX = Math.min(...pointsX) - SPACE;
	const minY = Math.min(...pointsY) - SPACE;
	const widthX = Math.max(...pointsX) - minX + SPACE * 2;
	const widthY = Math.max(...pointsY) - minY + SPACE * 2;

	return [minX, minY, widthX, widthY] as const;
};

function TrackMap({ filter, circuitKey, drivers, focusedDriverNumber, leaderboard, trackStatus, positions, raceControlMessages, trackBounds, trackPath }: Props) {
	const showCornerNumbers = false;
	const favoriteDrivers: string[] = [];
	const trackPathKey = useMemo(() => {
		if (!trackPath || trackPath.length === 0) return "empty";
		const first = trackPath[0];
		const last = trackPath[trackPath.length - 1];
		return `${trackPath.length}:${first.x},${first.y}:${last.x},${last.y}`;
	}, [trackPath]);
	const trackBoundsKey = trackBounds ? `${trackBounds.minX}:${trackBounds.maxX}:${trackBounds.minY}:${trackBounds.maxY}` : "empty";

	const [[minX, minY, widthX, widthY], setBounds] = useState<(null | number)[]>([null, null, null, null]);
	const [[centerX, centerY], setCenter] = useState<(null | number)[]>([null, null]);
	const [points, setPoints] = useState<null | TrackPosition[]>(null);
	const [sectors, setSectors] = useState<MapSector[]>([]);
	const [corners, setCorners] = useState<Corner[]>([]);
	const [rotation, setRotation] = useState<number>(0);
	const [usesRawCoordinates, setUsesRawCoordinates] = useState(false);
	const [finishLine, setFinishLine] = useState<null | { x: number; y: number; startAngle: number }>(null);
	const [trailHistory, setTrailHistory] = useState(new Map<string, TrailPoint[]>());

	useEffect(() => {
		const applyFallbackTrackPath = () => {
			if (!trackPath || trackPath.length < 2) return false;

			const fallbackPoints = trackPath.map((point) => ({ x: point.x, y: point.y }));
			const [minX, minY, widthX, widthY] = buildBounds(fallbackPoints, trackBounds);
			const fallbackCenterX = trackBounds ? (trackBounds.minX + trackBounds.maxX) / 2 : (Math.max(...fallbackPoints.map((point) => point.x)) + Math.min(...fallbackPoints.map((point) => point.x))) / 2;
			const fallbackCenterY = trackBounds ? (trackBounds.minY + trackBounds.maxY) / 2 : (Math.max(...fallbackPoints.map((point) => point.y)) + Math.min(...fallbackPoints.map((point) => point.y))) / 2;

			setCenter([fallbackCenterX, fallbackCenterY]);
			setBounds([minX, minY, widthX, widthY]);
			setSectors([]);
			setPoints(fallbackPoints);
			setRotation(0);
			setUsesRawCoordinates(true);
			setCorners([]);
			setFinishLine(null);
			return true;
		};

		(async () => {
			if (!circuitKey) {
				applyFallbackTrackPath();
				return;
			}
			const mapJson = await fetchMap(circuitKey);

			if (!mapJson) {
				applyFallbackTrackPath();
				return;
			}

			const centerX = (Math.max(...mapJson.x) - Math.min(...mapJson.x)) / 2;
			const centerY = (Math.max(...mapJson.y) - Math.min(...mapJson.y)) / 2;
			const fixedRotation = mapJson.rotation + ROTATION_FIX;

			const sectors = createSectors(mapJson).map((sector) => ({
				...sector,
				start: rotate(sector.start.x, sector.start.y, fixedRotation, centerX, centerY),
				end: rotate(sector.end.x, sector.end.y, fixedRotation, centerX, centerY),
				points: sector.points.map((point) => rotate(point.x, point.y, fixedRotation, centerX, centerY)),
			}));

			const cornerPositions: Corner[] = mapJson.corners.map((corner) => ({
				number: corner.number,
				labelPos: rotate(
					corner.trackPosition.x + 540 * Math.cos(rad(corner.angle)),
					corner.trackPosition.y + 540 * Math.sin(rad(corner.angle)),
					fixedRotation,
					centerX,
					centerY,
				),
			}));

			const rotatedPoints = mapJson.x.map((x, index) => rotate(x, mapJson.y[index], fixedRotation, centerX, centerY));
			const [cMinX, cMinY, cWidthX, cWidthY] = buildBounds(rotatedPoints);
			const rotatedFinishLine = rotate(mapJson.x[0], mapJson.y[0], fixedRotation, centerX, centerY);
			const dx = rotatedPoints[3].x - rotatedPoints[0].x;
			const dy = rotatedPoints[3].y - rotatedPoints[0].y;
			const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);

			setCenter([centerX, centerY]);
			setBounds([cMinX, cMinY, cWidthX, cWidthY]);
			setSectors(sectors);
			setPoints(rotatedPoints);
			setRotation(fixedRotation);
			setUsesRawCoordinates(false);
			setCorners(cornerPositions);
			setFinishLine({ x: rotatedFinishLine.x, y: rotatedFinishLine.y, startAngle });
		})();
	}, [circuitKey, trackPathKey, trackBoundsKey, trackPath, trackBounds]);

	const yellowSectors = useMemo(() => findYellowSectors(raceControlMessages), [raceControlMessages]);
	const highlightedDriverNumber = focusedDriverNumber ?? leaderboard?.find((entry) => entry.pos === 1)?.driverNumber;

	const renderedSectors = useMemo(() => {
		const status = getTrackStatusMessage(trackStatus?.Status ? Number(trackStatus.Status) : undefined);

		return sectors
			.filter((sector) => sector.points.length > 0)
			.map((sector) => {
				const color = getSectorColor(sector, status?.bySector, status?.trackColor, yellowSectors);
				return {
					color,
					pulse: status?.pulse,
					number: sector.number,
					strokeWidth: color === "stroke-white" ? 60 : 120,
					d: `M${sector.points[0].x},${sector.points[0].y} ${sector.points.map((point) => `L${point.x},${point.y}`).join(" ")}`,
				};
			})
			.sort(prioritizeColoredSectors);
		}, [trackStatus, sectors, yellowSectors]);
	const renderedRaceSectors = useMemo(() => {
		if (!points || points.length < 3) return [];

		const segmentSize = Math.ceil(points.length / 3);
		return raceSectorStyles.map((style, index) => {
			const start = index * segmentSize;
			const end = index === 2 ? points.length : Math.min(points.length, (index + 1) * segmentSize + 1);
			const sectorPoints = points.slice(start, end);
			if (sectorPoints.length < 2) return null;

			const labelPoint = sectorPoints[Math.floor(sectorPoints.length / 2)];
			return {
				...style,
				number: index + 1,
				labelPoint,
				d: `M${sectorPoints[0].x},${sectorPoints[0].y} ${sectorPoints.map((point) => `L${point.x},${point.y}`).join(" ")}`,
			};
		}).filter(Boolean);
	}, [points]);
	const renderedCarCount = positions ? Object.keys(positions).length : 0;
	const leaderboardDriverMap = useMemo(() => {
		const map = new Map<string, LeaderboardEntry>();
		leaderboard?.forEach((entry) => map.set(entry.driverNumber, entry));
		return map;
	}, [leaderboard]);
	useEffect(() => {
		if (!positions || centerX === null || centerY === null) {
			const clearId = window.setTimeout(() => setTrailHistory(new Map()), 0);
			return () => window.clearTimeout(clearId);
		}
		const updateId = window.setTimeout(() => {
			const now = Date.now();

			setTrailHistory((currentHistory) => {
				const nextHistory = new Map(currentHistory);

				Object.entries(positions).forEach(([driverNumber, position]) => {
					const driverPosition = position ? normalizePosition(position) : null;
					if (!driverPosition) return;

					const renderedPos = usesRawCoordinates ? { x: driverPosition.X, y: driverPosition.Y } : rotate(driverPosition.X, driverPosition.Y, rotation, centerX, centerY);
					const driver = drivers?.[driverNumber];
					const leaderboardDriver = leaderboardDriverMap.get(driverNumber);
					const color = driver?.TeamColour ?? leaderboardDriver?.color?.replace("#", "") ?? "ffffff";
					const history = nextHistory.get(driverNumber) ?? [];
					const previous = history.at(-1);
					const movedEnough = !previous || Math.hypot(previous.x - renderedPos.x, previous.y - renderedPos.y) > 25;
					const updatedHistory = movedEnough ? [...history, { ...renderedPos, time: now, color }] : history;

					nextHistory.set(driverNumber, updatedHistory.filter((point) => now - point.time < 7000).slice(-16));
				});

				return nextHistory;
			});
		}, 0);

		return () => window.clearTimeout(updateId);
	}, [centerX, centerY, drivers, leaderboardDriverMap, positions, rotation, usesRawCoordinates]);
	const renderedTrails = useMemo(() => {
		return [...trailHistory.entries()].map(([driverNumber, trail]) => ({
			driverNumber,
			color: trail.at(-1)?.color ?? "ffffff",
			points: trail,
		}));
	}, [trailHistory]);
	const incidentMarkers = useMemo(() => {
		if (sectors.length === 0) return [];

		return (raceControlMessages ?? [])
			.slice(-8)
			.filter((message) => {
				const text = String(message.Message ?? "").toUpperCase();
				return text.includes("INCIDENT") || text.includes("PENALTY") || text.includes("DELETED") || text.includes("INVESTIGAT");
			})
			.map((message, index) => {
				const sectorNumber = Number(message.Sector);
				if (!Number.isFinite(sectorNumber)) return null;

				const sector = sectors.find((item) => item.number === sectorNumber);
				if (!sector) return null;

				const point = sector.points[Math.floor(sector.points.length / 2)];
				if (!point) return null;

				const text = String(message.Message ?? "").toUpperCase();
				const tone = text.includes("PENALTY") || text.includes("DELETED") ? "danger" : "warning";
				return {
					id: `${message.Utc}.${message.Message}.${index}`,
					x: point.x,
					y: point.y,
					sector: sector.number,
					tone,
				};
			})
			.filter(Boolean);
	}, [raceControlMessages, sectors]);

	if (!points || minX === null || minY === null || widthX === null || widthY === null) {
		return (
			<div className="h-full w-full p-2" style={{ minHeight: "35rem" }}>
				<div className="h-full w-full animate-pulse rounded-lg bg-zinc-800" />
			</div>
		);
	}

	return (
		<svg viewBox={`${minX} ${minY} ${widthX} ${widthY}`} className="h-full w-full xl:max-h-screen" xmlns="http://www.w3.org/2000/svg" data-rendered-cars={renderedCarCount} data-coordinate-mode={usesRawCoordinates ? "raw" : "multiviewer"}>
			<path className="stroke-gray-800" strokeWidth={300} strokeLinejoin="round" fill="transparent" d={`M${points[0].x},${points[0].y} ${points.map((point) => `L${point.x},${point.y}`).join(" ")}`} />

			{renderedRaceSectors.map((sector) => sector && (
				<g key={`map.race-sector.${sector.number}`}>
					<path d={sector.d} fill="transparent" stroke={sector.color} strokeWidth={320} strokeLinecap="round" strokeLinejoin="round" opacity={0.28} />
					<path d={sector.d} fill="transparent" stroke={sector.color} strokeWidth={118} strokeLinecap="round" strokeLinejoin="round" opacity={0.62} />
					<path d={sector.d} fill="transparent" stroke={sector.color} strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" opacity={0.96} />
					<g transform={`translate(${sector.labelPoint.x + sector.offsetX} ${sector.labelPoint.y + sector.offsetY})`}>
						<rect x={-330} y={-260} width={660} height={360} rx={54} fill="#0B1018" stroke={sector.color} strokeWidth={34} opacity={0.96} />
						<text x={0} y={-18} fill={sector.color} fontSize={330} fontWeight="900" textAnchor="middle">{sector.label}</text>
					</g>
				</g>
			))}

			{renderedSectors.map((sector) => {
				const style = sector.pulse ? { animation: `${sector.pulse * 100}ms linear infinite pulse` } : {};
				return <path key={`map.sector.${sector.number}`} className={sector.color} strokeWidth={sector.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="transparent" d={sector.d} style={style} />;
			})}

			{finishLine && <rect x={finishLine.x - 75} y={finishLine.y} width={240} height={20} fill="red" stroke="red" strokeWidth={70} transform={`rotate(${finishLine.startAngle + 90}, ${finishLine.x + 25}, ${finishLine.y})`} />}

			{renderedTrails.map((trail) => {
				if (trail.points.length < 2) return null;
				const d = `M${trail.points[0].x},${trail.points[0].y} ${trail.points.map((point) => `L${point.x},${point.y}`).join(" ")}`;
				return <path key={`map.trail.${trail.driverNumber}`} d={d} fill="transparent" stroke={`#${trail.color}`} strokeWidth={highlightedDriverNumber === trail.driverNumber ? 52 : 28} strokeLinecap="round" strokeLinejoin="round" opacity={highlightedDriverNumber === trail.driverNumber ? 0.36 : 0.16} />;
			})}

			{incidentMarkers.map((marker) => marker && (
				<g key={`map.incident.${marker.id}`} transform={`translate(${marker.x} ${marker.y})`}>
					<circle r={170} fill={marker.tone === "danger" ? "#FF1801" : "#F5C86A"} opacity={0.22} />
					<circle r={82} fill="transparent" stroke={marker.tone === "danger" ? "#FF1801" : "#F5C86A"} strokeWidth={32} />
					<text x={120} y={-95} fill={marker.tone === "danger" ? "#FF1801" : "#F5C86A"} fontSize={220} fontWeight="bold">S{marker.sector}</text>
				</g>
			))}

			{showCornerNumbers && corners.map((corner) => <CornerNumber key={`corner.${corner.number}`} number={corner.number} x={corner.labelPos.x} y={corner.labelPos.y} />)}

			{centerX !== null && centerY !== null && positions && (
				<>
					{Object.entries(positions)
						.reverse()
						.filter(([driverNumber]) => (filter ? filter.includes(driverNumber) : true))
						.map(([driverNumber, position]) => {
							const driver = drivers?.[driverNumber];
							const leaderboardDriver = leaderboardDriverMap.get(driverNumber);
							if (!position) return null;

							const driverPosition = normalizePosition(position);
							if (!driverPosition) return null;

							return (
								<CarDot
									key={`map.driver.${driverNumber}`}
									favoriteDriver={favoriteDrivers.includes(driverNumber)}
									name={driver?.Tla ?? leaderboardDriver?.driver ?? driverNumber}
									color={driver?.TeamColour ?? leaderboardDriver?.color?.replace("#", "")}
									pit={false}
									focused={highlightedDriverNumber === driverNumber}
									hidden={trackBounds === null && Object.keys(positions).length === 0}
									pos={driverPosition}
									rotation={rotation}
									centerX={centerX}
									centerY={centerY}
									usesRawCoordinates={usesRawCoordinates}
								/>
							);
						})}
				</>
			)}
		</svg>
	);
}

type CornerNumberProps = {
	number: number;
	x: number;
	y: number;
};

export default memo(TrackMap);

const CornerNumber = ({ number, x, y }: CornerNumberProps) => {
	return (
		<text x={x} y={y} className="fill-zinc-700" fontSize={300} fontWeight="semibold">
			{number}
		</text>
	);
};

type CarDotProps = {
	name: string;
	color: string | undefined;
	favoriteDriver: boolean;
	pit: boolean;
	focused: boolean;
	hidden: boolean;
	pos: PositionCar;
	rotation: number;
	centerX: number;
	centerY: number;
	usesRawCoordinates: boolean;
};

const CarDot = ({ pos, name, color, favoriteDriver, pit, focused, hidden, rotation, centerX, centerY, usesRawCoordinates }: CarDotProps) => {
	const renderedPos = usesRawCoordinates ? { x: pos.X, y: pos.Y } : rotate(pos.X, pos.Y, rotation, centerX, centerY);

	return (
		<g
			className={clsx("fill-zinc-700", { "opacity-30": pit }, { "opacity-0!": hidden })}
			transform={`translate(${renderedPos.x} ${renderedPos.y})`}
			style={{
				transition: "transform 200ms linear",
				...(color && { fill: `#${color}` }),
			}}
		>
			{focused && <circle id="map.driver.focused" r={250} fill="transparent" stroke="#33E6A1" strokeWidth={44} opacity={0.95} />}
			{focused && <circle id="map.driver.focused.glow" r={340} fill="#33E6A1" opacity={0.12} />}
			<circle id="map.driver.circle" r={120} />
			<text id="map.driver.text" x={150} y={-120} fontWeight="bold" fontSize={360}>
				{name}
			</text>

			{favoriteDriver && <circle id="map.driver.favorite" className="stroke-sky-400" r={180} fill="transparent" strokeWidth={40} />}
		</g>
	);
};

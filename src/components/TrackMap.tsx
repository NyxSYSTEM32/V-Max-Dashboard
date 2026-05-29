import { useEffect, useMemo, useState } from "react";
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
	trackStatus?: TrackStatus;
	positions?: DriverPositions;
	leaderboard?: LeaderboardEntry[];
	raceControlMessages?: Message[];
	trackBounds?: TrackBounds | null;
	trackPath?: TrackPathPoint[];
};

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

export default function TrackMap({ filter, circuitKey, drivers, leaderboard, trackStatus, positions, raceControlMessages, trackBounds, trackPath }: Props) {
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
	const renderedCarCount = positions ? Object.keys(positions).length : 0;
	const leaderboardDriverMap = useMemo(() => {
		const map = new Map<string, LeaderboardEntry>();
		leaderboard?.forEach((entry) => map.set(entry.driverNumber, entry));
		return map;
	}, [leaderboard]);

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

			{renderedSectors.map((sector) => {
				const style = sector.pulse ? { animation: `${sector.pulse * 100}ms linear infinite pulse` } : {};
				return <path key={`map.sector.${sector.number}`} className={sector.color} strokeWidth={sector.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="transparent" d={sector.d} style={style} />;
			})}

			{finishLine && <rect x={finishLine.x - 75} y={finishLine.y} width={240} height={20} fill="red" stroke="red" strokeWidth={70} transform={`rotate(${finishLine.startAngle + 90}, ${finishLine.x + 25}, ${finishLine.y})`} />}

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
	hidden: boolean;
	pos: PositionCar;
	rotation: number;
	centerX: number;
	centerY: number;
	usesRawCoordinates: boolean;
};

const CarDot = ({ pos, name, color, favoriteDriver, pit, hidden, rotation, centerX, centerY, usesRawCoordinates }: CarDotProps) => {
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
			<circle id="map.driver.circle" r={120} />
			<text id="map.driver.text" x={150} y={-120} fontWeight="bold" fontSize={360}>
				{name}
			</text>

			{favoriteDriver && <circle id="map.driver.favorite" className="stroke-sky-400" r={180} fill="transparent" strokeWidth={40} />}
		</g>
	);
};

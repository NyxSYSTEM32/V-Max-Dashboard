import { useEffect, useReducer, useState } from "react";

import { createInitialRaceState, reduceRaceState } from "../lib/raceState";
import type { AppMode, ReplaySession, TrackFlag } from "../types/ipc";

export const DEFAULT_SESSION = 9158;

export const useRaceData = () => {
	const [raceState, dispatchRaceState] = useReducer(reduceRaceState, createInitialRaceState("archive"));
	const [sessions, setSessions] = useState<ReplaySession[]>([]);
	const [selectedSession, setSelectedSession] = useState<number>(DEFAULT_SESSION);

	useEffect(() => {
		const api = window.electronAPI;
		if (!api) return;

		api.getSessions().then((data) => {
			setSessions(data);
			const defaultSession = data[0]?.session_key ?? DEFAULT_SESSION;
			setSelectedSession(defaultSession);
			api.setReplaySession(defaultSession);
		});

		return api.onF1Data((event) => {
			dispatchRaceState({ type: "event", event });
		});
	}, []);

	const setMode = (mode: AppMode) => {
		dispatchRaceState({ type: "set-mode", mode });
		window.electronAPI?.setMode(mode);
	};

	const setReplaySession = (sessionKey: number) => {
		setSelectedSession(sessionKey);
		dispatchRaceState({ type: "reset", mode: "archive" });
		window.electronAPI?.setReplaySession(sessionKey);
	};

	const setManualTrackFlag = (flag: TrackFlag) => {
		dispatchRaceState({ type: "manual-track-flag", flag });
	};

	const setFocusedDriver = (driverNumber: string) => {
		dispatchRaceState({ type: "set-focused-driver", driverNumber });
		window.electronAPI?.setFocusedDriver(driverNumber);
	};

	const setReplayPlaying = (isPlaying: boolean) => {
		window.electronAPI?.setReplayControl({ type: isPlaying ? "play" : "pause" });
	};

	const setReplaySpeed = (speed: number) => {
		window.electronAPI?.setReplayControl({ type: "set-speed", speed });
	};

	const seekReplay = (progress: number) => {
		window.electronAPI?.setReplayControl({ type: "seek", progress });
	};

	const jumpReplay = (seconds: number) => {
		window.electronAPI?.setReplayControl({ type: "jump", seconds });
	};

	return {
		raceState,
		sessions,
		selectedSession,
		selectedSessionInfo: sessions.find((session) => session.session_key === selectedSession),
		setMode,
		setReplaySession,
		setManualTrackFlag,
		setFocusedDriver,
		setReplayPlaying,
		setReplaySpeed,
		seekReplay,
		jumpReplay,
	};
};

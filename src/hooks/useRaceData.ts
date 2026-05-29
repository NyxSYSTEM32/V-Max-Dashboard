import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { createInitialRaceState, reduceRaceState } from "../lib/raceState";
import type { AppMode, F1DataEvent, ReplaySession, TrackFlag } from "../types/ipc";

export const DEFAULT_SESSION = 9158;
const RACE_FRAME_RENDER_INTERVAL_MS = 100;

export const useRaceData = () => {
	const [raceState, dispatchRaceState] = useReducer(reduceRaceState, createInitialRaceState("archive"));
	const [sessions, setSessions] = useState<ReplaySession[]>([]);
	const [selectedSession, setSelectedSession] = useState<number>(DEFAULT_SESSION);
	const pendingRaceFrameRef = useRef<Extract<F1DataEvent, { type: "race-frame" }> | null>(null);
	const frameTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
	const lastFrameDispatchRef = useRef(0);
	const streamEpochRef = useRef(0);

	const clearPendingRaceFrame = useCallback(() => {
		pendingRaceFrameRef.current = null;
		if (frameTimerRef.current !== null) {
			window.clearTimeout(frameTimerRef.current);
			frameTimerRef.current = null;
		}
	}, []);

	const dispatchPendingRaceFrame = useCallback((epoch: number) => {
		frameTimerRef.current = null;
		if (epoch !== streamEpochRef.current) return;

		const frame = pendingRaceFrameRef.current;
		if (!frame) return;

		pendingRaceFrameRef.current = null;
		lastFrameDispatchRef.current = performance.now();
		dispatchRaceState({ type: "event", event: frame });
	}, []);

	const dispatchRaceFrame = useCallback((frame: Extract<F1DataEvent, { type: "race-frame" }>) => {
		pendingRaceFrameRef.current = frame;

		if (frameTimerRef.current !== null) return;

		const elapsedMs = performance.now() - lastFrameDispatchRef.current;
		const delayMs = Math.max(0, RACE_FRAME_RENDER_INTERVAL_MS - elapsedMs);
		const epoch = streamEpochRef.current;
		frameTimerRef.current = window.setTimeout(() => dispatchPendingRaceFrame(epoch), delayMs);
	}, [dispatchPendingRaceFrame]);

	const resetStream = useCallback(() => {
		streamEpochRef.current += 1;
		lastFrameDispatchRef.current = 0;
		clearPendingRaceFrame();
	}, [clearPendingRaceFrame]);

	useEffect(() => {
		const api = window.electronAPI;
		if (!api) return;

		api.getSessions().then((data) => {
			setSessions(data);
			const defaultSession = data[0]?.session_key ?? DEFAULT_SESSION;
			setSelectedSession(defaultSession);
			api.setReplaySession(defaultSession);
		});

		const unsubscribe = api.onF1Data((event) => {
			if (event.type === "race-frame") {
				dispatchRaceFrame(event);
				return;
			}

			dispatchRaceState({ type: "event", event });
		});

		return () => {
			clearPendingRaceFrame();
			unsubscribe();
		};
	}, [clearPendingRaceFrame, dispatchRaceFrame]);

	const setMode = useCallback((mode: AppMode) => {
		resetStream();
		dispatchRaceState({ type: "set-mode", mode });
		window.electronAPI?.setMode(mode);
	}, [resetStream]);

	const setReplaySession = useCallback((sessionKey: number) => {
		resetStream();
		setSelectedSession(sessionKey);
		dispatchRaceState({ type: "reset", mode: "archive" });
		window.electronAPI?.setReplaySession(sessionKey);
	}, [resetStream]);

	const setManualTrackFlag = useCallback((flag: TrackFlag) => {
		dispatchRaceState({ type: "manual-track-flag", flag });
	}, []);

	const setFocusedDriver = useCallback((driverNumber: string) => {
		resetStream();
		dispatchRaceState({ type: "set-focused-driver", driverNumber });
		window.electronAPI?.setFocusedDriver(driverNumber);
	}, [resetStream]);

	const setReplayPlaying = useCallback((isPlaying: boolean) => {
		window.electronAPI?.setReplayControl({ type: isPlaying ? "play" : "pause" });
	}, []);

	const setReplaySpeed = useCallback((speed: number) => {
		window.electronAPI?.setReplayControl({ type: "set-speed", speed });
	}, []);

	const seekReplay = useCallback((progress: number) => {
		resetStream();
		window.electronAPI?.setReplayControl({ type: "seek", progress });
	}, [resetStream]);

	const jumpReplay = useCallback((seconds: number) => {
		resetStream();
		window.electronAPI?.setReplayControl({ type: "jump", seconds });
	}, [resetStream]);

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

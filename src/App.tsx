import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import AnimatedThemeBackground from "./components/AnimatedThemeBackground";
import { ConstructorsStandings } from "./components/ConstructorsStandings";
import { DriversStandings } from "./components/DriversStandings";
import HeaderBar from "./components/HeaderBar";
import LeaderboardPanel from "./components/LeaderboardPanel";
import { MediaPanel } from "./components/MediaPanel";
import { PanelErrorBoundary } from "./components/PanelErrorBoundary";
import RaceControlPanel from "./components/RaceControlPanel";
import ReplayBar from "./components/ReplayBar";
import { SettingsPanel } from "./components/SettingsPanel";
import TelemetryPanel from "./components/TelemetryPanel";
import TrackMap from "./components/TrackMap";
import { UaMonitorPanel } from "./components/UaMonitorPanel";
import { useChampionshipStandings } from "./hooks/useChampionshipStandings";
import { DEFAULT_SESSION, useRaceData } from "./hooks/useRaceData";
import { loadDiscordPresenceEnabled, saveDiscordPresenceEnabled } from "./lib/discordSettings";
import { loadUaSafetyModeEnabled, saveUaSafetyModeEnabled } from "./lib/safetySettings";
import { getSoundCategory, loadSoundSettings, saveSoundSettings, SoundManager, type SoundGate, type SoundKey, type SoundSettings } from "./lib/sounds";
import { applyTheme, getThemeById, loadAnimatedBackgroundEnabled, loadAnimatedBackgroundIntensity, loadThemeId, saveAnimatedBackgroundEnabled, saveAnimatedBackgroundIntensity, saveThemeId, VMAX_THEMES, type AnimatedBackgroundIntensity, type ThemeId } from "./lib/themes";
import type { AppMode, ElectronAPI, PerformanceEvent, PitEvent, RaceControlMessage, TeamRadioMessage } from "./types/ipc";
import type { ActiveTab } from "./types/ui";

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

type PopupState = { visible: boolean; type: "info" | "penalty" | "investigation" | "overtake" | "fastest" | "pit"; title: string; text: string };
type PopupSoundCue = { key: SoundKey; gate?: SoundGate };
const teamRadioBars = Array.from({ length: 30 }, (_, i) => ({ height: (i % 5) * 4 + 8, delay: `${i * 0.05}s` }));
const DEVELOPER_PASSWORD = "Bonz1_Willki";
const DEVELOPER_MODE_STORAGE_KEY = "vmax.developerModeEnabled";

const loadDeveloperModeEnabled = () => {
  try {
    return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const saveDeveloperModeEnabled = (enabled: boolean) => {
  try {
    window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // Local storage can be unavailable in restricted preview contexts.
  }
};

const getPopupSound = (type: PopupState["type"], title: string, text: string): PopupSoundCue | null => {
  const normalizedTitle = title.toUpperCase();
  const normalizedText = text.toUpperCase();

  if (normalizedText.includes("CHEQUERED")) return null;
  if (normalizedTitle.includes("FASTEST LAP")) return { key: "fastestLap", gate: "fastestLapSound" };
  if (normalizedTitle.includes("PURPLE SECTOR")) return { key: "fastestLap", gate: "purpleSectorSound" };
  if (normalizedTitle.includes("PERSONAL BEST")) return { key: "fastestLap", gate: "personalBestSound" };
  if (normalizedTitle.includes("PIT STOP") || normalizedText.includes("NEW ")) return { key: "warning", gate: "pitStopSound" };
  if (normalizedTitle.includes("TEAM RADIO")) return { key: "radio", gate: "radioAlerts" };
  if (type === "penalty") return { key: "penalty", gate: "penaltySound" };
  if (type === "investigation") return { key: "incident", gate: "incidentSound" };
  if (type === "overtake" || normalizedText.includes("STRAIGHT MODE") || normalizedText.includes("OVERTAKE")) return { key: "straightMode", gate: "straightModeSound" };
  if (normalizedText.includes("RED")) return { key: "redFlag", gate: "redFlagSound" };
  if (normalizedText.includes("YELLOW") || normalizedText.includes("SAFETY CAR") || normalizedText.includes("VSC")) return { key: "yellowFlag", gate: "yellowFlagSound" };
  if (normalizedText.includes("GREEN")) return { key: "greenFlag", gate: "greenFlagSound" };
  return { key: "click" };
};

const formatPerformanceTime = (value: number) => {
  const totalSeconds = Math.max(0, value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
};

const getPerformanceNotification = (event: PerformanceEvent, driverCode: string): Pick<PopupState, "type" | "title" | "text"> => {
  if (event.type === "fastest-lap") {
    return { type: "fastest", title: "FASTEST LAP", text: `${driverCode} ${formatPerformanceTime(event.value)} LAP ${event.lap}` };
  }

  if (event.type === "purple-sector") {
    return { type: "fastest", title: "PURPLE SECTOR", text: `${driverCode} S${event.sector} ${formatPerformanceTime(event.value)}` };
  }

  return { type: "info", title: "PERSONAL BEST", text: `${driverCode} ${formatPerformanceTime(event.value)} LAP ${event.lap}` };
};

const getPitNotification = (event: PitEvent, driverCode: string): Pick<PopupState, "type" | "title" | "text"> => ({
  type: "pit",
  title: "PIT STOP",
  text: `${driverCode} NEW ${event.compound} LAP ${event.lap}`,
});

const isSoundEnabledForCategory = (settings: SoundSettings, key: SoundKey, gate?: SoundGate) => {
  if (!settings.enabled) return false;
  if (gate && !settings[gate]) return false;
  const category = getSoundCategory(key);
  if (category === "radio") return settings.radioAlerts;
  if (category === "raceControl") return settings.raceControlAlerts;
  if (key === "startup") return settings.systemSounds && settings.startupSound;
  if (key === "shutdown") return settings.systemSounds && settings.shutdownSound;
  if (category === "system") return settings.systemSounds;
  return settings.uiSounds;
};

const getRaceControlNotification = (message: RaceControlMessage): null | Pick<PopupState, "type" | "title" | "text"> => {
  const text = message.message.toUpperCase();

  if (text.includes("OVERTAKE ENABLED")) {
    return { type: "overtake", title: "RACE CONTROL", text: "STRAIGHT MODE AVAILABLE" };
  }

  if (text.includes("PENALTY")) {
    return { type: "penalty", title: "FIA STEWARDS", text: message.message };
  }

  const isActionableIncident =
    text.includes("UNDER INVESTIGATION") ||
    text.includes("WILL BE INVESTIGATED") ||
    (text.includes("INCIDENT") && text.includes("NOTED"));

  if (isActionableIncident) {
    return { type: "investigation", title: "INCIDENT", text: message.message };
  }

  return null;
};

const TeamRadioPanel = memo(({ focusedTeam, focusedCode, messages }: { focusedTeam: string; focusedCode: string; messages: TeamRadioMessage[] }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedRadioId, setSelectedRadioId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const latestMessage = messages.at(-1);
  const selectedMessage = messages.find((message) => `${message.driverNumber}.${message.date}` === selectedRadioId) ?? latestMessage;
  const selectedUrl = selectedMessage?.recordingUrl ?? null;
  const playedSeconds = duration * progress;
  const formatSeconds = (value: number) => (Number.isFinite(value) ? `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}` : "0:00");
  const formatRadioTime = (date: string, includeSeconds = false) =>
    new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: includeSeconds ? "2-digit" : undefined });
  const selectedRadioIdResolved = selectedMessage ? `${selectedMessage.driverNumber}.${selectedMessage.date}` : null;
  const selectedIndex = selectedMessage ? messages.findIndex((message) => `${message.driverNumber}.${message.date}` === selectedRadioIdResolved) : -1;
  const latestRadioId = latestMessage ? `${latestMessage.driverNumber}.${latestMessage.date}` : null;

  const handleSelectRadio = (message: TeamRadioMessage) => {
    setSelectedRadioId(`${message.driverNumber}.${message.date}`);
    setProgress(0);
    setDuration(0);
    setIsPlaying(false);
  };

  const handlePlay = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    await audioRef.current.play();
    setIsPlaying(true);
  };

  return (
    <div className="h-36 bg-panel rounded-xl border border-line p-3 flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-muted text-xs font-bold tracking-widest">TEAM RADIO</h2>
          {selectedMessage && (
            <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent">
              R{selectedIndex + 1} SELECTED
            </span>
          )}
        </div>
        <span className="text-[10px] text-f1-red font-bold">{messages.length > 0 ? `${messages.length} CAPTURES` : "NO FEED"}</span>
      </div>
      <div className="mb-2 flex h-7 items-center gap-2 overflow-x-auto pr-1 custom-scrollbar">
        {messages.length > 0 ? (
          messages.map((message, index) => {
            const radioId = `${message.driverNumber}.${message.date}`;
            const isSelected = radioId === selectedRadioIdResolved;
            const isLatest = radioId === latestRadioId;
            return (
              <button
                key={radioId}
                onClick={() => handleSelectRadio(message)}
                className={`group flex h-6 min-w-[5.2rem] items-center gap-1.5 rounded border px-2 text-[10px] font-bold tabular-nums transition-colors ${
                  isSelected ? "border-accent bg-accent/15 text-accent shadow-[0_0_16px_rgba(51,230,161,0.12)]" : "border-line bg-panel-alt text-muted hover:border-accent/40 hover:text-white"
                }`}
              >
                <span className={isSelected ? "text-white" : "text-muted group-hover:text-white"}>R{index + 1}</span>
                <span>{formatRadioTime(message.date)}</span>
                {isLatest && <span className="rounded bg-f1-red/20 px-1 text-[8px] text-f1-red">NEW</span>}
              </button>
            );
          })
        ) : (
          <div className="text-[10px] uppercase text-muted">Radio archive is empty for this driver at current replay time</div>
        )}
      </div>
      <div className="flex-1 grid grid-cols-[2.5rem_minmax(9rem,14rem)_minmax(14rem,1fr)_minmax(8rem,11rem)] items-center gap-3 bg-panel-alt rounded-lg px-3 border border-line min-h-0">
        <button
          aria-label={isPlaying ? "Pause team radio" : "Play team radio"}
          disabled={!selectedUrl}
          onClick={handlePlay}
          className="w-9 h-9 shrink-0 rounded-full bg-accent/20 flex items-center justify-center text-accent hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-accent/50 cursor-pointer"
        >
          {isPlaying ? <span className="h-3.5 w-3.5 border-x-4 border-current" /> : <span className="ml-0.5 h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-current" />}
        </button>
        <div className="flex min-w-0 flex-col">
          <span className="mb-0.5 truncate text-xs font-bold text-white">{focusedTeam.toUpperCase()} RADIO {focusedCode}</span>
          <span className="text-[10px] text-muted uppercase tabular-nums">
            {selectedMessage ? `${formatRadioTime(selectedMessage.date, true)} - CAR ${selectedMessage.driverNumber}` : "No radio captures yet"}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-center gap-[3px] opacity-80">
            {teamRadioBars.map((bar, i) => (
              <div key={i} className={`w-1 rounded-full ${i / teamRadioBars.length <= progress ? "bg-accent" : "bg-accent/30"}`} style={{ height: `${Math.max(6, bar.height - 2)}px` }} />
            ))}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-3 text-[10px] text-muted tabular-nums">
          <span className="whitespace-nowrap">{formatSeconds(playedSeconds)} / {formatSeconds(duration)}</span>
          <span className={`rounded border px-2 py-1 font-bold ${selectedUrl ? "border-accent/40 text-accent" : "border-line text-muted"}`}>{selectedUrl ? "MP3" : "WAIT"}</span>
        </div>
        {selectedUrl && (
          <audio
            ref={audioRef}
            key={selectedUrl}
            src={selectedUrl}
            preload="metadata"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setProgress(event.currentTarget.duration > 0 ? event.currentTarget.currentTime / event.currentTarget.duration : 0)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onEnded={() => {
              setIsPlaying(false);
              setProgress(0);
            }}
            className="hidden"
          />
        )}
      </div>
    </div>
  );
});

TeamRadioPanel.displayName = "TeamRadioPanel";

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("telemetry");
  const [popup, setPopup] = useState<PopupState>({ visible: false, type: "info", title: "", text: "" });
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => loadSoundSettings());
  const [themeId, setThemeId] = useState<ThemeId>(() => loadThemeId());
  const [animatedBackgroundEnabled, setAnimatedBackgroundEnabled] = useState(() => loadAnimatedBackgroundEnabled());
  const [animatedBackgroundIntensity, setAnimatedBackgroundIntensity] = useState<AnimatedBackgroundIntensity>(() => loadAnimatedBackgroundIntensity());
  const [discordPresenceEnabled, setDiscordPresenceEnabled] = useState(() => loadDiscordPresenceEnabled());
  const [uaSafetyModeEnabled, setUaSafetyModeEnabled] = useState(() => loadUaSafetyModeEnabled());
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(() => loadDeveloperModeEnabled());
  const [developerAccessMessage, setDeveloperAccessMessage] = useState<string | undefined>(developerModeEnabled ? "SIM CONTROLS are available in the replay bar." : undefined);
  const soundManagerRef = useRef<SoundManager | null>(null);
  const championshipStandings = useChampionshipStandings();
  const { raceState, sessions, selectedSession, selectedSessionInfo, setMode, setReplaySession, setManualTrackFlag, setFocusedDriver, setReplayPlaying, setReplaySpeed, seekReplay, jumpReplay } = useRaceData();
  const { mode, focusedDriverNumber, telemetry, trackFlag, leaderboard, drivers, positions, trackBounds, trackPath, raceControlMessages, teamRadioMessages, teamRadioAlertMessages, performanceEvents, pitEvents, totalLaps, weather, lapSummary, stintSummary, sourceStatus, sourceMessage, liveHealth, liveHealthLabel, replayControl } = raceState;

  if (soundManagerRef.current == null) {
    soundManagerRef.current = new SoundManager();
  }

  useEffect(() => {
    soundManagerRef.current?.setVolume(soundSettings.volume);
    saveSoundSettings(soundSettings);
  }, [soundSettings]);

  useEffect(() => {
    const theme = getThemeById(themeId);
    applyTheme(theme);
    saveThemeId(theme.id);
  }, [themeId]);

  useEffect(() => {
    saveAnimatedBackgroundEnabled(animatedBackgroundEnabled);
  }, [animatedBackgroundEnabled]);

  useEffect(() => {
    saveAnimatedBackgroundIntensity(animatedBackgroundIntensity);
  }, [animatedBackgroundIntensity]);

  useEffect(() => {
    saveUaSafetyModeEnabled(uaSafetyModeEnabled);
  }, [uaSafetyModeEnabled]);

  useEffect(() => {
    saveDiscordPresenceEnabled(discordPresenceEnabled);
    window.electronAPI?.setDiscordPresenceEnabled(discordPresenceEnabled);
  }, [discordPresenceEnabled]);

  const playSound = useCallback((key: SoundKey, gate?: SoundGate) => {
    if (!isSoundEnabledForCategory(soundSettings, key, gate)) return Promise.resolve("missing" as const);
    return soundManagerRef.current?.play(key) ?? Promise.resolve("missing" as const);
  }, [soundSettings]);

  useEffect(() => {
    let shouldPlayOnUnlock = false;

    const playStartup = async () => {
      const result = await playSound("startup");
      shouldPlayOnUnlock = result === "blocked";
    };

    const playStartupAfterGesture = () => {
      if (!shouldPlayOnUnlock) return;
      shouldPlayOnUnlock = false;
      void playSound("startup");
    };

    void playStartup();
    window.addEventListener("pointerdown", playStartupAfterGesture, { once: true });
    window.addEventListener("keydown", playStartupAfterGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", playStartupAfterGesture);
      window.removeEventListener("keydown", playStartupAfterGesture);
    };
  }, [playSound]);

  const showPopup = useCallback((type: PopupState["type"], title: string, text: string) => {
    setPopup({ visible: true, type, title, text });
    const soundCue = getPopupSound(type, title, text);
    if (soundCue) void playSound(soundCue.key, soundCue.gate);
    window.setTimeout(() => {
      setPopup((current) => ({ ...current, visible: false }));
    }, 5000);
  }, [playSound]);

  const handleModeChange = useCallback((mode: AppMode) => {
    setMode(mode);
  }, [setMode]);

  const handleSessionChange = useCallback((sessionKey: number) => {
    setReplaySession(sessionKey);
  }, [setReplaySession]);

  const handleUaSafetyModeChange = useCallback((enabled: boolean) => {
    setUaSafetyModeEnabled(enabled);
    if (!enabled) setActiveTab((current) => (current === "ua-monitor" ? "telemetry" : current));
  }, []);

  const handleManualTrackFlag = useCallback((flag: typeof trackFlag) => {
    setManualTrackFlag(flag);
    switch (flag) {
      case "Green":
        showPopup("overtake", "RACE CONTROL", "GREEN FLAG");
        break;
      case "Yellow":
      case "SC":
      case "VSC":
        showPopup("investigation", "RACE CONTROL", `${flag} DEPLOYED`);
        break;
      case "Red":
        showPopup("penalty", "RACE CONTROL", "RED FLAG");
        break;
      case "Chequered":
        showPopup("info", "RACE CONTROL", "CHEQUERED FLAG");
        break;
      default:
        showPopup("info", "RACE CONTROL", `${flag} ACTIVE`);
        break;
    }
  }, [setManualTrackFlag, showPopup]);

  const handleDeveloperUnlock = useCallback((password: string) => {
    if (password === DEVELOPER_PASSWORD) {
      setDeveloperModeEnabled(true);
      saveDeveloperModeEnabled(true);
      setDeveloperAccessMessage("SIM CONTROLS are available in the replay bar.");
      showPopup("info", "DEVELOPER", "SIM CONTROLS UNLOCKED");
      return;
    }

    setDeveloperAccessMessage("Access denied.");
  }, [showPopup]);

  const handleDeveloperLock = useCallback(() => {
    setDeveloperModeEnabled(false);
    saveDeveloperModeEnabled(false);
    setDeveloperAccessMessage("SIM CONTROLS locked.");
  }, []);

  const getFlagGlowClass = () => {
    switch (trackFlag) {
      case "Yellow":
      case "SC":
      case "VSC":
        return "border-warning shadow-[0_0_30px_#F5C86A] animate-pulse";
      case "Red":
        return "border-f1-red shadow-[0_0_30px_#FF1801] animate-pulse";
      case "Green":
        return "border-accent shadow-[0_0_30px_#33E6A1] animate-pulse";
      case "Chequered":
        return "chequered-glow";
      default:
        return "border-transparent";
    }
  };

  const replayTime = useMemo(() => replayControl.currentTimestamp
    ? new Date(replayControl.currentTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--", [replayControl.currentTimestamp]);
  const focusedDriver = drivers[focusedDriverNumber] ?? drivers[telemetry.driverNumber];
  const focusedLeaderboardEntry = leaderboard.find((driver) => driver.driverNumber === focusedDriverNumber);
  const focusedCode = focusedDriver?.Tla ?? focusedLeaderboardEntry?.driver ?? focusedDriverNumber;
  const focusedTeam = focusedDriver?.TeamName ?? "TEAM";
  const currentLap = focusedLeaderboardEntry?.lap ?? Math.max(0, ...leaderboard.map((driver) => driver.lap ?? 0));
  const latestRaceControl = raceControlMessages.at(-1);
  const notifiedRaceControlRef = useRef(new Set<string>());
  const focusedTeamRadioMessages = useMemo(
    () => teamRadioMessages.filter((message) => message.driverNumber === focusedDriverNumber),
    [focusedDriverNumber, teamRadioMessages],
  );
  const notifiedRadioRef = useRef(new Set<string>());
  const radioLastReplayTimeRef = useRef<number | null>(null);
  const notifiedPerformanceRef = useRef(new Set<string>());
  const performanceLastReplayTimeRef = useRef<number | null>(null);
  const notifiedPitRef = useRef(new Set<string>());
  const pitLastReplayTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!replayControl.currentTimestamp) return;

    const replayTimeMs = new Date(replayControl.currentTimestamp).getTime();
    const previousReplayTimeMs = radioLastReplayTimeRef.current;
    const movedBackward = previousReplayTimeMs !== null && replayTimeMs < previousReplayTimeMs - 1_000;

    if (movedBackward) {
      notifiedRadioRef.current.clear();
    }

    radioLastReplayTimeRef.current = replayTimeMs;

    if (!replayControl.isPlaying) {
      return;
    }

    const newRadioMessages = teamRadioAlertMessages
      .filter((message) => {
        const radioTimeMs = new Date(message.date).getTime();
        const radioId = `${message.driverNumber}.${message.date}`;
        const ageMs = replayTimeMs - radioTimeMs;
        return ageMs >= 0 && ageMs <= 15_000 && !notifiedRadioRef.current.has(radioId);
      })
      .slice(-3);

    newRadioMessages.forEach((message, index) => {
      const radioId = `${message.driverNumber}.${message.date}`;
      const radioDriver = drivers[message.driverNumber];
      const radioCode = radioDriver?.Tla ?? leaderboard.find((entry) => entry.driverNumber === message.driverNumber)?.driver ?? message.driverNumber;
      notifiedRadioRef.current.add(radioId);
      window.setTimeout(() => showPopup("info", "TEAM RADIO", `${radioCode} RADIO AVAILABLE`), index * 600);
    });
  }, [drivers, leaderboard, replayControl.currentTimestamp, replayControl.isPlaying, showPopup, teamRadioAlertMessages]);

  useEffect(() => {
    if (!replayControl.currentTimestamp) return;

    const replayTimeMs = new Date(replayControl.currentTimestamp).getTime();
    const previousReplayTimeMs = performanceLastReplayTimeRef.current;
    const movedBackward = previousReplayTimeMs !== null && replayTimeMs < previousReplayTimeMs - 1_000;

    if (movedBackward) {
      notifiedPerformanceRef.current.clear();
    }

    performanceLastReplayTimeRef.current = replayTimeMs;

    if (!replayControl.isPlaying) return;

    const eligiblePerformanceEvents = performanceEvents
      .filter((event) => {
        const eventTimeMs = new Date(event.date).getTime();
        const ageMs = replayTimeMs - eventTimeMs;
        return ageMs >= 0 && ageMs <= 12_000 && !notifiedPerformanceRef.current.has(event.id);
      })
      .sort((a, b) => {
        const priority = { "fastest-lap": 0, "purple-sector": 1, "personal-lap": 2 } satisfies Record<PerformanceEvent["type"], number>;
        return priority[a.type] - priority[b.type] || new Date(a.date).getTime() - new Date(b.date).getTime();
      });

    eligiblePerformanceEvents.forEach((event) => notifiedPerformanceRef.current.add(event.id));
    const newPerformanceEvents = eligiblePerformanceEvents.slice(0, 3);

    newPerformanceEvents.forEach((event, index) => {
      const eventDriver = drivers[event.driverNumber];
      const eventCode = eventDriver?.Tla ?? leaderboard.find((entry) => entry.driverNumber === event.driverNumber)?.driver ?? event.driverNumber;
      const notification = getPerformanceNotification(event, eventCode);
      window.setTimeout(() => showPopup(notification.type, notification.title, notification.text), index * 650);
    });
  }, [drivers, leaderboard, performanceEvents, replayControl.currentTimestamp, replayControl.isPlaying, showPopup]);

  useEffect(() => {
    if (!replayControl.currentTimestamp) return;

    const replayTimeMs = new Date(replayControl.currentTimestamp).getTime();
    const previousReplayTimeMs = pitLastReplayTimeRef.current;
    const movedBackward = previousReplayTimeMs !== null && replayTimeMs < previousReplayTimeMs - 1_000;

    if (movedBackward) {
      notifiedPitRef.current.clear();
    }

    pitLastReplayTimeRef.current = replayTimeMs;

    if (!replayControl.isPlaying) return;

    const eligiblePitEvents = pitEvents
      .filter((event) => {
        const eventTimeMs = new Date(event.date).getTime();
        const ageMs = replayTimeMs - eventTimeMs;
        return ageMs >= 0 && ageMs <= 18_000 && !notifiedPitRef.current.has(event.id);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    eligiblePitEvents.forEach((event) => notifiedPitRef.current.add(event.id));
    const newPitEvents = eligiblePitEvents.slice(0, 4);

    newPitEvents.forEach((event, index) => {
      const eventDriver = drivers[event.driverNumber];
      const eventCode = eventDriver?.Tla ?? leaderboard.find((entry) => entry.driverNumber === event.driverNumber)?.driver ?? event.driverNumber;
      const notification = getPitNotification(event, eventCode);
      notifiedPitRef.current.add(event.id);
      window.setTimeout(() => showPopup(notification.type, notification.title, notification.text), index * 700);
    });
  }, [drivers, leaderboard, pitEvents, replayControl.currentTimestamp, replayControl.isPlaying, showPopup]);

  useEffect(() => {
    if (!replayControl.currentTimestamp || !replayControl.isPlaying) return;

    const replayTimeMs = new Date(replayControl.currentTimestamp).getTime();
    const notifications = raceControlMessages
      .map((message) => {
        const messageTimeMs = new Date(message.date).getTime();
        const ageMs = replayTimeMs - messageTimeMs;
        const messageId = `${message.date}.${message.message}`;
        const notification = getRaceControlNotification(message);
        return { ageMs, messageId, notification };
      })
      .filter(({ ageMs, messageId, notification }) => notification && ageMs >= 0 && ageMs <= 10_000 && !notifiedRaceControlRef.current.has(messageId));

    notifications.forEach(({ messageId, notification }, index) => {
      if (!notification) return;
      notifiedRaceControlRef.current.add(messageId);
      window.setTimeout(() => showPopup(notification.type, notification.title, notification.text), index * 600);
    });
  }, [raceControlMessages, replayControl.currentTimestamp, replayControl.isPlaying, showPopup]);
  const mapRaceControlMessages = useMemo(
    () => raceControlMessages.map((message) => ({
      Utc: message.date,
      Lap: message.lap ?? 0,
      Message: message.message,
      Category: message.category ?? "Other",
      Flag: message.flag as never,
      Scope: message.scope as never,
      Sector: message.sector,
    })),
    [raceControlMessages],
  );

  return (
    <div className="h-screen w-screen bg-bg px-4 pt-8 pb-20 flex flex-col gap-4 text-text font-mono relative overflow-hidden transition-all duration-500">
      <AnimatedThemeBackground enabled={animatedBackgroundEnabled} intensity={animatedBackgroundIntensity} />
      <div className={`absolute inset-0 border-[4px] rounded-lg pointer-events-none transition-all duration-1000 ${getFlagGlowClass()} z-50`} />

      <HeaderBar activeTab={activeTab} currentLap={currentLap} liveHealth={liveHealth} liveHealthLabel={liveHealthLabel} mode={mode} totalLaps={totalLaps} uaSafetyModeEnabled={uaSafetyModeEnabled} onModeChange={handleModeChange} onTabChange={setActiveTab} />

      {activeTab === "telemetry" && (
        <main className="relative z-10 flex-1 min-h-0 grid grid-cols-12 gap-4">
          <div className="col-span-3 flex flex-col gap-4 min-h-0">
            <PanelErrorBoundary label="Leaderboard">
              <LeaderboardPanel focusedDriverNumber={focusedDriverNumber} leaderboard={leaderboard} onFocusedDriverChange={setFocusedDriver} />
            </PanelErrorBoundary>
            <PanelErrorBoundary label="Race Control">
              <RaceControlPanel drivers={drivers} latestRaceControl={latestRaceControl} messages={raceControlMessages} mode={mode} trackFlag={trackFlag} />
            </PanelErrorBoundary>
          </div>

          <div className="col-span-6 flex flex-col gap-4 min-h-0">
            <PanelErrorBoundary label="Track Map">
              <div className="flex-1 bg-panel rounded-xl border border-line p-4 flex flex-col relative min-h-0">
                <h2 className="text-muted text-xs font-bold tracking-widest absolute top-4 left-4 z-10">TRACK DOMINANCE</h2>

                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-line rounded-xl mt-8 relative overflow-hidden min-h-0">
                  <TrackMap circuitKey={selectedSessionInfo?.circuit_key ?? (selectedSession === DEFAULT_SESSION ? 61 : undefined)} drivers={drivers} focusedDriverNumber={focusedDriverNumber} leaderboard={leaderboard} positions={positions} raceControlMessages={mapRaceControlMessages} trackBounds={trackBounds} trackPath={trackPath} />
                </div>
              </div>
            </PanelErrorBoundary>

            <PanelErrorBoundary label="Team Radio">
              <TeamRadioPanel focusedTeam={focusedTeam} focusedCode={focusedCode} messages={focusedTeamRadioMessages} />
            </PanelErrorBoundary>
          </div>

          <PanelErrorBoundary label="Telemetry">
            <TelemetryPanel focusedCode={focusedCode} lapSummary={lapSummary} sourceMessage={sourceMessage} sourceStatus={sourceStatus} stintSummary={stintSummary} telemetry={telemetry} weather={weather} />
          </PanelErrorBoundary>
        </main>
      )}

      {activeTab === "drivers" && (
        <div className="relative z-10 flex flex-1 min-h-0">
          <DriversStandings error={championshipStandings.error} isLoading={championshipStandings.isLoading} standings={championshipStandings.standings} onRefresh={championshipStandings.refresh} />
        </div>
      )}
      {activeTab === "constructors" && (
        <div className="relative z-10 flex flex-1 min-h-0">
          <ConstructorsStandings error={championshipStandings.error} isLoading={championshipStandings.isLoading} standings={championshipStandings.standings} onRefresh={championshipStandings.refresh} />
        </div>
      )}
      {activeTab === "media" && (
        <div className="relative z-10 flex flex-1 min-h-0">
          <MediaPanel />
        </div>
      )}
      {activeTab === "ua-monitor" && uaSafetyModeEnabled && (
        <div className="relative z-10 flex flex-1 min-h-0">
          <UaMonitorPanel />
        </div>
      )}
      {activeTab === "settings" && (
        <div className="relative z-10 flex flex-1 min-h-0">
          <SettingsPanel
            sessions={sessions}
            selectedSession={selectedSession}
            soundSettings={soundSettings}
            themeId={themeId}
            themes={VMAX_THEMES}
            animatedBackgroundEnabled={animatedBackgroundEnabled}
            animatedBackgroundIntensity={animatedBackgroundIntensity}
            developerModeEnabled={developerModeEnabled}
            developerAccessMessage={developerAccessMessage}
            discordPresenceEnabled={discordPresenceEnabled}
            uaSafetyModeEnabled={uaSafetyModeEnabled}
            onSessionChange={handleSessionChange}
            onSoundSettingsChange={setSoundSettings}
            onThemeChange={setThemeId}
            onAnimatedBackgroundChange={setAnimatedBackgroundEnabled}
            onAnimatedBackgroundIntensityChange={setAnimatedBackgroundIntensity}
            onDeveloperUnlock={handleDeveloperUnlock}
            onDeveloperLock={handleDeveloperLock}
            onDiscordPresenceChange={setDiscordPresenceEnabled}
            onTestSound={(key, gate) => playSound(key, gate)}
            onUaSafetyModeChange={handleUaSafetyModeChange}
          />
        </div>
      )}

      <div className="absolute top-16 left-0 w-full flex justify-center pointer-events-none z-50">
        <div
          className={`w-[500px] bg-[#0f1118]/95 backdrop-blur border-l-4 p-4 shadow-2xl transition-all duration-500 ease-out rounded-r-lg flex flex-col gap-1 ${
            popup.visible ? "translate-y-0 opacity-100" : "-translate-y-[150%] opacity-0"
          } ${
            popup.type === "penalty"
              ? "border-f1-red shadow-[0_0_20px_rgba(255,24,1,0.3)]"
              : popup.type === "investigation"
                ? "border-warning shadow-[0_0_20px_rgba(245,200,106,0.3)]"
                : popup.type === "overtake"
                  ? "border-accent shadow-[0_0_20px_rgba(51,230,161,0.3)]"
                  : popup.type === "fastest"
                    ? "border-fuchsia-400 shadow-[0_0_24px_rgba(232,121,249,0.38)]"
                    : popup.type === "pit"
                      ? "border-warning shadow-[0_0_22px_rgba(245,200,106,0.34)]"
                      : "border-white"
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-widest ${popup.type === "fastest" ? "text-fuchsia-300" : popup.type === "pit" ? "text-warning" : "text-muted"}`}>{popup.title}</span>
          <span className="text-sm font-bold text-white leading-tight uppercase">{popup.text}</span>
        </div>
      </div>

      <ReplayBar
        focusedCode={focusedCode}
        focusedDriverNumber={focusedDriverNumber}
        mode={mode}
        replayControl={replayControl}
        replayTime={replayTime}
        developerModeEnabled={developerModeEnabled}
        onJumpReplay={jumpReplay}
        onManualTrackFlag={handleManualTrackFlag}
        onReplayPlayingChange={setReplayPlaying}
        onReplaySpeedChange={setReplaySpeed}
        onSeekReplay={seekReplay}
        onShowPopup={showPopup}
      />
    </div>
  );
}

export default App;

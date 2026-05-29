import { useState } from "react";

import { ConstructorsStandings } from "./components/ConstructorsStandings";
import { DriversStandings } from "./components/DriversStandings";
import { SettingsPanel } from "./components/SettingsPanel";
import TrackMap from "./components/TrackMap";
import { DEFAULT_SESSION, useRaceData } from "./hooks/useRaceData";
import type { AppMode, ElectronAPI, TrackFlag } from "./types/ipc";

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

type ActiveTab = "telemetry" | "drivers" | "constructors" | "settings";
type PopupState = { visible: boolean; type: "info" | "penalty" | "investigation" | "overtake"; title: string; text: string };
type Tone = "accent" | "warning" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  accent: "text-accent border-accent/50 bg-accent/10",
  warning: "text-warning border-warning/50 bg-warning/10",
  danger: "text-f1-red border-f1-red/50 bg-f1-red/10",
  muted: "text-muted border-line bg-panel-alt/60",
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getAeroEstimate = (telemetry: { speed: number; throttle: number; brake: number }) => {
  if (telemetry.brake > 2 || telemetry.speed < 160) return { label: "CORNER", tone: "accent" as Tone, confidence: "INFERRED" };
  if (telemetry.speed > 235 && telemetry.throttle > 65) return { label: "STRAIGHT", tone: "warning" as Tone, confidence: "INFERRED" };
  return { label: "TRANSITION", tone: "muted" as Tone, confidence: "INFERRED" };
};

const getEnergyEstimate = (telemetry: { speed: number; throttle: number; brake: number }) => {
  if (telemetry.brake > 8) return { label: "HARVEST", tone: "warning" as Tone, value: clamp(telemetry.brake, 0, 100), caption: "BRAKE REGEN" };
  if (telemetry.throttle < 8 && telemetry.speed > 120) return { label: "LIFT REGEN", tone: "warning" as Tone, value: 35, caption: "LIFT-OFF" };
  if (telemetry.throttle > 65) return { label: "DEPLOY", tone: "accent" as Tone, value: clamp(telemetry.throttle, 0, 100), caption: "MGU-K EST." };
  return { label: "BALANCE", tone: "muted" as Tone, value: 15, caption: "NEUTRAL" };
};

const SystemTile = ({ label, value, meta, tone = "muted" }: { label: string; value: string; meta: string; tone?: Tone }) => (
  <div className={`rounded-lg border px-3 py-2 ${toneClass[tone]}`}>
    <div className="text-[9px] text-muted font-bold tracking-widest uppercase">{label}</div>
    <div className="mt-1 text-sm font-bold uppercase">{value}</div>
    <div className="mt-0.5 text-[9px] text-muted font-bold uppercase">{meta}</div>
  </div>
);

const TelemetryBar = ({ label, value, colorClass }: { label: string; value: number; colorClass: string }) => (
  <div>
    <div className="flex justify-between text-xs mb-2">
      <span className="text-muted">{label}</span>
      <span className="font-bold">{Math.round(value)}%</span>
    </div>
    <div className="h-2 w-full bg-panel-alt rounded-full overflow-hidden">
      <div className={`h-full transition-all duration-150 ease-linear ${colorClass}`} style={{ width: `${clamp(value, 0, 100)}%` }} />
    </div>
  </div>
);

const getCompoundClass = (compound?: string) => {
  switch (compound) {
    case "SOFT":
      return "bg-f1-red text-white";
    case "MEDIUM":
      return "bg-warning text-bg";
    case "HARD":
      return "bg-white text-bg";
    case "INTERMEDIATE":
      return "bg-accent text-bg";
    case "WET":
      return "bg-sky-400 text-bg";
    default:
      return "bg-panel-alt text-muted";
  }
};

const getCompoundLabel = (compound?: string) => compound?.slice(0, 1) ?? "-";

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("telemetry");
  const [popup, setPopup] = useState<PopupState>({ visible: false, type: "info", title: "", text: "" });
  const { raceState, sessions, selectedSession, selectedSessionInfo, setMode, setReplaySession, setManualTrackFlag, setFocusedDriver, setReplayPlaying, setReplaySpeed, seekReplay, jumpReplay } = useRaceData();
  const { mode, focusedDriverNumber, telemetry, trackFlag, leaderboard, drivers, positions, trackBounds, trackPath, raceControlMessages, sourceStatus, sourceMessage, replayControl } = raceState;

  const showPopup = (type: PopupState["type"], title: string, text: string) => {
    setPopup({ visible: true, type, title, text });
    window.setTimeout(() => {
      setPopup((current) => ({ ...current, visible: false }));
    }, 5000);
  };

  const handleModeChange = (mode: AppMode) => {
    setMode(mode);
  };

  const handleSessionChange = (sessionKey: number) => {
    setReplaySession(sessionKey);
  };

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
        return "border-transparent animate-party";
      default:
        return "border-transparent";
    }
  };

  const tabClass = (tab: ActiveTab) =>
    `px-4 py-2 rounded-lg text-xs font-bold tracking-wider transition-colors uppercase ${
      activeTab === tab ? "bg-f1-red text-white" : "hover:bg-panel-alt text-muted"
    }`;

  const replayTime = replayControl.currentTimestamp
    ? new Date(replayControl.currentTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const focusedDriver = drivers[focusedDriverNumber] ?? drivers[telemetry.driverNumber];
  const focusedLeaderboardEntry = leaderboard.find((driver) => driver.driverNumber === focusedDriverNumber);
  const focusedCode = focusedDriver?.Tla ?? focusedLeaderboardEntry?.driver ?? focusedDriverNumber;
  const focusedTeam = focusedDriver?.TeamName ?? "TEAM";
  const currentLap = focusedLeaderboardEntry?.lap ?? Math.max(0, ...leaderboard.map((driver) => driver.lap ?? 0));
  const rpm = telemetry.rpm ?? 0;
  const rpmLoad = rpm > 0 ? clamp((rpm / 12000) * 100, 0, 100) : 0;
  const aeroEstimate = getAeroEstimate(telemetry);
  const energyEstimate = getEnergyEstimate(telemetry);
  const estimatedKw = energyEstimate.label === "DEPLOY" ? Math.round((energyEstimate.value / 100) * 350) : 0;
  const latestRaceControl = raceControlMessages.at(-1);

  return (
    <div className="h-screen w-screen bg-bg p-4 pb-20 flex flex-col gap-4 text-text font-mono relative overflow-hidden transition-all duration-500">
      <div className={`absolute inset-0 border-[4px] rounded-lg pointer-events-none transition-all duration-1000 ${getFlagGlowClass()} z-50`} />

      <header className="flex justify-between items-center bg-panel p-4 rounded-xl border border-line drag-region">
        <div className="flex items-center gap-8 no-drag">
          <div className="text-f1-red font-bold text-xl tracking-widest select-none cursor-default">V-MAX</div>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab("telemetry")} className={tabClass("telemetry")}>
              Live Telemetry
            </button>
            <button onClick={() => setActiveTab("drivers")} className={tabClass("drivers")}>
              Drivers
            </button>
            <button onClick={() => setActiveTab("constructors")} className={tabClass("constructors")}>
              Constructors
            </button>
            <button onClick={() => setActiveTab("settings")} className={tabClass("settings")}>
              Settings
            </button>
          </div>
        </div>
        <div className="flex gap-4 items-center no-drag">
          <div className="text-sm text-muted">{currentLap > 0 ? `LAP ${currentLap} / --` : "LAP -- / --"}</div>
          <div className="flex items-center bg-panel-alt p-1 rounded-lg border border-line">
            <button
              onClick={() => handleModeChange("archive")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                mode === "archive" ? "bg-zinc-700 text-white shadow-sm" : "text-muted hover:text-white"
              }`}
            >
              REPLAY MODE
            </button>
            <button
              onClick={() => handleModeChange("live")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                mode === "live" ? "bg-f1-red text-white shadow-[0_0_10px_#FF180140]" : "text-muted hover:text-white"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${mode === "live" ? "bg-white animate-pulse" : "bg-f1-red"}`}></div>
              LIVE MODE
            </button>
          </div>
        </div>
      </header>

      {activeTab === "telemetry" && (
        <main className="flex-1 min-h-0 grid grid-cols-12 gap-4">
          <div className="col-span-3 flex flex-col gap-4 min-h-0">
            <div className="flex-1 bg-panel rounded-xl border border-line p-4 flex flex-col min-h-0">
              <h2 className="text-muted text-xs font-bold tracking-widest mb-4">LEADERBOARD</h2>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {leaderboard.length > 0 ? (
                  leaderboard.map((driver) => {
                    const isFocused = driver.driverNumber === focusedDriverNumber;
                    return (
                    <button
                      key={driver.driverNumber}
                      onClick={() => setFocusedDriver(driver.driverNumber)}
                      className={`w-full flex items-center py-1.5 px-1 border-b border-line hover:bg-panel-alt cursor-pointer transition-colors text-sm text-left ${
                        isFocused ? "bg-panel-alt text-white border-l-2 border-l-accent" : ""
                      }`}
                    >
                      <span className="w-6 font-bold">{driver.pos}</span>
                      <div className="w-1 h-3.5 rounded mr-3" style={{ backgroundColor: driver.color }}></div>
                      <span className="flex-1 font-bold">{driver.driver}</span>
                      <span className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-black ${getCompoundClass(driver.compound)}`}>
                        {getCompoundLabel(driver.compound)}
                      </span>
                      <span className="mr-2 w-7 text-[10px] text-muted tabular-nums">{driver.lap ? `L${driver.lap}` : "--"}</span>
                      <span className="text-accent font-bold text-xs tabular-nums">{driver.gap}</span>
                    </button>
                    );
                  })
                ) : (
                  <div className="text-muted text-xs text-center mt-10">Waiting for replay telemetry...</div>
                )}
              </div>
            </div>

            <div className="h-24 shrink-0 bg-panel rounded-xl border border-line p-4 flex flex-col justify-center">
              <h2 className="text-muted text-xs font-bold tracking-widest mb-2">RACE CONTROL</h2>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted">{latestRaceControl?.lap ? `L${latestRaceControl.lap}` : mode.toUpperCase()}</span>
                <span className={trackFlag === "Red" ? "text-f1-red" : trackFlag === "Green" ? "text-accent" : "text-warning font-bold"}>
                  {trackFlag === "Chequered" ? "Session Ended" : `${trackFlag} Flag`}
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] text-muted uppercase">{latestRaceControl?.message ?? "No race control messages yet"}</div>
            </div>
          </div>

          <div className="col-span-6 flex flex-col gap-4 min-h-0">
            <div className="flex-1 bg-panel rounded-xl border border-line p-4 flex flex-col relative min-h-0">
              <h2 className="text-muted text-xs font-bold tracking-widest absolute top-4 left-4 z-10">TRACK DOMINANCE</h2>

              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-line rounded-xl mt-8 relative overflow-hidden min-h-0">
                <TrackMap circuitKey={selectedSessionInfo?.circuit_key ?? (selectedSession === DEFAULT_SESSION ? 61 : undefined)} drivers={drivers} leaderboard={leaderboard} positions={positions} raceControlMessages={raceControlMessages.map((message) => ({ Utc: message.date, Lap: message.lap ?? 0, Message: message.message, Category: message.category ?? "Other", Flag: message.flag as never, Scope: message.scope as never, Sector: message.sector }))} trackBounds={trackBounds} trackPath={trackPath} />
              </div>
            </div>

            <div className="h-28 bg-panel rounded-xl border border-line p-4 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-muted text-xs font-bold tracking-widest">TEAM RADIO</h2>
                <span className="text-[10px] text-f1-red font-bold animate-pulse">LIVE INTERCEPT</span>
              </div>
              <div className="flex-1 flex items-center gap-4 bg-panel-alt rounded-lg px-4 border border-line">
                <button aria-label="Play team radio" className="w-10 h-10 shrink-0 rounded-full bg-accent/20 flex items-center justify-center text-accent hover:bg-accent/40 transition-colors border border-accent/50 cursor-pointer">
                  <span className="ml-0.5 h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-current" />
                </button>
                <div className="flex flex-col min-w-48">
                  <span className="text-xs font-bold text-white mb-0.5">{focusedTeam.toUpperCase()} RADIO {focusedCode}</span>
                  <span className="text-[10px] text-muted uppercase">"Pace is good. Tyre deg is manageable."</span>
                </div>
                <div className="flex-1 flex items-center justify-end gap-[2px] opacity-70">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="w-1 bg-accent rounded-full animate-pulse" style={{ height: `${(i % 5) * 4 + 8}px`, animationDelay: `${i * 0.05}s` }}></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-3 bg-panel rounded-xl border border-line p-4 flex flex-col transition-all duration-300 min-h-0">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-muted text-xs font-bold tracking-widest">2026 TELEMETRY ({focusedCode})</h2>
              <span className={sourceStatus === "error" ? "text-f1-red text-[10px] font-bold uppercase" : "text-muted text-[10px] font-bold uppercase"}>
                {sourceStatus}
              </span>
            </div>
            <div className="mb-4 min-h-8 text-[10px] text-muted uppercase leading-relaxed">{sourceMessage}</div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <div className="text-4xl font-bold transition-all duration-100">
                  {telemetry.speed}
                  <span className="text-sm text-muted">KM/H</span>
                </div>
                <div className="text-xs text-muted mt-1">SPEED</div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-accent transition-all duration-100">{telemetry.gear}</div>
                <div className="text-xs text-muted mt-1">GEAR</div>
              </div>
            </div>

            <div className="space-y-4">
              <TelemetryBar label="THROTTLE" value={telemetry.throttle} colorClass="bg-accent shadow-[0_0_8px_#33E6A1]" />
              <TelemetryBar label="BRAKE" value={telemetry.brake} colorClass="bg-f1-red shadow-[0_0_8px_#FF1801]" />
              <TelemetryBar label="RPM LOAD" value={rpmLoad} colorClass="bg-warning shadow-[0_0_8px_#F5C86A]" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <SystemTile label="RPM" value={rpm > 0 ? rpm.toLocaleString() : "NO FEED"} meta="CAR DATA" tone={rpm > 0 ? "warning" : "muted"} />
              <SystemTile label="AERO" value={aeroEstimate.label} meta={aeroEstimate.confidence} tone={aeroEstimate.tone} />
              <SystemTile label="ENERGY" value={energyEstimate.label} meta={energyEstimate.caption} tone={energyEstimate.tone} />
              <SystemTile label="OVERRIDE" value="NO FEED" meta="DETECTION GAP" tone="muted" />
            </div>

            <div className="mt-5 border border-line rounded-lg bg-panel-alt/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted font-bold tracking-widest">MGU-K WINDOW</span>
                <span className="text-[10px] text-accent font-bold">{estimatedKw > 0 ? `${estimatedKw} KW EST.` : "STANDBY"}</span>
              </div>
              <div className="h-16 flex items-end gap-1 opacity-80">
                {Array.from({ length: 18 }).map((_, i) => {
                  const wave = energyEstimate.value * (0.45 + ((i % 6) + 1) / 12);
                  return <div key={i} className="flex-1 rounded-t bg-accent/70" style={{ height: `${clamp(wave, 8, 100)}%` }} />;
                })}
              </div>
            </div>
          </div>
        </main>
      )}

      {activeTab === "drivers" && <DriversStandings />}
      {activeTab === "constructors" && <ConstructorsStandings />}
      {activeTab === "settings" && <SettingsPanel sessions={sessions} selectedSession={selectedSession} onSessionChange={handleSessionChange} />}

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
                  : "border-white"
          }`}
        >
          <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{popup.title}</span>
          <span className="text-sm font-bold text-white leading-tight uppercase">{popup.text}</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-1.5 bg-panel p-2 rounded-xl border border-line z-50 overflow-hidden">
        <span className="text-xs text-muted font-bold mr-2 uppercase">Replay:</span>
        <button
          onClick={() => setReplayPlaying(!replayControl.isPlaying)}
          disabled={mode !== "archive"}
          className="w-9 h-7 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
          aria-label={replayControl.isPlaying ? "Pause replay" : "Play replay"}
        >
          {replayControl.isPlaying ? "II" : ">"}
        </button>
        {[0.5, 1, 2, 4].map((speed) => (
          <button
            key={speed}
            onClick={() => setReplaySpeed(speed)}
            disabled={mode !== "archive"}
            className={`px-2 py-1 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer ${
              replayControl.speed === speed ? "text-accent border-accent/60" : ""
            }`}
          >
            {speed}x
          </button>
        ))}
        <button
          onClick={() => jumpReplay(-10)}
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
          onChange={(event) => seekReplay(Number(event.target.value) / 1000)}
          className="w-36 accent-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        />
        <button
          onClick={() => jumpReplay(10)}
          disabled={mode !== "archive" || replayControl.total === 0}
          className="px-2 py-1 bg-panel-alt hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed border border-line rounded text-xs font-bold transition-colors cursor-pointer"
        >
          +10s
        </button>
        <span className="w-12 text-[10px] text-muted tabular-nums">
          {replayControl.total > 0 ? `${Math.round(replayControl.progress * 100)}%` : "--"}
        </span>
        <span className="w-16 text-[10px] text-muted tabular-nums">
          {replayTime}
        </span>
        <span className="w-20 text-[10px] text-muted tabular-nums">
          {replayControl.total > 0 ? `${replayControl.currentIndex}/${replayControl.total}` : "0/0"}
        </span>
        <div className="w-px h-6 bg-line mx-1.5"></div>
        <span className="text-xs text-muted font-bold mr-1 uppercase">Sim:</span>
        {(["Green", "Yellow", "Red", "SC", "Chequered"] satisfies TrackFlag[]).map((flag) => (
          <button key={flag} onClick={() => setManualTrackFlag(flag)} className="px-2.5 py-1 bg-panel-alt hover:bg-line border border-line rounded text-xs font-bold transition-colors uppercase cursor-pointer">
            {flag}
          </button>
        ))}
        <div className="w-px h-6 bg-line mx-1.5"></div>
        <button onClick={() => showPopup("overtake", "RACE CONTROL", "OVERTAKE MODE ENABLED")} className="px-2.5 py-1 bg-accent/20 text-accent hover:bg-accent/40 border border-accent/50 rounded text-xs font-bold uppercase cursor-pointer">
          Overtake
        </button>
        <button onClick={() => showPopup("investigation", "INCIDENT", `CAR ${focusedDriverNumber} (${focusedCode}) UNDER INVESTIGATION`)} className="px-2.5 py-1 bg-warning/20 text-warning hover:bg-warning/40 border border-warning/50 rounded text-xs font-bold uppercase cursor-pointer">
          Investigate
        </button>
        <button onClick={() => showPopup("penalty", "PENALTY", `5 SECOND TIME PENALTY FOR CAR ${focusedDriverNumber} (${focusedCode}) - TRACK LIMITS`)} className="px-2.5 py-1 bg-f1-red/20 text-f1-red hover:bg-f1-red/40 border border-f1-red/50 rounded text-xs font-bold uppercase cursor-pointer">
          Penalty
        </button>
      </div>
    </div>
  );
}

export default App;

import type { SoundGate, SoundKey, SoundSettings } from "../lib/sounds";
import type { AnimatedBackgroundIntensity, ThemeId, VMaxTheme } from "../lib/themes";
import type { ReplaySession } from "../types/ipc";

type SettingsPanelProps = {
	sessions?: ReplaySession[];
	selectedSession?: number;
	soundSettings: SoundSettings;
	themeId: ThemeId;
	themes: VMaxTheme[];
	animatedBackgroundEnabled: boolean;
	animatedBackgroundIntensity: AnimatedBackgroundIntensity;
	developerModeEnabled: boolean;
	developerAccessMessage?: string;
	discordPresenceEnabled: boolean;
	uaSafetyModeEnabled: boolean;
	onSessionChange?: (sessionKey: number) => void;
	onSoundSettingsChange: (settings: SoundSettings) => void;
	onThemeChange: (themeId: ThemeId) => void;
	onAnimatedBackgroundChange: (enabled: boolean) => void;
	onAnimatedBackgroundIntensityChange: (intensity: AnimatedBackgroundIntensity) => void;
	onDeveloperUnlock: (password: string) => void;
	onDeveloperLock: () => void;
	onDiscordPresenceChange: (enabled: boolean) => void;
	onTestSound: (key: SoundKey, gate?: SoundGate) => void;
	onUaSafetyModeChange: (enabled: boolean) => void;
};

const Switch = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		onClick={() => onChange(!checked)}
		className={`relative h-6 w-12 shrink-0 rounded-full border transition-colors duration-200 ${
			checked ? "border-accent/60 bg-accent/80 shadow-[0_0_14px_rgba(51,230,161,0.18)]" : "border-line bg-panel-alt"
		}`}
	>
		<span
			className={`absolute left-0.5 top-px h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
				checked ? "translate-x-6" : "translate-x-0"
			}`}
		/>
	</button>
);

const Toggle = ({ checked, label, description, onChange }: { checked: boolean; label: string; description: string; onChange: (checked: boolean) => void }) => (
	<label className="flex items-center justify-between gap-4 rounded-lg border border-line bg-bg p-4">
		<span className="min-w-0">
			<span className="block text-sm font-bold text-white">{label}</span>
			<span className="block text-xs text-muted">{description}</span>
		</span>
		<Switch checked={checked} onChange={onChange} />
	</label>
);

const SoundToggle = ({
	checked,
	description,
	gate,
	label,
	onChange,
	onTest,
	soundKey,
}: {
	checked: boolean;
	description: string;
	gate?: SoundGate;
	label: string;
	onChange: (checked: boolean) => void;
	onTest: (key: SoundKey, gate?: SoundGate) => void;
	soundKey: SoundKey;
}) => (
	<label className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-line bg-panel-alt/60 p-3">
		<span className="min-w-0">
			<span className="block text-xs font-bold text-white">{label}</span>
			<span className="block text-[10px] text-muted">{description}</span>
		</span>
		<button
			type="button"
			onClick={(event) => {
				event.preventDefault();
				onTest(soundKey, gate);
			}}
			className="rounded border border-line bg-bg px-2 py-1 text-[9px] font-bold uppercase text-muted transition-colors hover:border-accent hover:text-accent"
		>
			Test
		</button>
		<Switch checked={checked} onChange={onChange} />
	</label>
);

const updatePacks = [
	{ name: "Season 0 Core", status: "Installed", meta: "Original streaks and team themes", tone: "accent" },
	{ name: "Madrid GP Pack", status: "Planned", meta: "1-3 event animations", tone: "warning" },
	{ name: "Barcelona GP Pack", status: "Planned", meta: "Circuit-specific color run", tone: "warning" },
];

export const SettingsPanel = ({
	sessions = [],
	selectedSession,
	soundSettings,
	themeId,
	themes,
	animatedBackgroundEnabled,
	animatedBackgroundIntensity,
	developerModeEnabled,
	developerAccessMessage,
	discordPresenceEnabled,
	uaSafetyModeEnabled,
	onSessionChange,
	onSoundSettingsChange,
	onThemeChange,
	onAnimatedBackgroundChange,
	onAnimatedBackgroundIntensityChange,
	onDeveloperUnlock,
	onDeveloperLock,
	onDiscordPresenceChange,
	onTestSound,
	onUaSafetyModeChange,
}: SettingsPanelProps) => {
	const updateSound = (patch: Partial<SoundSettings>) => onSoundSettingsChange({ ...soundSettings, ...patch });

	return (
		<main className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-line bg-panel p-8 custom-scrollbar">
			<div className="mb-8">
				<h2 className="mb-2 text-xl font-bold">V-Max Settings</h2>
				<p className="text-sm text-muted">Replay source, audio alerts, and local runtime controls.</p>
			</div>

			<div className="grid grid-cols-2 gap-6">
				<section className="col-span-2 flex flex-col gap-4 rounded-xl border border-line bg-panel-alt p-6">
					<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent">
						<span className="h-2 w-2 rounded-full bg-accent" />
						Replay Mode
					</h3>

					<div className="flex flex-col gap-2">
						<label className="text-sm font-bold text-muted">Replay session</label>
						<div className="flex gap-4">
							<select
								value={selectedSession}
								onChange={(event) => onSessionChange?.(Number(event.target.value))}
								className="flex-1 rounded-lg border border-line bg-bg p-3 text-sm text-white outline-none transition-colors focus:border-accent"
							>
								{sessions.length === 0 && <option disabled>Loading sessions...</option>}
								{sessions.map((session) => (
									<option key={session.session_key} value={session.session_key}>
										{session.year} {session.country_name ?? "Local"} - {session.session_name}
										{session.date_start ? ` (${new Date(session.date_start).toLocaleDateString()})` : ""}
										{session.driver_count ? ` - ${session.driver_count} drivers` : ""}
									</option>
								))}
							</select>
							<button onClick={() => window.electronAPI?.setMode("archive")} className="rounded-lg bg-zinc-700 px-6 py-3 font-bold text-white transition-colors hover:bg-zinc-600">
								START REPLAY
							</button>
						</div>
						<p className="mt-1 text-xs text-muted opacity-60">Changing the session restarts the local replay bridge.</p>
					</div>
				</section>

				<section className="col-span-2 flex flex-col gap-4 rounded-xl border border-line bg-panel-alt p-6">
					<div className="flex items-center justify-between gap-4">
						<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-warning">
							<span className="h-2 w-2 rounded-full bg-warning" />
							Audio Alerts
						</h3>
						<button onClick={() => onTestSound("radio", "radioAlerts")} className="rounded border border-line bg-bg px-3 py-2 text-xs font-bold uppercase text-white transition-colors hover:border-accent hover:text-accent">
							Test radio
						</button>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<Toggle checked={soundSettings.enabled} label="Master sound" description="Global switch for all V-Max alert sounds." onChange={(enabled) => updateSound({ enabled })} />
						<Toggle checked={soundSettings.radioAlerts} label="Team radio" description="Short cue when a new focused-driver radio appears." onChange={(radioAlerts) => updateSound({ radioAlerts })} />
						<Toggle checked={soundSettings.raceControlAlerts} label="Race Control" description="Flags, incidents, penalties, and Straight mode alerts." onChange={(raceControlAlerts) => updateSound({ raceControlAlerts })} />
						<Toggle checked={soundSettings.uiSounds} label="UI feedback" description="Reserved for buttons and lightweight interface cues." onChange={(uiSounds) => updateSound({ uiSounds })} />
					</div>

					<div className="grid grid-cols-3 gap-4">
						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-accent">Performance</div>
							<div className="grid gap-2">
								<SoundToggle checked={soundSettings.fastestLapSound} label="Race fastest lap" description="Overall fastest lap notification." soundKey="fastestLap" gate="fastestLapSound" onTest={onTestSound} onChange={(fastestLapSound) => updateSound({ fastestLapSound })} />
								<SoundToggle checked={soundSettings.personalBestSound} label="Personal best" description="Driver improves their own lap time." soundKey="fastestLap" gate="personalBestSound" onTest={onTestSound} onChange={(personalBestSound) => updateSound({ personalBestSound })} />
								<SoundToggle checked={soundSettings.purpleSectorSound} label="Purple sector" description="Best sector of the session." soundKey="fastestLap" gate="purpleSectorSound" onTest={onTestSound} onChange={(purpleSectorSound) => updateSound({ purpleSectorSound })} />
								<SoundToggle checked={soundSettings.pitStopSound} label="Pit stop" description="New tyre stint or pit-stop alert." soundKey="warning" gate="pitStopSound" onTest={onTestSound} onChange={(pitStopSound) => updateSound({ pitStopSound })} />
							</div>
						</div>

						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-warning">Race control</div>
							<div className="grid gap-2">
								<SoundToggle checked={soundSettings.greenFlagSound} label="Green flag" description="Green flag and restart cues." soundKey="greenFlag" gate="greenFlagSound" onTest={onTestSound} onChange={(greenFlagSound) => updateSound({ greenFlagSound })} />
								<SoundToggle checked={soundSettings.yellowFlagSound} label="Yellow / SC / VSC" description="Yellow flag, safety car, and VSC cues." soundKey="yellowFlag" gate="yellowFlagSound" onTest={onTestSound} onChange={(yellowFlagSound) => updateSound({ yellowFlagSound })} />
								<SoundToggle checked={soundSettings.redFlagSound} label="Red flag" description="Session stopped or red flag cue." soundKey="redFlag" gate="redFlagSound" onTest={onTestSound} onChange={(redFlagSound) => updateSound({ redFlagSound })} />
								<SoundToggle checked={soundSettings.incidentSound} label="Incidents" description="Noted and investigation messages." soundKey="incident" gate="incidentSound" onTest={onTestSound} onChange={(incidentSound) => updateSound({ incidentSound })} />
								<SoundToggle checked={soundSettings.penaltySound} label="Penalties" description="Penalty and steward decision alerts." soundKey="penalty" gate="penaltySound" onTest={onTestSound} onChange={(penaltySound) => updateSound({ penaltySound })} />
								<SoundToggle checked={soundSettings.straightModeSound} label="Straight mode" description="Straight mode available or disabled." soundKey="straightMode" gate="straightModeSound" onTest={onTestSound} onChange={(straightModeSound) => updateSound({ straightModeSound })} />
							</div>
						</div>

						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">System</div>
							<div className="grid gap-2">
								<SoundToggle checked={soundSettings.startupSound} label="Startup" description="Program startup cue after audio unlock." soundKey="startup" gate="startupSound" onTest={onTestSound} onChange={(startupSound) => updateSound({ startupSound })} />
								<SoundToggle checked={soundSettings.shutdownSound} label="Shutdown" description="Reserved shutdown cue." soundKey="shutdown" gate="shutdownSound" onTest={onTestSound} onChange={(shutdownSound) => updateSound({ shutdownSound })} />
							</div>
						</div>
					</div>

					<label className="flex items-center gap-4 rounded-lg border border-line bg-bg p-4">
						<span className="w-28 text-sm font-bold text-muted">Volume</span>
						<input
							type="range"
							min={0}
							max={100}
							value={Math.round(soundSettings.volume * 100)}
							onChange={(event) => updateSound({ volume: Number(event.target.value) / 100 })}
							className="flex-1 accent-accent"
						/>
						<span className="w-10 text-right text-xs font-bold tabular-nums text-accent">{Math.round(soundSettings.volume * 100)}%</span>
					</label>
				</section>

				<section className="flex flex-col gap-4 rounded-xl border border-line bg-panel-alt p-6">
					<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-f1-red">
						<span className="h-2 w-2 rounded-full bg-f1-red" />
						Appearance
					</h3>
					<div className="grid grid-cols-1 gap-3">
						{themes.map((theme) => {
							const isSelected = theme.id === themeId;
							return (
								<button
									key={theme.id}
									onClick={() => onThemeChange(theme.id)}
									className={`flex items-center justify-between gap-3 rounded-lg border bg-bg p-3 text-left transition-colors ${
										isSelected ? "border-accent shadow-[0_0_16px_rgba(51,230,161,0.16)]" : "border-line hover:border-muted"
									}`}
								>
									<span className="min-w-0">
										<span className="block text-sm font-bold text-white">{theme.name}</span>
										<span className="block truncate text-[10px] text-muted">{theme.description}</span>
									</span>
									<span className="flex shrink-0 gap-1">
										<span className="h-5 w-3 rounded-sm border border-line" style={{ backgroundColor: theme.colors.f1Red }} />
										<span className="h-5 w-3 rounded-sm border border-line" style={{ backgroundColor: theme.colors.accent }} />
										<span className="h-5 w-3 rounded-sm border border-line" style={{ backgroundColor: theme.colors.warning }} />
									</span>
								</button>
							);
						})}
					</div>
					<Toggle
						checked={animatedBackgroundEnabled}
						label="Animated background"
						description="Theme-colored speed streaks behind the telemetry UI."
						onChange={onAnimatedBackgroundChange}
					/>
					<div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-bg p-4">
						<div>
							<div className="text-sm font-bold text-white">Background intensity</div>
							<div className="text-xs text-muted">Use High for low-contrast TN panels.</div>
						</div>
						<div className="flex rounded-lg border border-line bg-panel-alt p-1">
							{(["low", "medium", "high"] satisfies AnimatedBackgroundIntensity[]).map((intensity) => (
								<button
									key={intensity}
									onClick={() => onAnimatedBackgroundIntensityChange(intensity)}
									className={`px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
										animatedBackgroundIntensity === intensity ? "rounded-md bg-accent text-bg" : "text-muted hover:text-white"
									}`}
								>
									{intensity}
								</button>
							))}
						</div>
					</div>
				</section>

				<section className="flex flex-col gap-4 rounded-xl border border-line bg-panel-alt p-6">
					<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#5865F2]">
						<span className="h-2 w-2 rounded-full bg-[#5865F2]" />
						Integrations
					</h3>
					<div className="rounded-lg border border-line bg-bg p-4">
						<div className="text-sm font-bold text-white">Discord Rich Presence</div>
						<div className="text-xs text-muted">Shows replay/live status in Discord using your V-Max application asset.</div>
					</div>
					<Toggle
						checked={discordPresenceEnabled}
						label="Discord Rich Presence"
						description="Publishes focused driver, lap, replay speed, and V-Max logo to Discord."
						onChange={onDiscordPresenceChange}
					/>
					<Toggle
						checked={uaSafetyModeEnabled}
						label="Ukraine safety mode"
						description="Shows the UA Monitor tab with Kyiv / Kyiv Oblast trusted Telegram shortcuts."
						onChange={onUaSafetyModeChange}
					/>
				</section>

				<section className="col-span-2 flex flex-col gap-4 rounded-xl border border-line bg-panel-alt p-6">
					<div className="flex items-center justify-between gap-4">
						<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-warning">
							<span className={`h-2 w-2 rounded-full ${developerModeEnabled ? "bg-accent" : "bg-warning"}`} />
							Developer Access
						</h3>
						<span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${developerModeEnabled ? "border-accent/50 bg-accent/10 text-accent" : "border-warning/50 bg-warning/10 text-warning"}`}>
							{developerModeEnabled ? "Dev unlocked" : "Locked"}
						</span>
					</div>

					<form
						className="grid grid-cols-[1fr_auto] gap-4 rounded-lg border border-line bg-bg p-4"
						onSubmit={(event) => {
							event.preventDefault();
							const form = event.currentTarget;
							const formData = new FormData(form);
							onDeveloperUnlock(String(formData.get("developerPassword") ?? ""));
							form.reset();
						}}
					>
						<div className="min-w-0">
							<label htmlFor="developerPassword" className="mb-2 block text-sm font-bold text-white">SIM controls gate</label>
							<input
								id="developerPassword"
								name="developerPassword"
								type="password"
								placeholder={developerModeEnabled ? "Developer mode is active" : "Enter developer password"}
								className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-muted focus:border-accent"
							/>
							<div className={`mt-2 text-xs ${developerModeEnabled ? "text-accent" : "text-muted"}`}>
								{developerAccessMessage ?? "Unlocks the SIM CONTROLS strip in replay mode."}
							</div>
						</div>
						<div className="flex flex-col justify-end gap-2">
							<button type="submit" className="rounded border border-accent/60 bg-accent/15 px-4 py-2 text-xs font-bold uppercase text-accent transition-colors hover:bg-accent/30">
								Unlock
							</button>
							<button type="button" onClick={onDeveloperLock} className="rounded border border-line bg-panel px-4 py-2 text-xs font-bold uppercase text-muted transition-colors hover:border-f1-red hover:text-f1-red">
								Lock
							</button>
						</div>
					</form>
				</section>

				<section className="col-span-2 flex flex-col gap-4 rounded-xl border border-line bg-panel-alt p-6">
					<div className="flex items-center justify-between gap-4">
						<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent">
							<span className="h-2 w-2 rounded-full bg-accent" />
							Update Hub
						</h3>
						<span className="rounded border border-warning/50 bg-warning/10 px-2 py-1 text-[10px] font-bold uppercase text-warning">Season 0</span>
					</div>

					<div className="grid grid-cols-4 gap-3">
						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="text-[10px] font-bold uppercase tracking-widest text-muted">Local version</div>
							<div className="mt-1 text-lg font-bold text-white">0.8.0-dev</div>
							<div className="mt-1 text-[10px] text-muted">V-Max Lab build</div>
						</div>
						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="text-[10px] font-bold uppercase tracking-widest text-muted">Channel</div>
							<div className="mt-1 text-lg font-bold text-accent">Local</div>
							<div className="mt-1 text-[10px] text-muted">No remote manifest</div>
						</div>
						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="text-[10px] font-bold uppercase tracking-widest text-muted">Animation packs</div>
							<div className="mt-1 text-lg font-bold text-warning">1/3</div>
							<div className="mt-1 text-[10px] text-muted">Installed / planned</div>
						</div>
						<div className="rounded-lg border border-line bg-bg p-4">
							<div className="text-[10px] font-bold uppercase tracking-widest text-muted">Update state</div>
							<div className="mt-1 text-lg font-bold text-warning">Offline</div>
							<div className="mt-1 text-[10px] text-muted">GitHub OTA later</div>
						</div>
					</div>

					<div className="grid grid-cols-[1fr_auto] gap-4 rounded-lg border border-line bg-bg p-4">
						<div className="min-w-0">
							<div className="text-sm font-bold text-white">Theme Pack OTA Channel</div>
							<div className="text-xs text-muted">Future GitHub manifest for seasonal backgrounds and GP animation packs.</div>
							<div className="mt-3 truncate rounded border border-line bg-panel px-3 py-2 text-[11px] text-muted">
								https://github.com/your-name/v-max-theme-packs/releases/latest/download/manifest.json
							</div>
						</div>
						<div className="flex flex-col items-end justify-between gap-3">
							<div className="text-right">
								<div className="text-[10px] font-bold uppercase tracking-widest text-muted">Status</div>
								<div className="text-sm font-bold text-warning">Not configured</div>
							</div>
							<button disabled className="rounded border border-line bg-panel px-3 py-2 text-xs font-bold uppercase text-muted opacity-50">
								Check updates
							</button>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-3">
						{updatePacks.map((pack) => (
							<div key={pack.name} className="rounded-lg border border-line bg-bg p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="text-sm font-bold text-white">{pack.name}</div>
									<span className={`rounded border px-2 py-1 text-[9px] font-bold uppercase ${
										pack.tone === "accent" ? "border-accent/50 bg-accent/10 text-accent" : "border-warning/50 bg-warning/10 text-warning"
									}`}>
										{pack.status}
									</span>
								</div>
								<div className="mt-2 text-xs text-muted">{pack.meta}</div>
							</div>
						))}
					</div>
				</section>
			</div>
		</main>
	);
};

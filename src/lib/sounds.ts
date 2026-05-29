export type SoundKey =
	| "startup"
	| "shutdown"
	| "radio"
	| "fastestLap"
	| "greenFlag"
	| "yellowFlag"
	| "redFlag"
	| "incident"
	| "penalty"
	| "straightMode"
	| "click"
	| "warning";

export type SoundCategory = "ui" | "radio" | "raceControl" | "system";
export type SoundPlayResult = "played" | "blocked" | "missing";
export type SoundGate =
	| "radioAlerts"
	| "startupSound"
	| "shutdownSound"
	| "fastestLapSound"
	| "personalBestSound"
	| "purpleSectorSound"
	| "pitStopSound"
	| "greenFlagSound"
	| "yellowFlagSound"
	| "redFlagSound"
	| "incidentSound"
	| "penaltySound"
	| "straightModeSound";

export type SoundSettings = {
	enabled: boolean;
	volume: number;
	uiSounds: boolean;
	radioAlerts: boolean;
	raceControlAlerts: boolean;
	systemSounds: boolean;
	startupSound: boolean;
	shutdownSound: boolean;
	fastestLapSound: boolean;
	personalBestSound: boolean;
	purpleSectorSound: boolean;
	pitStopSound: boolean;
	greenFlagSound: boolean;
	yellowFlagSound: boolean;
	redFlagSound: boolean;
	incidentSound: boolean;
	penaltySound: boolean;
	straightModeSound: boolean;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
	enabled: true,
	volume: 0.55,
	uiSounds: true,
	radioAlerts: true,
	raceControlAlerts: true,
	systemSounds: true,
	startupSound: true,
	shutdownSound: true,
	fastestLapSound: true,
	personalBestSound: true,
	purpleSectorSound: true,
	pitStopSound: true,
	greenFlagSound: true,
	yellowFlagSound: true,
	redFlagSound: true,
	incidentSound: true,
	penaltySound: true,
	straightModeSound: true,
};

const SOUND_SOURCES: Record<SoundKey, string[]> = {
	startup: ["/sounds/startup.mp3"],
	shutdown: ["/sounds/shutdown.mp3"],
	radio: ["/sounds/f1radio.mp3"],
	fastestLap: ["/sounds/fastestlap.mp3", "/sounds/fasteslap.mp3"],
	greenFlag: ["/sounds/greenflag.mp3"],
	yellowFlag: ["/sounds/yellowflag_vsc_sc.mp3"],
	redFlag: ["/sounds/redflag.mp3"],
	incident: ["/sounds/incident.mp3", "/sounds/incedent.mp3"],
	penalty: ["/sounds/penalty.mp3"],
	straightMode: ["/sounds/mode_acti_deacti.mp3", "/sounds/mode_act_deacti.mp3", "/sounds/straightmode.mp3", "/sounds/overtake.mp3", "/sounds/greenflag.mp3"],
	click: ["/sounds/click.mp3"],
	warning: ["/sounds/warning.mp3", "/sounds/incident.mp3", "/sounds/incedent.mp3"],
};

const missingSources = new Set<string>();

export class SoundManager {
	private readonly cache = new Map<string, HTMLAudioElement>();
	private volume = DEFAULT_SOUND_SETTINGS.volume;

	setVolume(volume: number) {
		this.volume = Math.max(0, Math.min(1, volume));
		this.cache.forEach((audio) => {
			audio.volume = this.volume;
		});
	}

	play(key: SoundKey): Promise<SoundPlayResult> {
		const sources = SOUND_SOURCES[key];
		return this.playFirstAvailable(sources);
	}

	private getAudio(src: string) {
		const cached = this.cache.get(src);
		if (cached) return cached;

		const audio = new Audio(src);
		audio.preload = "auto";
		audio.volume = this.volume;
		this.cache.set(src, audio);
		return audio;
	}

	private async playFirstAvailable(sources: string[]): Promise<SoundPlayResult> {
		for (const src of sources) {
			if (missingSources.has(src)) continue;

			const audio = this.getAudio(src);
			try {
				audio.currentTime = 0;
				await audio.play();
				return "played";
			} catch (error) {
				if (error instanceof DOMException && error.name === "NotAllowedError") {
					return "blocked";
				}

				if (error instanceof DOMException && error.name === "NotSupportedError") {
					missingSources.add(src);
				}
			}
		}

		return "missing";
	}
}

export const getSoundCategory = (key: SoundKey): SoundCategory => {
	if (key === "radio") return "radio";
	if (["greenFlag", "yellowFlag", "redFlag", "incident", "penalty", "straightMode", "fastestLap"].includes(key)) return "raceControl";
	if (["startup", "shutdown"].includes(key)) return "system";
	return "ui";
};

export const loadSoundSettings = (): SoundSettings => {
	try {
		const raw = window.localStorage.getItem("vmax.soundSettings");
		if (!raw) return DEFAULT_SOUND_SETTINGS;
		return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(raw) } as SoundSettings;
	} catch {
		return DEFAULT_SOUND_SETTINGS;
	}
};

export const saveSoundSettings = (settings: SoundSettings) => {
	window.localStorage.setItem("vmax.soundSettings", JSON.stringify(settings));
};

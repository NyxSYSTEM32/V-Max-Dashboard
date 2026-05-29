export type ThemeId = "original" | "light" | "redbull" | "mclaren" | "amg" | "ferrari";
export type AnimatedBackgroundIntensity = "low" | "medium" | "high";

export type VMaxTheme = {
	id: ThemeId;
	name: string;
	description: string;
	colors: {
		bg: string;
		panel: string;
		panelAlt: string;
		line: string;
		text: string;
		muted: string;
		accent: string;
		danger: string;
		warning: string;
		f1Red: string;
		streakPrimary: string;
		streakSecondary: string;
		streakAccent: string;
	};
};

export const VMAX_THEMES: VMaxTheme[] = [
	{
		id: "original",
		name: "V-Max Original",
		description: "Black telemetry room with red and mint V-Max accents.",
		colors: {
			bg: "#090B0F",
			panel: "#11151E",
			panelAlt: "#1A202C",
			line: "#2D3748",
			text: "#F4F7FB",
			muted: "#747D8C",
			accent: "#33E6A1",
			danger: "#F05D5E",
			warning: "#F5C86A",
			f1Red: "#FF1801",
			streakPrimary: "#FF1801",
			streakSecondary: "#33E6A1",
			streakAccent: "#F4F7FB",
		},
	},
	{
		id: "light",
		name: "V-Max Light",
		description: "Bright garage mode with graphite text and red UI signals.",
		colors: {
			bg: "#E9EEF5",
			panel: "#F8FAFC",
			panelAlt: "#E2E8F0",
			line: "#B9C4D3",
			text: "#101820",
			muted: "#64748B",
			accent: "#007F5F",
			danger: "#D62828",
			warning: "#B7791F",
			f1Red: "#E10600",
			streakPrimary: "#E10600",
			streakSecondary: "#007F5F",
			streakAccent: "#111827",
		},
	},
	{
		id: "redbull",
		name: "V-Max RedBull",
		description: "Deep navy, racing red, and high-voltage yellow.",
		colors: {
			bg: "#070B1A",
			panel: "#0C1228",
			panelAlt: "#131B3A",
			line: "#27335F",
			text: "#F7FAFF",
			muted: "#7F8CB8",
			accent: "#FCD700",
			danger: "#E10600",
			warning: "#FFB81C",
			f1Red: "#D2001E",
			streakPrimary: "#1E41FF",
			streakSecondary: "#D2001E",
			streakAccent: "#FCD700",
		},
	},
	{
		id: "mclaren",
		name: "V-Max McLaren",
		description: "Papaya orange with electric blue telemetry accents.",
		colors: {
			bg: "#0B0F14",
			panel: "#111820",
			panelAlt: "#1A2430",
			line: "#334155",
			text: "#F8FBFF",
			muted: "#8090A4",
			accent: "#00A3E0",
			danger: "#FF3B30",
			warning: "#FFB000",
			f1Red: "#FF8700",
			streakPrimary: "#FF8700",
			streakSecondary: "#00A3E0",
			streakAccent: "#47D7AC",
		},
	},
	{
		id: "amg",
		name: "V-Max AMG PETRONAS",
		description: "Carbon black, silver, and PETRONAS turquoise.",
		colors: {
			bg: "#060808",
			panel: "#101313",
			panelAlt: "#1B2020",
			line: "#33403F",
			text: "#F2F5F5",
			muted: "#8A9A9A",
			accent: "#00F5D0",
			danger: "#F05D5E",
			warning: "#C7CED3",
			f1Red: "#27F4D2",
			streakPrimary: "#00F5D0",
			streakSecondary: "#C7CED3",
			streakAccent: "#7D8B8C",
		},
	},
	{
		id: "ferrari",
		name: "V-Max Ferrari",
		description: "Deep rosso panels with yellow and black contrast.",
		colors: {
			bg: "#0F0708",
			panel: "#190A0C",
			panelAlt: "#261114",
			line: "#4A2328",
			text: "#FFF7F2",
			muted: "#A98787",
			accent: "#FFD400",
			danger: "#FF2800",
			warning: "#FFB000",
			f1Red: "#DC0000",
			streakPrimary: "#DC0000",
			streakSecondary: "#FFD400",
			streakAccent: "#111111",
		},
	},
];

export const DEFAULT_THEME_ID: ThemeId = "original";

export const getThemeById = (themeId: ThemeId) => VMAX_THEMES.find((theme) => theme.id === themeId) ?? VMAX_THEMES[0];

export const loadThemeId = (): ThemeId => {
	const raw = window.localStorage.getItem("vmax.themeId");
	return VMAX_THEMES.some((theme) => theme.id === raw) ? (raw as ThemeId) : DEFAULT_THEME_ID;
};

export const saveThemeId = (themeId: ThemeId) => {
	window.localStorage.setItem("vmax.themeId", themeId);
};

export const loadAnimatedBackgroundEnabled = () => {
	const raw = window.localStorage.getItem("vmax.animatedBackground");
	return raw === null ? true : raw === "true";
};

export const saveAnimatedBackgroundEnabled = (enabled: boolean) => {
	window.localStorage.setItem("vmax.animatedBackground", String(enabled));
};

export const loadAnimatedBackgroundIntensity = (): AnimatedBackgroundIntensity => {
	const raw = window.localStorage.getItem("vmax.animatedBackgroundIntensity");
	return raw === "low" || raw === "medium" || raw === "high" ? raw : "high";
};

export const saveAnimatedBackgroundIntensity = (intensity: AnimatedBackgroundIntensity) => {
	window.localStorage.setItem("vmax.animatedBackgroundIntensity", intensity);
};

export const applyTheme = (theme: VMaxTheme) => {
	const root = document.documentElement;
	root.dataset.theme = theme.id;
	root.style.setProperty("--color-bg", theme.colors.bg);
	root.style.setProperty("--color-panel", theme.colors.panel);
	root.style.setProperty("--color-panel-alt", theme.colors.panelAlt);
	root.style.setProperty("--color-line", theme.colors.line);
	root.style.setProperty("--color-text", theme.colors.text);
	root.style.setProperty("--color-muted", theme.colors.muted);
	root.style.setProperty("--color-accent", theme.colors.accent);
	root.style.setProperty("--color-danger", theme.colors.danger);
	root.style.setProperty("--color-warning", theme.colors.warning);
	root.style.setProperty("--color-f1-red", theme.colors.f1Red);
	root.style.setProperty("--theme-streak-primary", theme.colors.streakPrimary);
	root.style.setProperty("--theme-streak-secondary", theme.colors.streakSecondary);
	root.style.setProperty("--theme-streak-accent", theme.colors.streakAccent);
};

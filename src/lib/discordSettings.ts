const DISCORD_PRESENCE_ENABLED_KEY = "vmax.discordPresenceEnabled";

export const loadDiscordPresenceEnabled = () => {
	try {
		return window.localStorage.getItem(DISCORD_PRESENCE_ENABLED_KEY) === "true";
	} catch {
		return false;
	}
};

export const saveDiscordPresenceEnabled = (enabled: boolean) => {
	try {
		window.localStorage.setItem(DISCORD_PRESENCE_ENABLED_KEY, String(enabled));
	} catch {
		// Local storage can be unavailable in restricted preview contexts.
	}
};

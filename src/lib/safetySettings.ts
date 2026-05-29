const UA_SAFETY_ENABLED_KEY = "vmax.uaSafetyModeEnabled";

export const loadUaSafetyModeEnabled = () => {
	try {
		return window.localStorage.getItem(UA_SAFETY_ENABLED_KEY) === "true";
	} catch {
		return false;
	}
};

export const saveUaSafetyModeEnabled = (enabled: boolean) => {
	try {
		window.localStorage.setItem(UA_SAFETY_ENABLED_KEY, String(enabled));
	} catch {
		// Local storage can be unavailable in restricted preview contexts.
	}
};

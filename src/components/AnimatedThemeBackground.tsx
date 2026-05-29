import { memo } from "react";

import type { AnimatedBackgroundIntensity } from "../lib/themes";

type Props = {
	enabled: boolean;
	intensity: AnimatedBackgroundIntensity;
};

const streaks = [
	{ className: "vmax-streak-primary vmax-streak-a" },
	{ className: "vmax-streak-secondary vmax-streak-b" },
	{ className: "vmax-streak-accent vmax-streak-c" },
	{ className: "vmax-streak-primary vmax-streak-d" },
];

const AnimatedThemeBackground = ({ enabled, intensity }: Props) => {
	if (!enabled) return null;

	return (
		<div aria-hidden="true" className={`vmax-theme-background vmax-theme-background-${intensity}`}>
			{streaks.map((streak, index) => (
				<div key={index} className={`vmax-streak ${streak.className}`} />
			))}
		</div>
	);
};

export default memo(AnimatedThemeBackground);

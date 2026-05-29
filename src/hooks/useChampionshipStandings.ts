import { useEffect, useState } from "react";

import { createFallbackStandings, fetchOpenF1Standings, loadCachedStandings, saveCachedStandings, type ChampionshipStandings } from "../lib/standings";

const CACHE_TTL_MS = 15 * 60 * 1000;

type StandingsState = {
	standings: ChampionshipStandings;
	isLoading: boolean;
	error: string | null;
	refresh: () => void;
};

export const useChampionshipStandings = (): StandingsState => {
	const [standings, setStandings] = useState<ChampionshipStandings>(() => loadCachedStandings() ?? createFallbackStandings());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshIndex, setRefreshIndex] = useState(0);

	useEffect(() => {
		let isActive = true;
		const cached = loadCachedStandings();
		const cachedAgeMs = cached ? Date.now() - new Date(cached.updatedAt).getTime() : Number.POSITIVE_INFINITY;

		if (refreshIndex === 0 && cached && cachedAgeMs < CACHE_TTL_MS) {
			return () => {
				isActive = false;
			};
		}

		const loadingTimer = window.setTimeout(() => {
			if (isActive) setIsLoading(true);
		}, 0);

		fetchOpenF1Standings("latest")
			.then((nextStandings) => {
				if (!isActive) return;
				setStandings(nextStandings);
				saveCachedStandings(nextStandings);
				setError(null);
			})
			.catch((reason: unknown) => {
				if (!isActive) return;
				const cached = loadCachedStandings();
				if (cached) {
					setStandings({ ...cached, source: "cache" });
				}
				setError(reason instanceof Error ? reason.message : "Failed to fetch championship standings");
			})
			.finally(() => {
				window.clearTimeout(loadingTimer);
				if (isActive) setIsLoading(false);
			});

		return () => {
			isActive = false;
			window.clearTimeout(loadingTimer);
		};
	}, [refreshIndex]);

	return {
		standings,
		isLoading,
		error,
		refresh: () => setRefreshIndex((value) => value + 1),
	};
};

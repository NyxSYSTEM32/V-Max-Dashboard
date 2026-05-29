const f1NewsItems = [
	{
		source: "Formula 1",
		title: "Latest official F1 news",
		meta: "Official feed lane",
		url: "https://www.formula1.com/en/latest",
		tone: "accent",
	},
	{
		source: "FIA",
		title: "Regulations, decisions, and official notices",
		meta: "Steward context candidate",
		url: "https://www.fia.com/news",
		tone: "warning",
	},
	{
		source: "Formula 1",
		title: "Race calendar and weekend context",
		meta: "Session companion candidate",
		url: "https://www.formula1.com/en/racing/2026",
		tone: "muted",
	},
];

const f1VideoItems = [
	{
		source: "YouTube / Formula 1",
		title: "Official F1 channel",
		meta: "@Formula1",
		url: "https://www.youtube.com/@Formula1",
		tone: "danger",
	},
	{
		source: "YouTube / Formula 1",
		title: "Latest uploads",
		meta: "API-ready lane",
		url: "https://www.youtube.com/@Formula1/videos",
		tone: "accent",
	},
	{
		source: "YouTube / Formula 1",
		title: "Race highlights and features",
		meta: "Video shelf candidate",
		url: "https://www.youtube.com/@Formula1/playlists",
		tone: "warning",
	},
];

const uaf1NewsItems = [
	{
		source: "Setanta Sport",
		title: "F1 and racing news in Ukrainian",
		meta: "Racing section",
		url: "https://setantasports.com/uk/racing/",
		tone: "accent",
	},
	{
		source: "Setanta Sport YT",
		title: "Setanta Sports YouTube channel",
		meta: "Ukrainian sports video lane",
		url: "https://www.youtube.com/c/SetantaSports",
		tone: "danger",
	},
	{
		source: "Maincast",
		title: "Formula content playlist",
		meta: "Ukrainian F1 media playlist",
		url: "https://www.youtube.com/playlist?list=PLMoyWr4S3MvzlzdNe0GReI2GcTJ3Zj89y",
		tone: "warning",
	},
];

const mediaCandidates = [
	{ name: "The Race", role: "analysis / driver market", url: "https://www.the-race.com/formula-1/" },
	{ name: "Autosport", role: "newsroom / paddock reports", url: "https://www.autosport.com/f1/" },
	{ name: "RaceFans", role: "live context / stats-minded news", url: "https://www.racefans.net/" },
	{ name: "F1Technical", role: "tech regulation / aero detail", url: "https://www.f1technical.net/" },
];

const toneClass: Record<string, string> = {
	accent: "border-accent/50 bg-accent/10 text-accent",
	warning: "border-warning/50 bg-warning/10 text-warning",
	danger: "border-f1-red/50 bg-f1-red/10 text-f1-red",
	muted: "border-line bg-panel-alt text-muted",
};

const openExternal = async (url: string) => {
	const opened = await window.electronAPI?.openExternalUrl(url);
	if (!opened) window.open(url, "vmax-media-browser", "noopener,noreferrer");
};

const MediaCard = ({ item }: { item: { source: string; title: string; meta: string; url: string; tone: string } }) => (
	<button
		onClick={() => openExternal(item.url)}
		className="group grid grid-cols-[4.25rem_1fr_auto] items-center gap-3 rounded-lg border border-line bg-bg p-3 text-left transition-colors hover:border-accent/50 hover:bg-panel-alt"
	>
		<div className={`flex h-14 items-center justify-center rounded border text-[9px] font-black uppercase ${toneClass[item.tone]}`}>
			{item.source.split(" ")[0]}
		</div>
		<div className="min-w-0">
			<div className="text-[10px] font-bold uppercase tracking-widest text-muted">{item.source}</div>
			<div className="mt-1 truncate text-sm font-bold text-white">{item.title}</div>
			<div className="mt-1 text-[10px] uppercase text-muted">{item.meta}</div>
		</div>
		<span className="rounded border border-line px-3 py-2 text-[10px] font-bold uppercase text-muted transition-colors group-hover:border-accent group-hover:text-accent">Open</span>
	</button>
);

export const MediaPanel = () => (
	<main className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-line bg-panel p-6 custom-scrollbar">
		<div className="mb-5 flex items-center justify-between gap-4">
			<div>
				<h2 className="text-xl font-bold text-white">F1 Media Center</h2>
				<p className="mt-1 text-sm text-muted">Official news and Formula 1 video lanes, ready for live API wiring.</p>
			</div>
			<span className="rounded border border-warning/50 bg-warning/10 px-3 py-2 text-[10px] font-bold uppercase text-warning">Feed scaffold</span>
		</div>

		<div className="grid grid-cols-3 gap-5">
			<section className="min-h-0 rounded-xl border border-line bg-panel-alt p-4">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-xs font-bold uppercase tracking-widest text-accent">F1 News</h3>
					<span className="text-[10px] font-bold uppercase text-muted">Official</span>
				</div>
				<div className="grid gap-3">
					{f1NewsItems.map((item) => (
						<MediaCard key={item.url} item={item} />
					))}
				</div>
			</section>

			<section className="min-h-0 rounded-xl border border-line bg-panel-alt p-4">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-xs font-bold uppercase tracking-widest text-f1-red">F1 YouTube</h3>
					<span className="text-[10px] font-bold uppercase text-muted">Video</span>
				</div>
				<div className="grid gap-3">
					{f1VideoItems.map((item) => (
						<MediaCard key={item.url} item={item} />
					))}
				</div>
			</section>

			<section className="min-h-0 rounded-xl border border-line bg-panel-alt p-4">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-xs font-bold uppercase tracking-widest text-warning">UAF1 News</h3>
					<span className="text-[10px] font-bold uppercase text-muted">UA lane</span>
				</div>
				<div className="grid gap-3">
					{uaf1NewsItems.map((item) => (
						<MediaCard key={item.url} item={item} />
					))}
				</div>
			</section>
		</div>

		<section className="mt-5 rounded-xl border border-line bg-panel-alt p-4">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="text-xs font-bold uppercase tracking-widest text-warning">Possible Media Projects</h3>
				<span className="text-[10px] font-bold uppercase text-muted">Optional sources</span>
			</div>
			<div className="grid grid-cols-4 gap-3">
				{mediaCandidates.map((candidate) => (
					<button key={candidate.url} onClick={() => openExternal(candidate.url)} className="rounded-lg border border-line bg-bg p-4 text-left transition-colors hover:border-accent/50">
						<div className="text-sm font-bold text-white">{candidate.name}</div>
						<div className="mt-2 text-[10px] uppercase text-muted">{candidate.role}</div>
					</button>
				))}
			</div>
		</section>
	</main>
);

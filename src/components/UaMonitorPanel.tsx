type UaSource = {
	description: string;
	domain: string;
	isOfficial?: boolean;
	name: string;
	scope: string;
};

const uaSources: UaSource[] = [
	{
		description: "Official Air Force channel with national-scale missile/UAV updates.",
		domain: "kpszsu",
		isOfficial: true,
		name: "ПС ЗСУ",
		scope: "All Ukraine",
	},
	{
		description: "Kyiv and Kyiv Oblast monitoring channel.",
		domain: "chyste_nebo",
		name: "Чисте небо Київобл і Київ",
		scope: "Kyiv / Oblast",
	},
	{
		description: "Wide monitoring channel for active air threats.",
		domain: "war_monitor",
		name: "Monitor",
		scope: "Ukraine",
	},
	{
		description: "Kyiv-focused air threat monitoring.",
		domain: "nebo_raketa",
		name: "Київський купол",
		scope: "Kyiv",
	},
	{
		description: "Additional Kyiv/Oblast monitoring source.",
		domain: "chyste_neboo",
		name: "Світлячок",
		scope: "Kyiv / Oblast",
	},
];

const openTelegram = async (domain: string) => {
	const opened = await window.electronAPI?.openExternalUrl(`tg://resolve?domain=${domain}`);
	if (!opened) await window.electronAPI?.openExternalUrl(`https://t.me/${domain}`);
	if (!opened) window.open(`https://t.me/${domain}`, "vmax-ua-monitor", "noopener,noreferrer");
};

const SourceCard = ({ source }: { source: UaSource }) => (
	<div className={`rounded-xl border p-4 ${source.isOfficial ? "border-accent/60 bg-accent/10" : "border-line bg-bg"}`}>
		<div className="mb-3 flex items-center justify-between gap-3">
			<div className="min-w-0">
				<div className="truncate text-sm font-bold text-white">{source.name}</div>
				<div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">{source.scope}</div>
			</div>
			{source.isOfficial && <span className="rounded border border-accent/50 bg-accent/10 px-2 py-1 text-[9px] font-black uppercase text-accent">Official</span>}
		</div>
		<p className="min-h-10 text-xs leading-relaxed text-muted">{source.description}</p>
		<div className="mt-4 grid grid-cols-2 gap-2">
			<button onClick={() => openTelegram(source.domain)} className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-[10px] font-bold uppercase text-accent transition-colors hover:bg-accent/20">
				Open TG
			</button>
			<button onClick={() => window.electronAPI?.openExternalUrl(`https://t.me/${source.domain}`)} className="rounded border border-line bg-panel-alt px-3 py-2 text-[10px] font-bold uppercase text-muted transition-colors hover:border-accent hover:text-white">
				Web
			</button>
		</div>
	</div>
);

export const UaMonitorPanel = () => (
	<main className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-line bg-panel p-6 custom-scrollbar">
		<div className="mb-5 flex items-center justify-between gap-4">
			<div>
				<h2 className="text-xl font-bold text-white">UA Air Monitor</h2>
				<p className="mt-1 text-sm text-muted">Kyiv / Kyiv Oblast safety links. This panel does not replace official alerts.</p>
			</div>
			<span className="rounded border border-warning/50 bg-warning/10 px-3 py-2 text-[10px] font-bold uppercase text-warning">Kyiv pilot</span>
		</div>

		<section className="mb-5 rounded-xl border border-line bg-panel-alt p-4">
			<div className="grid grid-cols-[1fr_auto] items-center gap-4">
				<div>
					<div className="text-xs font-bold uppercase tracking-widest text-accent">Region profile</div>
					<div className="mt-2 text-2xl font-black text-white">Kyiv / Kyiv Oblast</div>
					<div className="mt-1 text-xs text-muted">Manual safety profile. No automatic precise geolocation is used.</div>
				</div>
				<div className="rounded-lg border border-line bg-bg p-4 text-right">
					<div className="text-[10px] font-bold uppercase tracking-widest text-muted">Live status</div>
					<div className="mt-1 text-lg font-black text-muted">Manual</div>
					<div className="mt-1 text-[10px] text-muted">Open trusted source</div>
				</div>
			</div>
		</section>

		<section className="grid grid-cols-3 gap-4">
			{uaSources.map((source) => (
				<SourceCard key={source.domain} source={source} />
			))}
		</section>

		<section className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
			<div className="text-xs font-bold uppercase tracking-widest text-warning">Safety note</div>
			<p className="mt-2 text-sm leading-relaxed text-muted">
				Use official air raid alerts and local authorities as the primary source. Telegram links here are quick access shortcuts for sources you selected.
			</p>
		</section>
	</main>
);

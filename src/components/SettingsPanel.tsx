import type { ReplaySession } from "../types/ipc";

type SettingsPanelProps = {
  sessions?: ReplaySession[];
  selectedSession?: number;
  onSessionChange?: (sessionKey: number) => void;
};

export const SettingsPanel = ({ sessions = [], selectedSession, onSessionChange }: SettingsPanelProps) => {
  return (
    <main className="flex-1 min-h-0 bg-panel rounded-xl border border-line p-8 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
      <div>
        <h2 className="text-xl font-bold mb-2">Налаштування V-Max</h2>
        <p className="text-muted text-sm">Тут можна керувати replay-сесіями, виглядом та інтеграціями додатку.</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="bg-panel-alt p-6 rounded-xl border border-line flex flex-col gap-4 col-span-2">
          <h3 className="text-accent font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            Налаштування Replay Mode
          </h3>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted font-bold">Оберіть сесію для відтворення</label>
            <div className="flex gap-4">
              <select
                value={selectedSession}
                onChange={(event) => onSessionChange?.(Number(event.target.value))}
                className="flex-1 bg-bg border border-line rounded-lg p-3 text-sm text-white outline-none focus:border-accent transition-colors"
              >
                {sessions.length === 0 && <option disabled>Завантаження списку сесій...</option>}
                {sessions.map((session) => (
                  <option key={session.session_key} value={session.session_key}>
                    {session.year} {session.country_name ?? "Local"} - {session.session_name}
                    {session.date_start ? ` (${new Date(session.date_start).toLocaleDateString()})` : ""}
                    {session.driver_count ? ` - ${session.driver_count} drivers` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => window.electronAPI?.setMode("archive")}
                className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-bold text-white transition-colors"
              >
                ЗАПУСТИТИ REPLAY
              </button>
            </div>
            <p className="text-xs text-muted mt-1 opacity-50">Зміна сесії перезапустить локальний replay-міст.</p>
            {selectedSession && (
              <p className="text-xs text-muted opacity-60">
                Активна локальна сесія: {selectedSession}. Повні 2026 replay-сесії можна додати командою npm run download:latest-2026.
              </p>
            )}
          </div>
        </div>

        <div className="bg-panel-alt p-6 rounded-xl border border-line flex flex-col gap-4">
          <h3 className="text-f1-red font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-f1-red"></span>
            Зовнішній вигляд
          </h3>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted font-bold">Кольорова тема</label>
            <select className="bg-bg border border-line rounded-lg p-3 text-sm text-white outline-none focus:border-accent transition-colors">
              <option value="dark">V-Max Dark (Default)</option>
              <option value="light">V-Max Light</option>
              <option value="neon">Cyberpunk Neon</option>
              <option value="mclaren">Papaya Orange</option>
            </select>
            <p className="text-xs text-muted mt-1 opacity-50">У розробці: зміна теми поки що недоступна.</p>
          </div>
        </div>

        <div className="bg-panel-alt p-6 rounded-xl border border-line flex flex-col gap-4">
          <h3 className="text-[#5865F2] font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5865F2]"></span>
            Інтеграції
          </h3>

          <div className="flex items-center justify-between bg-bg p-4 rounded-lg border border-line">
            <div>
              <div className="font-bold text-sm">Discord Rich Presence</div>
              <div className="text-xs text-muted">Показувати друзям, яку гонку ви зараз дивитеся</div>
            </div>
            <div className="w-12 h-6 bg-zinc-700 rounded-full relative cursor-pointer opacity-50">
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all"></div>
            </div>
          </div>
        </div>

        <div className="bg-panel-alt p-6 rounded-xl border border-line flex flex-col gap-4 col-span-2">
          <h3 className="text-accent font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            Статус системи
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bg p-4 rounded-lg border border-line flex flex-col gap-1">
              <span className="text-xs text-muted uppercase">OpenF1 API</span>
              <span className="text-sm font-bold text-accent">Підключено</span>
            </div>
            <div className="bg-bg p-4 rounded-lg border border-line flex flex-col gap-1">
              <span className="text-xs text-muted uppercase">Live SignalR</span>
              <span className="text-sm font-bold text-warning">Очікування сесії</span>
            </div>
            <div className="bg-bg p-4 rounded-lg border border-line flex flex-col gap-1">
              <span className="text-xs text-muted uppercase">Останні помилки</span>
              <span className="text-sm font-bold text-muted">Немає помилок</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

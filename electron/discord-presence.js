import DiscordRPC from 'discord-rpc';

const CLIENT_ID = '1509995835952206005';
const LARGE_IMAGE_KEY = 'logof1dashboard';
const LARGE_IMAGE_TEXT = 'V-Max F1 Dashboard';
const UPDATE_INTERVAL_MS = 15_000;

class DiscordPresence {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.isReady = false;
    this.lastActivity = null;
    this.lastUpdateAt = 0;
    this.startedAt = Date.now();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) {
      this.connect();
    } else {
      this.clear();
      this.destroy();
    }
  }

  connect() {
    if (this.client || !this.enabled) return;

    DiscordRPC.register(CLIENT_ID);
    const client = new DiscordRPC.Client({ transport: 'ipc' });
    this.client = client;

    client.on('ready', () => {
      this.isReady = true;
      if (this.lastActivity) this.pushActivity(this.lastActivity, true);
    });

    client.login({ clientId: CLIENT_ID }).catch((error) => {
      console.warn('[V-Max] Discord RPC unavailable:', error.message);
      this.destroy();
    });
  }

  updateFromF1Data(data) {
    if (!this.enabled) return;

    if (data.type === 'source-status') {
      this.lastActivity = {
        details: data.mode === 'live' ? 'Live telemetry' : 'Replay telemetry',
        state: data.message ?? data.status,
      };
      this.pushActivity(this.lastActivity);
      return;
    }

    if (data.type !== 'race-frame') return;

    const focused = data.drivers?.[data.telemetry?.driverNumber];
    const focusedCode = focused?.Tla ?? data.telemetry?.driverNumber ?? '---';
    const lap = data.lapSummary?.currentLap ?? data.leaderboard?.find((entry) => entry.driverNumber === data.telemetry?.driverNumber)?.lap;
    const totalLaps = data.totalLaps ?? '--';
    const replay = data.replayControl;
    const modeLabel = replay?.isPlaying ? `Replay ${replay.speed}x` : 'Replay paused';
    const speed = Number.isFinite(data.telemetry?.speed) ? `${data.telemetry.speed} km/h` : 'Telemetry ready';

    this.lastActivity = {
      details: `${modeLabel} - ${focusedCode}`,
      state: `Lap ${lap ?? '--'} / ${totalLaps} - ${speed}`,
    };
    this.pushActivity(this.lastActivity);
  }

  pushActivity(activity, force = false) {
    if (!this.enabled) return;
    if (!this.client) this.connect();
    if (!this.client || !this.isReady) return;

    const now = Date.now();
    if (!force && now - this.lastUpdateAt < UPDATE_INTERVAL_MS) return;
    this.lastUpdateAt = now;

    this.client.setActivity({
      details: activity.details,
      state: activity.state,
      largeImageKey: LARGE_IMAGE_KEY,
      largeImageText: LARGE_IMAGE_TEXT,
      startTimestamp: this.startedAt,
      instance: false,
    }).catch((error) => {
      console.warn('[V-Max] Discord RPC update failed:', error.message);
    });
  }

  clear() {
    if (!this.client || !this.isReady) return;
    this.client.clearActivity().catch(() => {});
  }

  destroy() {
    if (this.client) {
      this.client.destroy().catch(() => {});
    }
    this.client = null;
    this.isReady = false;
  }
}

export const discordPresence = new DiscordPresence();

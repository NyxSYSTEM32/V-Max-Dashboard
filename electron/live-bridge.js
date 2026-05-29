import { WebSocket } from 'ws';
import zlib from 'zlib';
import { sendF1Data, sendSourceStatus } from './f1-events.js';

const URL = 'livetiming.formula1.com/signalr';
const HUB = 'Streaming';
const TOPICS = [
  "Heartbeat",
  "CarData.z",
  "Position.z",
  "TimingData",
  "SessionInfo",
  "TrackStatus",
  "RaceControlMessages",
  "DriverList",
  "TimingAppData"
];

function clampPercent(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return 0;
  return Math.min(Math.max(parsedValue, 0), 100);
}

function normalizeNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

class LiveF1Bridge {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.ws = null;
    this.cookie = '';
    this.token = '';
    this.isPlaying = false;
    this.reconnectTimer = null;
    this.focusedDriverNumber = '1';
    this.latestCars = {};
  }

  async negotiate() {
    console.log('[LiveF1 Bridge] Negotiating with SignalR...');
    const hubParam = JSON.stringify([{ name: HUB }]);
    const negotiateUrl = `https://${URL}/negotiate?clientProtocol=1.5&connectionData=${encodeURIComponent(hubParam)}`;
    
    const response = await fetch(negotiateUrl);
    if (!response.ok) {
      throw new Error(`Negotiation failed: ${response.status}`);
    }
    
    // Extract cookie
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      this.cookie = setCookieHeader.split(';')[0];
    }

    const data = await response.json();
    this.token = data.ConnectionToken;
    console.log('[LiveF1 Bridge] Negotiation successful. Token:', this.token.substring(0, 10) + '...');
  }

  async start() {
    if (this.isPlaying) return Promise.resolve();
    this.isPlaying = true;
    sendSourceStatus(this.mainWindow, 'live', 'connecting', 'Negotiating live timing connection');

    try {
      await this.negotiate();
      if (!this.isPlaying) return;
      this.connect();
    } catch (err) {
      console.error('[LiveF1 Bridge] Failed to start:', err);
      this.isPlaying = false;
      sendSourceStatus(this.mainWindow, 'live', 'error', err.message);
      throw err;
    }
  }

  connect() {
    const hubParam = JSON.stringify([{ name: HUB }]);
    const connectUrl = `wss://${URL}/connect?clientProtocol=1.5&transport=webSockets&connectionToken=${encodeURIComponent(this.token)}&connectionData=${encodeURIComponent(hubParam)}`;
    
    console.log('[LiveF1 Bridge] Connecting WebSocket...');
    this.ws = new WebSocket(connectUrl, {
      headers: {
        'User-Agent': 'BestHTTP',
        'Accept-Encoding': 'gzip,identity',
        'Cookie': this.cookie
      }
    });

    this.ws.on('open', () => {
      console.log('[LiveF1 Bridge] WebSocket Connected! Subscribing to topics...');
      sendSourceStatus(this.mainWindow, 'live', 'ready', 'Live timing connected');
      
      const subscribeMsg = {
        H: HUB,
        M: 'Subscribe',
        A: [TOPICS],
        I: Math.floor(Math.random() * 10000).toString()
      };
      
      this.ws.send(JSON.stringify(subscribeMsg));
    });

    this.ws.on('message', (data) => {
      const msgStr = data.toString();
      if (msgStr === '{}') return; // Heartbeat ping
      
      try {
        const parsed = JSON.parse(msgStr);
        
        // Handle updates (M)
        if (parsed.M && Array.isArray(parsed.M)) {
          parsed.M.forEach(update => {
            const topic = update.A[0];
            const payload = update.A[1];
            this.handleUpdate(topic, payload);
          });
        }
        
        // Handle initial state (R)
        if (parsed.R && typeof parsed.R === 'object') {
          for (const [topic, payload] of Object.entries(parsed.R)) {
            this.handleUpdate(topic, payload);
          }
        }
      } catch (err) {
        console.error('[LiveF1 Bridge] Failed to parse message:', err.message);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[LiveF1 Bridge] WebSocket Error:', err);
      sendSourceStatus(this.mainWindow, 'live', 'error', err.message);
    });

    this.ws.on('close', () => {
      console.log('[LiveF1 Bridge] WebSocket Closed.');
      if (this.isPlaying) {
        console.log('[LiveF1 Bridge] Reconnecting in 5s...');
        sendSourceStatus(this.mainWindow, 'live', 'connecting', 'Live timing disconnected, reconnecting');
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      } else {
        sendSourceStatus(this.mainWindow, 'live', 'stopped', 'Live timing stopped');
      }
    });
  }

  handleUpdate(topic, payload) {
    let data = payload;

    // Handle .z deflated base64 payloads
    if (topic.endsWith('.z') && typeof payload === 'string') {
      try {
        const buffer = Buffer.from(payload, 'base64');
        const inflated = zlib.inflateRawSync(buffer);
        data = JSON.parse(inflated.toString('utf-8'));
        topic = topic.replace('.z', '');
      } catch (err) {
        console.error(`[LiveF1 Bridge] Failed to decompress ${topic}:`, err.message);
        return;
      }
    }

    if (topic === 'TrackStatus') {
        if (data.Status) {
        let flag = 'Green';
        if (data.Status === '2') flag = 'Yellow';
        if (data.Status === '3') flag = 'Red';
        if (data.Status === '4') flag = 'SC';
        if (data.Status === '5') flag = 'VSC';
        if (data.Status === '6') flag = 'VSC Ending';
        if (data.Status === '7') flag = 'Chequered';
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          sendF1Data(this.mainWindow, { type: 'track-status', flag });
        }
      }
    }

    if (topic === 'DriverList') {
      if (!this.driverMap) this.driverMap = {};
      for (const [num, d] of Object.entries(data)) {
        this.driverMap[num] = {
          RacingNumber: d.RacingNumber,
          BroadcastName: d.BroadcastName,
          Tla: d.Tla,
          TeamColour: d.TeamColour,
          TeamName: d.TeamName
        };
      }
      if (!this.driverMap[this.focusedDriverNumber]) {
        this.focusedDriverNumber = Object.keys(this.driverMap)[0] || this.focusedDriverNumber;
      }
      this.emitDriverFocus();
      this.sendMapData();
    }

    if (topic === 'TimingData') {
      if (data.Lines) {
        if (!this.timingLines) this.timingLines = {};
        // Merge timing data incrementally
        for (const [num, line] of Object.entries(data.Lines)) {
          this.timingLines[num] = { ...(this.timingLines[num] || {}), ...line };
        }
        
        // Rebuild leaderboard
        if (this.driverMap) {
          this.leaderboard = Object.values(this.timingLines)
            .filter(l => l.Position && this.driverMap[l.RacingNumber])
            .sort((a, b) => parseInt(a.Position) - parseInt(b.Position))
            .map(l => ({
              pos: l.Position,
              driverNumber: l.RacingNumber,
              driver: this.driverMap[l.RacingNumber].Tla,
              gap: l.Position === "1" ? "Leader" : (l.GapToLeader || l.TimeDiffToPositionAhead || ""),
              color: '#' + this.driverMap[l.RacingNumber].TeamColour
            }));
          this.sendTelemetry();
        }
      }
    }

    if (topic === 'CarData') {
      if (data.Entries && data.Entries[0] && data.Entries[0].Cars) {
        this.latestCars = { ...this.latestCars, ...data.Entries[0].Cars };
        if (this.updateTelemetryFromFocusedCar()) this.sendTelemetry();
      }
    }

    if (topic === 'Position') {
      if (data.Position && data.Position[0] && data.Position[0].Entries) {
        if (!this.positions) this.positions = {};
        for (const [num, pos] of Object.entries(data.Position[0].Entries)) {
           this.positions[num] = { x: pos.X, y: pos.Y };
        }
        this.sendMapData();
      }
    }
  }

  sendMapData() {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.driverMap && this.positions) {
      sendF1Data(this.mainWindow, {
        type: 'map-data',
        drivers: this.driverMap,
        positions: this.positions
      });
    }
  }

  sendTelemetry() {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.telemetry) {
      sendF1Data(this.mainWindow, {
        type: 'telemetry',
        driverNumber: this.telemetry.driverNumber || this.focusedDriverNumber,
        speed: this.telemetry.speed,
        gear: this.telemetry.gear,
        throttle: this.telemetry.throttle,
        brake: this.telemetry.brake,
        rpm: this.telemetry.rpm,
        leaderboard: this.leaderboard || []
      });
    }
  }

  updateTelemetryFromFocusedCar() {
    const focusedCar = this.latestCars[this.focusedDriverNumber];
    if (!focusedCar?.Channels) return false;

    if (!this.telemetry) this.telemetry = { driverNumber: this.focusedDriverNumber, speed: 0, gear: 0, throttle: 0, brake: 0, rpm: 0 };
    this.telemetry.driverNumber = this.focusedDriverNumber;
    this.telemetry.rpm = focusedCar.Channels["0"] !== undefined ? normalizeNumber(focusedCar.Channels["0"]) : this.telemetry.rpm;
    this.telemetry.speed = focusedCar.Channels["2"] !== undefined ? normalizeNumber(focusedCar.Channels["2"]) : this.telemetry.speed;
    this.telemetry.gear = focusedCar.Channels["3"] !== undefined ? normalizeNumber(focusedCar.Channels["3"]) : this.telemetry.gear;
    this.telemetry.throttle = focusedCar.Channels["4"] !== undefined ? clampPercent(focusedCar.Channels["4"]) : this.telemetry.throttle;
    this.telemetry.brake = focusedCar.Channels["5"] !== undefined ? clampPercent(focusedCar.Channels["5"]) : this.telemetry.brake;

    return true;
  }

  setFocusedDriver(driverNumber) {
    const nextDriverNumber = String(driverNumber);
    if (this.driverMap && !this.driverMap[nextDriverNumber]) return;

    this.focusedDriverNumber = nextDriverNumber;
    this.emitDriverFocus();
    if (this.updateTelemetryFromFocusedCar()) this.sendTelemetry();
  }

  emitDriverFocus() {
    sendF1Data(this.mainWindow, {
      type: 'driver-focus',
      driverNumber: this.focusedDriverNumber
    });
  }

  stop() {
    this.isPlaying = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export { LiveF1Bridge };

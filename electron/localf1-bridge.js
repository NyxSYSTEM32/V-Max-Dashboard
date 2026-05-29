import fs from 'fs';
import path from 'path';
import { sendF1Data, sendSourceStatus } from './f1-events.js';

const OPENF1 = 'https://api.openf1.org/v1';

function clampPercent(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return 0;
  return Math.min(Math.max(parsedValue, 0), 100);
}

function normalizeNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function formatIntervalValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue === 0) return 'Leader';
  return `+${numericValue.toFixed(3)}`;
}

function buildRecordsByDriver(records) {
  const map = new Map();
  records.forEach(record => {
    const driverRecords = map.get(record.driver_number) ?? [];
    driverRecords.push(record);
    map.set(record.driver_number, driverRecords);
  });

  map.forEach(driverRecords => {
    driverRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  return map;
}

function buildRecordsByDriverSorted(records, dateField) {
  const map = new Map();
  records.forEach(record => {
    const driverRecords = map.get(record.driver_number) ?? [];
    driverRecords.push(record);
    map.set(record.driver_number, driverRecords);
  });

  map.forEach(driverRecords => {
    driverRecords.sort((a, b) => new Date(a[dateField]).getTime() - new Date(b[dateField]).getTime());
  });

  return map;
}

function sortByDate(records) {
  return [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function buildStintsByDriver(records) {
  const map = new Map();
  records.forEach(record => {
    const driverRecords = map.get(record.driver_number) ?? [];
    driverRecords.push(record);
    map.set(record.driver_number, driverRecords);
  });

  map.forEach(driverRecords => {
    driverRecords.sort((a, b) => normalizeNumber(a.lap_start) - normalizeNumber(b.lap_start));
  });

  return map;
}

function findRecordAtOrAfter(records, targetTime) {
  if (!records || records.length === 0) return null;

  let low = 0;
  let high = records.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (new Date(records[mid].date).getTime() < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return records[low] ?? null;
}

function findRecordAtOrBefore(records, targetTime) {
  if (!records || records.length === 0) return null;

  let low = 0;
  let high = records.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (new Date(records[mid].date).getTime() <= targetTime) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return new Date(records[low].date).getTime() <= targetTime ? records[low] : null;
}

function findRecordsAround(records, targetTime) {
  if (!records || records.length === 0) return { previous: null, next: null };

  let low = 0;
  let high = records.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (new Date(records[mid].date).getTime() < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const next = records[low] ?? null;
  const nextTime = next ? new Date(next.date).getTime() : Number.POSITIVE_INFINITY;
  const previous = nextTime <= targetTime ? next : (records[low - 1] ?? next);

  return { previous, next };
}

function findIndexAtOrAfter(times, targetTime) {
  if (!times || times.length === 0) return 0;

  let low = 0;
  let high = times.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid] < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function findLastIndexAtOrBefore(times, targetTime) {
  if (!times || times.length === 0) return -1;

  let low = 0;
  let high = times.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (times[mid] <= targetTime) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return times[low] <= targetTime ? low : -1;
}

function mapRaceControlFlag(message) {
  const rawFlag = String(message?.flag ?? '').toUpperCase();
  const rawCategory = String(message?.category ?? '').toUpperCase();
  const rawMessage = String(message?.message ?? '').toUpperCase();

  if (rawFlag === 'CHEQUERED' || rawMessage.includes('CHEQUERED')) return 'Chequered';
  if (rawFlag === 'RED' || rawMessage.includes('RED FLAG')) return 'Red';
  if (rawCategory === 'SAFETYCAR') {
    if (rawMessage.includes('VIRTUAL') || rawMessage.includes('VSC')) return rawMessage.includes('ENDING') ? 'VSC Ending' : 'VSC';
    if (rawMessage.includes('DEPLOYED')) return 'SC';
    if (rawMessage.includes('ENDING')) return 'Green';
  }
  if (rawFlag === 'YELLOW' || rawFlag === 'DOUBLE YELLOW' || rawMessage.includes('YELLOW FLAG')) return 'Yellow';
  if (rawFlag === 'GREEN' || rawFlag === 'CLEAR' || rawMessage.includes('GREEN FLAG') || rawMessage.includes('CLEAR')) return 'Green';

  return null;
}

// LocalF1Bridge: Replays telemetry directly from local JSON files (No internet needed)
export class LocalF1Bridge {
  constructor(mainWindow, sessionKey = 9158) {
    this.mainWindow = mainWindow;
    this.timerId = null;
    this.sessionKey = sessionKey;
    this.telemetryData = [];
    this.locationData = [];
    this.telemetryByDriverDate = new Map();
    this.telemetryByDriver = new Map();
    this.locationByDriver = new Map();
    this.positionByDriver = new Map();
    this.intervalByDriver = new Map();
    this.lapByDriver = new Map();
    this.stintByDriver = new Map();
    this.raceControlData = [];
    this.raceControlTimes = [];
    this.telemetryTimes = [];
    this.telemetryDriverNumbers = [];
    this.locationDriverNumbers = [];
    this.trackPath = [];
    this.focusedDriverNumber = null;
    this.sessionInfo = null;
    this.sessionStartTimeMs = null;
    this.drivers = {};
    this.currentIndex = 0;
    this.replayTimeMs = null;
    this.isPlaying = false;
    this.playbackSpeed = 1;
    this.baseTickMs = 200;
  }

  async initialize() {
    console.log(`[LocalF1 Bridge] Initializing Session ${this.sessionKey}...`);
    const libraryDir = path.join(process.cwd(), 'library', this.sessionKey.toString());
    
    if (!fs.existsSync(libraryDir)) {
      throw new Error(`Session ${this.sessionKey} not found in local library!`);
    }

    try {
      const sessionPath = path.join(libraryDir, 'session.json');
      this.sessionInfo = fs.existsSync(sessionPath) ? JSON.parse(fs.readFileSync(sessionPath, 'utf8')) : null;
      this.sessionStartTimeMs = this.sessionInfo?.date_start ? new Date(this.sessionInfo.date_start).getTime() : null;

      // 1. Load Drivers
      const driversJson = fs.readFileSync(path.join(libraryDir, 'drivers.json'), 'utf8');
      const parsedDrivers = JSON.parse(driversJson);
      
      const driversObj = {};
      parsedDrivers.forEach(d => {
        driversObj[d.driver_number] = {
          RacingNumber: d.driver_number.toString(),
          Tla: d.name_acronym,
          TeamColour: d.team_colour,
          FullName: d.full_name
        };
      });
      this.drivers = driversObj;
      console.log(`[LocalF1 Bridge] Loaded ${Object.keys(this.drivers).length} drivers.`);

      // 2. Load Telemetry
      const telJson = fs.readFileSync(path.join(libraryDir, 'car_data.json'), 'utf8');
      this.telemetryData = JSON.parse(telJson);
      this.telemetryByDriverDate = new Map(
        this.telemetryData.map(point => [`${point.driver_number}:${point.date}`, point])
      );
      this.telemetryByDriver = buildRecordsByDriver(this.telemetryData);
      this.telemetryTimes = this.telemetryData.map(point => new Date(point.date).getTime());
      this.telemetryDriverNumbers = [...new Set(this.telemetryData.map(point => point.driver_number))];
      this.focusedDriverNumber = this.resolveInitialFocusedDriver();
      console.log(`[LocalF1 Bridge] Loaded ${this.telemetryData.length} telemetry records.`);

      // 3. Load Location
      const locJson = fs.readFileSync(path.join(libraryDir, 'location.json'), 'utf8');
      this.locationData = JSON.parse(locJson);
      this.locationByDriver = buildRecordsByDriver(this.locationData);
      this.locationDriverNumbers = [...new Set(this.locationData.map(point => point.driver_number))];
      this.trackPath = this.buildTrackPath();
      console.log(`[LocalF1 Bridge] Loaded ${this.locationData.length} location records.`);

      const positionPath = path.join(libraryDir, 'position.json');
      this.positionData = fs.existsSync(positionPath) ? JSON.parse(fs.readFileSync(positionPath, 'utf8')) : [];
      if (this.positionData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] position.json missing. Fetching position stream for ${this.sessionKey}...`);
          this.positionData = await fetchJson(`${OPENF1}/position?session_key=${this.sessionKey}`);
          fs.writeFileSync(positionPath, JSON.stringify(this.positionData, null, 2));
        } catch (positionError) {
          console.warn('[LocalF1 Bridge] Position stream unavailable. Falling back to driver-number order:', positionError.message);
          this.positionData = [];
        }
      }
      this.positionByDriver = buildRecordsByDriver(this.positionData);
      console.log(`[LocalF1 Bridge] Loaded ${this.positionData.length} position records.`);

      const intervalsPath = path.join(libraryDir, 'intervals.json');
      this.intervalData = fs.existsSync(intervalsPath) ? JSON.parse(fs.readFileSync(intervalsPath, 'utf8')) : [];
      if (this.intervalData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] intervals.json missing. Fetching intervals for ${this.sessionKey}...`);
          this.intervalData = await fetchJson(`${OPENF1}/intervals?session_key=${this.sessionKey}`);
          fs.writeFileSync(intervalsPath, JSON.stringify(this.intervalData, null, 2));
        } catch (intervalError) {
          console.warn('[LocalF1 Bridge] Intervals unavailable. Falling back to speed readout:', intervalError.message);
          this.intervalData = [];
        }
      }
      this.intervalByDriver = buildRecordsByDriver(this.intervalData);
      console.log(`[LocalF1 Bridge] Loaded ${this.intervalData.length} interval records.`);

      const lapsPath = path.join(libraryDir, 'laps.json');
      this.lapData = fs.existsSync(lapsPath) ? JSON.parse(fs.readFileSync(lapsPath, 'utf8')) : [];
      if (this.lapData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] laps.json missing. Fetching laps for ${this.sessionKey}...`);
          this.lapData = await fetchJson(`${OPENF1}/laps?session_key=${this.sessionKey}`);
          fs.writeFileSync(lapsPath, JSON.stringify(this.lapData, null, 2));
        } catch (lapError) {
          console.warn('[LocalF1 Bridge] Laps unavailable:', lapError.message);
          this.lapData = [];
        }
      }
      this.lapByDriver = buildRecordsByDriverSorted(this.lapData, 'date_start');
      console.log(`[LocalF1 Bridge] Loaded ${this.lapData.length} lap records.`);

      const stintsPath = path.join(libraryDir, 'stints.json');
      this.stintData = fs.existsSync(stintsPath) ? JSON.parse(fs.readFileSync(stintsPath, 'utf8')) : [];
      if (this.stintData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] stints.json missing. Fetching stints for ${this.sessionKey}...`);
          this.stintData = await fetchJson(`${OPENF1}/stints?session_key=${this.sessionKey}`);
          fs.writeFileSync(stintsPath, JSON.stringify(this.stintData, null, 2));
        } catch (stintError) {
          console.warn('[LocalF1 Bridge] Stints unavailable:', stintError.message);
          this.stintData = [];
        }
      }
      this.stintByDriver = buildStintsByDriver(this.stintData);
      console.log(`[LocalF1 Bridge] Loaded ${this.stintData.length} stint records.`);

      const raceControlPath = path.join(libraryDir, 'race_control.json');
      this.raceControlData = fs.existsSync(raceControlPath) ? JSON.parse(fs.readFileSync(raceControlPath, 'utf8')) : [];
      if (this.raceControlData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] race_control.json missing. Fetching race control messages for ${this.sessionKey}...`);
          this.raceControlData = await fetchJson(`${OPENF1}/race_control?session_key=${this.sessionKey}`);
          fs.writeFileSync(raceControlPath, JSON.stringify(this.raceControlData, null, 2));
        } catch (raceControlError) {
          console.warn('[LocalF1 Bridge] Race control messages unavailable:', raceControlError.message);
          this.raceControlData = [];
        }
      }
      this.raceControlData = sortByDate(this.raceControlData);
      this.raceControlTimes = this.raceControlData.map(message => new Date(message.date).getTime());
      console.log(`[LocalF1 Bridge] Loaded ${this.raceControlData.length} race control messages.`);

      // Calculate track bounds for dynamic scaling
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      this.locationData.forEach(l => {
         if (l.x < minX) minX = l.x;
         if (l.x > maxX) maxX = l.x;
         if (l.y < minY) minY = l.y;
         if (l.y > maxY) maxY = l.y;
      });
      this.trackBounds = Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
      console.log(`[LocalF1 Bridge] Computed track bounds:`, this.trackBounds);
      sendSourceStatus(this.mainWindow, 'archive', 'ready', `Local replay ${this.sessionKey} loaded`);

    } catch (err) {
      console.error('[LocalF1 Bridge] Failed to load local files:', err);
      sendSourceStatus(this.mainWindow, 'archive', 'error', err.message);
      throw err;
    }
  }

  start() {
    if (this.telemetryData.length === 0) return;
    
    // Send initial driver list and bounds
    sendF1Data(this.mainWindow, {
      type: 'map-data',
      drivers: this.drivers,
      trackBounds: this.trackBounds,
      trackPath: this.trackPath
    });
    this.emitDriverFocus();

    console.log('[LocalF1 Bridge] Starting local playback...');

    const startTime = this.resolvePlaybackStartTime();
    this.currentIndex = findIndexAtOrAfter(this.telemetryTimes, startTime);
    this.replayTimeMs = this.telemetryTimes[this.currentIndex] ?? null;
    console.log(`[LocalF1 Bridge] Fast-forwarded to active running. Starting at ${new Date(startTime).toISOString()} (index ${this.currentIndex})`);
    this.play();
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.emitReplayControl();
    this.scheduleNextTick(0);
  }

  pause() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.emitReplayControl();
  }

  setSpeed(speed) {
    const parsedSpeed = Number(speed);
    if (!Number.isFinite(parsedSpeed)) return;
    this.playbackSpeed = Math.min(Math.max(parsedSpeed, 0.25), 8);
    this.emitReplayControl();
    if (this.isPlaying) {
      if (this.timerId) clearTimeout(this.timerId);
      this.scheduleNextTick();
    }
  }

  handleControl(command) {
    if (command.type === 'play') this.play();
    if (command.type === 'pause') this.pause();
    if (command.type === 'set-speed') this.setSpeed(command.speed);
    if (command.type === 'seek') this.seek(command.progress);
    if (command.type === 'jump') this.jump(command.seconds);
  }

  resolveInitialFocusedDriver() {
    if (this.telemetryByDriver.has(1)) return 1;
    if (this.telemetryByDriver.has(4)) return 4;
    return this.telemetryDriverNumbers[0] ?? null;
  }

  resolvePlaybackStartTime() {
    const lowerBound = this.sessionStartTimeMs ?? this.telemetryTimes[0] ?? 0;
    const firstFastCar = this.telemetryData.find(point => new Date(point.date).getTime() >= lowerBound && normalizeNumber(point.speed) >= 50);
    if (firstFastCar) return new Date(firstFastCar.date).getTime();

    const firstMovingLocation = this.locationData.find(point => {
      const pointTime = new Date(point.date).getTime();
      return pointTime >= lowerBound && (normalizeNumber(point.x) !== 0 || normalizeNumber(point.y) !== 0 || normalizeNumber(point.z) !== 0);
    });
    if (firstMovingLocation) return new Date(firstMovingLocation.date).getTime();

    const firstMovingCar = this.telemetryData.find(point => new Date(point.date).getTime() >= lowerBound && normalizeNumber(point.speed) > 0);
    if (firstMovingCar) return new Date(firstMovingCar.date).getTime();

    return lowerBound || this.telemetryTimes[0] || 0;
  }

  buildTrackPath() {
    const lowerBound = this.sessionStartTimeMs ?? this.telemetryTimes[0] ?? 0;
    const firstFastCar = this.telemetryData.find(point => new Date(point.date).getTime() >= lowerBound && normalizeNumber(point.speed) >= 50);
    const preferredDriver = firstFastCar?.driver_number;
    const preferredRecords = preferredDriver ? this.locationByDriver.get(preferredDriver) : null;
    const fallbackRecords = this.locationDriverNumbers
      .map(driverNumber => this.locationByDriver.get(driverNumber) ?? [])
      .sort((a, b) => b.length - a.length)[0];
    const source = (preferredRecords ?? fallbackRecords ?? []).filter(point => {
      const pointTime = new Date(point.date).getTime();
      return pointTime >= lowerBound && (normalizeNumber(point.x) !== 0 || normalizeNumber(point.y) !== 0);
    });
    if (source.length === 0) return [];

    const startTime = new Date(source[0].date).getTime();
    const oneLapWindowMs = 110000;
    const sampled = [];
    let lastPoint = null;

    for (const point of source) {
      const pointTime = new Date(point.date).getTime();
      if (pointTime - startTime > oneLapWindowMs) break;

      if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) > 80) {
        sampled.push({ x: point.x, y: point.y });
        lastPoint = point;
      }

      const elapsedMs = pointTime - startTime;
      const distanceToStart = Math.hypot(point.x - source[0].x, point.y - source[0].y);
      if (elapsedMs > 45000 && distanceToStart < 300) break;
    }

    const path = sampled.length >= 2 ? sampled : source.slice(0, 800).map(point => ({ x: point.x, y: point.y }));
    const first = path[0];
    const last = path[path.length - 1];
    if (first && last && Math.hypot(last.x - first.x, last.y - first.y) > 1) {
      path.push({ ...first });
    }

    return path;
  }

  setFocusedDriver(driverNumber) {
    const parsedDriverNumber = Number(driverNumber);
    if (!Number.isFinite(parsedDriverNumber) || !this.telemetryByDriver.has(parsedDriverNumber)) return;

    this.focusedDriverNumber = parsedDriverNumber;
    this.emitDriverFocus();
    if (this.telemetryData.length > 0) {
      this.tick({ advance: false });
    }
  }

  seek(progress) {
    const parsedProgress = Number(progress);
    if (!Number.isFinite(parsedProgress) || this.telemetryData.length === 0) return;

    const clampedProgress = Math.min(Math.max(parsedProgress, 0), 1);
    this.currentIndex = Math.min(
      Math.max(Math.floor(clampedProgress * (this.telemetryData.length - 1)), 0),
      this.telemetryData.length - 1
    );
    this.replayTimeMs = this.telemetryTimes[this.currentIndex] ?? null;
    this.tick({ advance: false });
  }

  jump(seconds) {
    const parsedSeconds = Number(seconds);
    if (!Number.isFinite(parsedSeconds) || this.telemetryData.length === 0) return;

    const currentTime = this.telemetryTimes[this.currentIndex] || this.telemetryTimes[0];
    this.seekToTime(currentTime + parsedSeconds * 1000);
  }

  seekToTime(targetTime) {
    if (!Number.isFinite(targetTime) || this.telemetryTimes.length === 0) return;

    this.currentIndex = Math.min(Math.max(findIndexAtOrAfter(this.telemetryTimes, targetTime), 0), this.telemetryData.length - 1);
    this.replayTimeMs = this.telemetryTimes[this.currentIndex] ?? null;
    this.tick({ advance: false });
  }

  scheduleNextTick(delay = this.baseTickMs / this.playbackSpeed) {
    if (!this.isPlaying) return;
    this.timerId = setTimeout(() => {
      this.tick();
      this.scheduleNextTick();
    }, delay);
  }

  tick(options = {}) {
    const shouldAdvance = options.advance !== false;
    const initialDataPoint = this.telemetryData[this.currentIndex];
    const targetTime = this.replayTimeMs ?? (initialDataPoint ? new Date(initialDataPoint.date).getTime() : null);
    if (targetTime === null) {
      this.stop();
      return;
    }

    this.currentIndex = findIndexAtOrAfter(this.telemetryTimes, targetTime);
    const dataPoint = this.telemetryData[this.currentIndex];
    if (!dataPoint) {
      this.stop();
      return;
    }

    const leaderboard = this.buildLeaderboard(targetTime).map((entry, i) => {
      const driverNumber = entry.driverNumber;
      const driver = this.drivers[driverNumber];
      const telemetry = this.findTelemetryForDriverAtTime(driverNumber, targetTime);
      const speed = normalizeNumber(telemetry?.speed);
      const gear = normalizeNumber(telemetry?.n_gear);
      const gap = this.formatLeaderboardGap(entry, speed);
      const stint = this.findStintForDriverLap(driverNumber, entry.lap);
      const tyreAge = stint && Number.isFinite(entry.lap)
        ? normalizeNumber(stint.tyre_age_at_start) + Math.max(0, entry.lap - normalizeNumber(stint.lap_start))
        : undefined;

      return {
        pos: i + 1,
        driverNumber: String(driverNumber),
        driver: driver?.Tla || driver?.FullName?.substring(0, 3).toUpperCase() || String(driverNumber),
        gap,
        color: `#${driver?.TeamColour || 'ffffff'}`,
        speed,
        gear,
        dataStatus: 'Telemetry',
        positionSource: entry.source,
        gapSource: entry.intervalRecord ? 'intervals' : 'speed',
        lap: entry.lap,
        compound: stint?.compound,
        tyreAge
      };
    });

    const focusedData = this.findTelemetryForDriverAtTime(this.focusedDriverNumber, targetTime) || dataPoint;
    const focusedDriverNumber = focusedData?.driver_number ?? this.focusedDriverNumber ?? dataPoint.driver_number;

    const telemetry = {
      driverNumber: String(focusedDriverNumber),
      speed: normalizeNumber(focusedData.speed),
      gear: normalizeNumber(focusedData.n_gear),
      throttle: clampPercent(focusedData.throttle),
      brake: clampPercent(focusedData.brake),
      rpm: normalizeNumber(focusedData.rpm)
    };

    const positionsObj = {};
    this.locationDriverNumbers.forEach((drv) => {
      const bestLoc = this.findLocationForDriverAtTime(drv, targetTime);
      if (bestLoc) {
        positionsObj[drv] = { X: bestLoc.x, Y: bestLoc.y, Z: bestLoc.z };
      }
    });
    const raceControlMessages = this.findRaceControlMessagesAtTime(targetTime);
    const trackFlag = this.resolveTrackFlagAtTime(targetTime);

    if (shouldAdvance) {
      const nextTime = targetTime + this.baseTickMs;
      const lastTime = this.telemetryTimes[this.telemetryTimes.length - 1];

      if (nextTime >= lastTime) {
        this.currentIndex = 0;
        this.replayTimeMs = this.telemetryTimes[0] ?? null;
      } else {
        this.replayTimeMs = nextTime;
        this.currentIndex = findIndexAtOrAfter(this.telemetryTimes, nextTime);
      }
    }

    sendF1Data(this.mainWindow, {
      type: 'race-frame',
      telemetry,
      leaderboard,
      drivers: this.drivers,
      positions: positionsObj,
      trackBounds: this.trackBounds,
      trackPath: this.trackPath,
      trackFlag,
      raceControlMessages,
      replayControl: this.buildReplayControl()
    });
  }

  findTelemetryForDriverAtTime(driverNumber, targetTime) {
    return findRecordAtOrAfter(this.telemetryByDriver.get(driverNumber), targetTime);
  }

  buildLeaderboard(targetTime) {
    const entries = this.telemetryDriverNumbers.map((driverNumber, fallbackIndex) => {
      const positionRecord = findRecordAtOrBefore(this.positionByDriver.get(driverNumber), targetTime);
      const intervalRecord = findRecordAtOrBefore(this.intervalByDriver.get(driverNumber), targetTime);
      const lapRecord = this.findLapForDriverAtTime(driverNumber, targetTime);
      return {
        driverNumber,
        position: positionRecord?.position,
        intervalRecord,
        lap: lapRecord?.lap_number,
        fallbackIndex,
        source: positionRecord ? 'position' : 'fallback'
      };
    });

    return entries.sort((a, b) => {
      const positionA = Number(a.position);
      const positionB = Number(b.position);
      const hasPositionA = Number.isFinite(positionA);
      const hasPositionB = Number.isFinite(positionB);

      if (hasPositionA && hasPositionB) return positionA - positionB;
      if (hasPositionA) return -1;
      if (hasPositionB) return 1;
      return a.fallbackIndex - b.fallbackIndex;
    });
  }

  formatLeaderboardGap(entry, speed) {
    const position = Number(entry.position);
    if (position === 1) return 'Leader';

    const interval = formatIntervalValue(entry.intervalRecord?.interval);
    if (interval) return interval;

    const gapToLeader = formatIntervalValue(entry.intervalRecord?.gap_to_leader);
    if (gapToLeader) return gapToLeader;

    if (Number.isFinite(position)) return '--';

    return `${speed} km/h`;
  }

  findLapForDriverAtTime(driverNumber, targetTime) {
    const records = this.lapByDriver.get(driverNumber);
    if (!records || records.length === 0) return null;

    let low = 0;
    let high = records.length - 1;

    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (new Date(records[mid].date_start).getTime() <= targetTime) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return new Date(records[low].date_start).getTime() <= targetTime ? records[low] : null;
  }

  findStintForDriverLap(driverNumber, lapNumber) {
    const lap = Number(lapNumber);
    if (!Number.isFinite(lap)) return null;

    return (this.stintByDriver.get(driverNumber) ?? []).find(stint => {
      const start = normalizeNumber(stint.lap_start);
      const end = normalizeNumber(stint.lap_end);
      return lap >= start && (end === 0 || lap <= end);
    }) ?? null;
  }

  findRaceControlMessagesAtTime(targetTime) {
    const latestIndex = findLastIndexAtOrBefore(this.raceControlTimes, targetTime);
    if (latestIndex < 0) return [];

    return this.raceControlData.slice(Math.max(0, latestIndex - 7), latestIndex + 1).map(message => ({
      date: message.date,
      lap: message.lap_number,
      message: message.message,
      category: message.category,
      flag: message.flag,
      scope: message.scope,
      sector: message.sector,
      driverNumber: message.driver_number ? String(message.driver_number) : undefined
    }));
  }

  resolveTrackFlagAtTime(targetTime) {
    const latestIndex = findLastIndexAtOrBefore(this.raceControlTimes, targetTime);
    if (latestIndex < 0) return 'Green';

    for (let i = latestIndex; i >= 0; i--) {
      const flag = mapRaceControlFlag(this.raceControlData[i]);
      if (flag) return flag;
    }

    return 'Green';
  }

  findLocationForDriverAtTime(driverNumber, targetTime) {
    const { previous, next } = findRecordsAround(this.locationByDriver.get(driverNumber), targetTime);
    if (!previous && !next) return null;
    if (!previous || !next || previous === next) return previous ?? next;

    const previousTime = new Date(previous.date).getTime();
    const nextTime = new Date(next.date).getTime();
    const span = nextTime - previousTime;
    if (!Number.isFinite(span) || span <= 0) return next;

    const progress = Math.min(Math.max((targetTime - previousTime) / span, 0), 1);
    const lerp = (start, end) => normalizeNumber(start) + (normalizeNumber(end) - normalizeNumber(start)) * progress;

    return {
      ...next,
      x: lerp(previous.x, next.x),
      y: lerp(previous.y, next.y),
      z: lerp(previous.z, next.z)
    };
  }

  emitDriverFocus() {
    if (this.focusedDriverNumber === null) return;
    sendF1Data(this.mainWindow, {
      type: 'driver-focus',
      driverNumber: String(this.focusedDriverNumber)
    });
  }

  emitReplayControl() {
    sendF1Data(this.mainWindow, {
      type: 'replay-control',
      control: this.buildReplayControl()
    });
  }

  buildReplayControl() {
    return {
      isPlaying: this.isPlaying,
      speed: this.playbackSpeed,
      currentIndex: this.currentIndex,
      total: this.telemetryData.length,
      progress: this.telemetryData.length > 0 ? this.currentIndex / this.telemetryData.length : 0,
      currentTimestamp: this.replayTimeMs ? new Date(this.replayTimeMs).toISOString() : this.telemetryData[this.currentIndex]?.date
    };
  }

  stop() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.isPlaying = false;
    this.emitReplayControl();
    sendSourceStatus(this.mainWindow, 'archive', 'stopped', `Local replay ${this.sessionKey} stopped`);
    console.log('[LocalF1 Bridge] Playback stopped.');
  }
}

import fs from 'fs';
import path from 'path';
import { sendF1Data, sendSourceStatus } from './f1-events.js';

const OPENF1 = 'https://api.openf1.org/v1';
const CACHE_DIR_NAME = '.vmax-cache-v1';
const fsPromises = fs.promises;
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

function clampPercent(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return 0;
  return Math.min(Math.max(parsedValue, 0), 100);
}

function normalizeNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getRecordTime(record) {
  if (Number.isFinite(record?.time)) return record.time;
  return new Date(record?.date).getTime();
}

function getRecordFieldTime(record, field) {
  const cacheField = `${field}_time`;
  if (Number.isFinite(record?.[cacheField])) return record[cacheField];
  return new Date(record?.[field]).getTime();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function readJsonFile(filePath) {
  const contents = await fsPromises.readFile(filePath, 'utf8');
  const parsed = JSON.parse(contents);
  await yieldToEventLoop();
  return parsed;
}

async function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return readJsonFile(filePath);
}

async function writeJsonFile(filePath, data) {
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function writeCompactJsonFile(filePath, data) {
  await fsPromises.writeFile(filePath, JSON.stringify(data));
}

async function readPerDriverJson(libraryDir, prefix) {
  const filePattern = new RegExp(`^${prefix}\\.\\d+\\.json$`);
  const files = (await fsPromises.readdir(libraryDir))
    .filter(fileName => filePattern.test(fileName))
    .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]));

  if (files.length === 0) return [];

  const records = [];
  for (const fileName of files) {
    const driverRecords = await readJsonFile(path.join(libraryDir, fileName));
    for (const record of driverRecords) {
      records.push(record);
    }
  }

  return records;
}

function normalizeTelemetryRecord(record) {
  return {
    time: getRecordTime(record),
    driver_number: normalizeNumber(record.driver_number),
    speed: normalizeNumber(record.speed),
    n_gear: normalizeNumber(record.n_gear),
    throttle: normalizeNumber(record.throttle),
    brake: normalizeNumber(record.brake),
    rpm: normalizeNumber(record.rpm)
  };
}

function normalizeLocationRecord(record) {
  return {
    time: getRecordTime(record),
    driver_number: normalizeNumber(record.driver_number),
    x: normalizeNumber(record.x),
    y: normalizeNumber(record.y),
    z: normalizeNumber(record.z)
  };
}

async function readCacheFiles(cacheDir) {
  if (!fs.existsSync(cacheDir)) return [];
  const files = (await fsPromises.readdir(cacheDir))
    .filter(fileName => /^\d+\.json$/.test(fileName))
    .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));

  if (files.length === 0) return [];

  const records = [];
  for (const fileName of files) {
    const driverRecords = await readJsonFile(path.join(cacheDir, fileName));
    for (const record of driverRecords) {
      records.push(record);
    }
  }

  return records;
}

async function writeDriverCache(libraryDir, prefix, records) {
  const cacheDir = path.join(libraryDir, CACHE_DIR_NAME, prefix);
  await fsPromises.mkdir(cacheDir, { recursive: true });
  const grouped = new Map();

  records.forEach(record => {
    const driverRecords = grouped.get(record.driver_number) ?? [];
    driverRecords.push(record);
    grouped.set(record.driver_number, driverRecords);
  });

  for (const [driverNumber, driverRecords] of grouped.entries()) {
    await writeCompactJsonFile(path.join(cacheDir, `${driverNumber}.json`), driverRecords);
  }
}

async function readCachedPerDriverJson(libraryDir, prefix, normalizeRecord) {
  const cacheDir = path.join(libraryDir, CACHE_DIR_NAME, prefix);
  const cachedRecords = await readCacheFiles(cacheDir);
  if (cachedRecords.length > 0) return cachedRecords;

  const rawRecords = await readPerDriverJson(libraryDir, prefix);
  if (rawRecords.length === 0) return [];

  const normalizedRecords = rawRecords.map(normalizeRecord);
  await writeDriverCache(libraryDir, prefix, normalizedRecords);
  return normalizedRecords;
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
    driverRecords.sort((a, b) => getRecordTime(a) - getRecordTime(b));
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
    driverRecords.sort((a, b) => getRecordFieldTime(a, dateField) - getRecordFieldTime(b, dateField));
  });

  return map;
}

function sortByDate(records) {
  return [...records].sort((a, b) => getRecordTime(a) - getRecordTime(b));
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

function createEmptySectorSnapshots() {
  return [1, 2, 3].map(sector => ({ sector, status: 'none' }));
}

function getSectorStatus(duration, driverBest, overallBest) {
  if (duration < overallBest) return 'overall';
  if (duration < driverBest) return 'personal';
  return 'completed';
}

function findRecordAtOrAfter(records, targetTime) {
  if (!records || records.length === 0) return null;

  let low = 0;
  let high = records.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getRecordTime(records[mid]) < targetTime) {
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
    if (getRecordTime(records[mid]) <= targetTime) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return getRecordTime(records[low]) <= targetTime ? records[low] : null;
}

function findRecordsAround(records, targetTime) {
  if (!records || records.length === 0) return { previous: null, next: null };

  let low = 0;
  let high = records.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getRecordTime(records[mid]) < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const next = records[low] ?? null;
  const nextTime = next ? getRecordTime(next) : Number.POSITIVE_INFINITY;
  const previous = nextTime <= targetTime ? next : (records[low - 1] ?? next);

  return { previous, next };
}

function findCursorIndexAtOrAfter(records, targetTime, currentIndex = 0) {
  if (!records || records.length === 0) return 0;

  const clampedIndex = Math.min(Math.max(currentIndex, 0), records.length - 1);
  const currentTime = getRecordTime(records[clampedIndex]);

  if (currentTime <= targetTime) {
    let index = clampedIndex;
    while (index < records.length - 1 && getRecordTime(records[index]) < targetTime) {
      index++;
    }
    return index;
  }

  let index = clampedIndex;
  while (index > 0 && getRecordTime(records[index - 1]) >= targetTime) {
    index--;
  }
  return index;
}

function findCursorIndexAtOrBefore(records, targetTime, currentIndex = 0) {
  if (!records || records.length === 0) return 0;

  const clampedIndex = Math.min(Math.max(currentIndex, 0), records.length - 1);
  const currentTime = getRecordTime(records[clampedIndex]);

  if (currentTime <= targetTime) {
    let index = clampedIndex;
    while (index < records.length - 1 && getRecordTime(records[index + 1]) <= targetTime) {
      index++;
    }
    return index;
  }

  let index = clampedIndex;
  while (index > 0 && getRecordTime(records[index]) > targetTime) {
    index--;
  }
  return getRecordTime(records[index]) <= targetTime ? index : -1;
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
    this.telemetryByDriver = new Map();
    this.locationByDriver = new Map();
    this.positionByDriver = new Map();
    this.intervalByDriver = new Map();
    this.lapByDriver = new Map();
    this.sectorEvents = [];
    this.sectorEventTimes = [];
    this.performanceEvents = [];
    this.performanceEventTimes = [];
    this.totalLaps = null;
    this.stintByDriver = new Map();
    this.pitEvents = [];
    this.pitEventTimes = [];
    this.teamRadioByDriver = new Map();
    this.teamRadioTimes = [];
    this.raceControlData = [];
    this.raceControlTimes = [];
    this.weatherData = [];
    this.weatherTimes = [];
    this.telemetryTimes = [];
    this.telemetryRecordCount = 0;
    this.locationRecordCount = 0;
    this.cursorCache = new Map();
    this.lastCursorTime = null;
    this.telemetryDriverNumbers = [];
    this.locationDriverNumbers = [];
    this.trackPath = [];
    this.focusedDriverNumber = null;
    this.sessionInfo = null;
    this.sessionStartTimeMs = null;
    this.sessionEndTimeMs = null;
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
      this.sessionInfo = await readJsonIfExists(sessionPath, null);
      this.sessionStartTimeMs = this.sessionInfo?.date_start ? new Date(this.sessionInfo.date_start).getTime() : null;
      this.sessionEndTimeMs = this.sessionInfo?.date_end ? new Date(this.sessionInfo.date_end).getTime() : null;

      // 1. Load Drivers
      const parsedDrivers = await readJsonFile(path.join(libraryDir, 'drivers.json'));
      
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
      let telemetryData = await readCachedPerDriverJson(libraryDir, 'car_data', normalizeTelemetryRecord);
      if (telemetryData.length === 0) {
        telemetryData = (await readJsonFile(path.join(libraryDir, 'car_data.json'))).map(normalizeTelemetryRecord);
        await writeDriverCache(libraryDir, 'car_data', telemetryData);
      }
      telemetryData.sort((a, b) => getRecordTime(a) - getRecordTime(b));
      this.telemetryRecordCount = telemetryData.length;
      this.telemetryByDriver = buildRecordsByDriver(telemetryData);
      this.telemetryTimes = telemetryData.map(point => getRecordTime(point));
      this.telemetryDriverNumbers = [...new Set(telemetryData.map(point => point.driver_number))];
      this.focusedDriverNumber = this.resolveInitialFocusedDriver();
      telemetryData = [];
      console.log(`[LocalF1 Bridge] Loaded ${this.telemetryRecordCount} telemetry records.`);

      // 3. Load Location
      let locationData = await readCachedPerDriverJson(libraryDir, 'location', normalizeLocationRecord);
      if (locationData.length === 0) {
        locationData = (await readJsonFile(path.join(libraryDir, 'location.json'))).map(normalizeLocationRecord);
        await writeDriverCache(libraryDir, 'location', locationData);
      }
      locationData.sort((a, b) => getRecordTime(a) - getRecordTime(b));
      this.locationRecordCount = locationData.length;
      this.locationByDriver = buildRecordsByDriver(locationData);
      this.locationDriverNumbers = [...new Set(locationData.map(point => point.driver_number))];
      this.trackPath = this.buildTrackPath();
      this.trackBounds = this.computeTrackBounds();
      locationData = [];
      console.log(`[LocalF1 Bridge] Loaded ${this.locationRecordCount} location records.`);

      const positionPath = path.join(libraryDir, 'position.json');
      this.positionData = await readJsonIfExists(positionPath, []);
      if (this.positionData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] position.json missing. Fetching position stream for ${this.sessionKey}...`);
          this.positionData = await fetchJson(`${OPENF1}/position?session_key=${this.sessionKey}`);
          await writeJsonFile(positionPath, this.positionData);
        } catch (positionError) {
          console.warn('[LocalF1 Bridge] Position stream unavailable. Falling back to driver-number order:', positionError.message);
          this.positionData = [];
        }
      }
      this.positionByDriver = buildRecordsByDriver(this.positionData);
      console.log(`[LocalF1 Bridge] Loaded ${this.positionData.length} position records.`);

      const intervalsPath = path.join(libraryDir, 'intervals.json');
      this.intervalData = await readJsonIfExists(intervalsPath, []);
      if (this.intervalData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] intervals.json missing. Fetching intervals for ${this.sessionKey}...`);
          this.intervalData = await fetchJson(`${OPENF1}/intervals?session_key=${this.sessionKey}`);
          await writeJsonFile(intervalsPath, this.intervalData);
        } catch (intervalError) {
          console.warn('[LocalF1 Bridge] Intervals unavailable. Falling back to speed readout:', intervalError.message);
          this.intervalData = [];
        }
      }
      this.intervalByDriver = buildRecordsByDriver(this.intervalData);
      console.log(`[LocalF1 Bridge] Loaded ${this.intervalData.length} interval records.`);

      const lapsPath = path.join(libraryDir, 'laps.json');
      this.lapData = await readJsonIfExists(lapsPath, []);
      if (this.lapData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] laps.json missing. Fetching laps for ${this.sessionKey}...`);
          this.lapData = await fetchJson(`${OPENF1}/laps?session_key=${this.sessionKey}`);
          await writeJsonFile(lapsPath, this.lapData);
        } catch (lapError) {
          console.warn('[LocalF1 Bridge] Laps unavailable:', lapError.message);
          this.lapData = [];
        }
      }
      this.lapByDriver = buildRecordsByDriverSorted(this.lapData, 'date_start');
      this.buildSectorTimeline();
      this.buildPerformanceTimeline();
      this.totalLaps = this.computeTotalLaps();
      console.log(`[LocalF1 Bridge] Loaded ${this.lapData.length} lap records.`);

      const stintsPath = path.join(libraryDir, 'stints.json');
      this.stintData = await readJsonIfExists(stintsPath, []);
      if (this.stintData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] stints.json missing. Fetching stints for ${this.sessionKey}...`);
          this.stintData = await fetchJson(`${OPENF1}/stints?session_key=${this.sessionKey}`);
          await writeJsonFile(stintsPath, this.stintData);
        } catch (stintError) {
          console.warn('[LocalF1 Bridge] Stints unavailable:', stintError.message);
          this.stintData = [];
        }
      }
      this.stintByDriver = buildStintsByDriver(this.stintData);
      this.buildPitTimeline();
      console.log(`[LocalF1 Bridge] Loaded ${this.stintData.length} stint records.`);

      const raceControlPath = path.join(libraryDir, 'race_control.json');
      this.raceControlData = await readJsonIfExists(raceControlPath, []);
      if (this.raceControlData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] race_control.json missing. Fetching race control messages for ${this.sessionKey}...`);
          this.raceControlData = await fetchJson(`${OPENF1}/race_control?session_key=${this.sessionKey}`);
          await writeJsonFile(raceControlPath, this.raceControlData);
        } catch (raceControlError) {
          console.warn('[LocalF1 Bridge] Race control messages unavailable:', raceControlError.message);
          this.raceControlData = [];
        }
      }
      this.raceControlData = sortByDate(this.raceControlData);
      this.raceControlTimes = this.raceControlData.map(message => getRecordTime(message));
      console.log(`[LocalF1 Bridge] Loaded ${this.raceControlData.length} race control messages.`);

      const teamRadioPath = path.join(libraryDir, 'team_radio.json');
      this.teamRadioData = await readJsonIfExists(teamRadioPath, []);
      if (this.teamRadioData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] team_radio.json missing. Fetching team radio messages for ${this.sessionKey}...`);
          this.teamRadioData = await fetchJson(`${OPENF1}/team_radio?session_key=${this.sessionKey}`);
          await writeJsonFile(teamRadioPath, this.teamRadioData);
        } catch (teamRadioError) {
          console.warn('[LocalF1 Bridge] Team radio unavailable:', teamRadioError.message);
          this.teamRadioData = [];
        }
      }
      this.teamRadioData = sortByDate(this.teamRadioData).filter(message => {
        const messageTime = getRecordTime(message);
        const afterStart = this.sessionStartTimeMs ? messageTime >= this.sessionStartTimeMs : true;
        const beforeEnd = this.sessionEndTimeMs ? messageTime <= this.sessionEndTimeMs : true;
        return afterStart && beforeEnd;
      });
      this.teamRadioTimes = this.teamRadioData.map(message => getRecordTime(message));
      this.teamRadioByDriver = buildRecordsByDriver(this.teamRadioData);
      console.log(`[LocalF1 Bridge] Loaded ${this.teamRadioData.length} team radio messages.`);

      const weatherPath = path.join(libraryDir, 'weather.json');
      this.weatherData = await readJsonIfExists(weatherPath, []);
      if (this.weatherData.length === 0) {
        try {
          console.log(`[LocalF1 Bridge] weather.json missing. Fetching weather for ${this.sessionKey}...`);
          this.weatherData = await fetchJson(`${OPENF1}/weather?session_key=${this.sessionKey}`);
          await writeJsonFile(weatherPath, this.weatherData);
        } catch (weatherError) {
          console.warn('[LocalF1 Bridge] Weather unavailable:', weatherError.message);
          this.weatherData = [];
        }
      }
      this.weatherData = sortByDate(this.weatherData);
      this.weatherTimes = this.weatherData.map(record => getRecordTime(record));
      console.log(`[LocalF1 Bridge] Loaded ${this.weatherData.length} weather records.`);

      console.log(`[LocalF1 Bridge] Computed track bounds:`, this.trackBounds);
      sendSourceStatus(this.mainWindow, 'archive', 'ready', `Local replay ${this.sessionKey} loaded`);

    } catch (err) {
      console.error('[LocalF1 Bridge] Failed to load local files:', err);
      sendSourceStatus(this.mainWindow, 'archive', 'error', err.message);
      throw err;
    }
  }

  start() {
    if (this.telemetryRecordCount === 0) return;
    
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

  findEarliestRecordAfter(recordsByDriver, lowerBound, predicate) {
    let earliest = null;
    let earliestTime = Number.POSITIVE_INFINITY;

    recordsByDriver.forEach(records => {
      const startIndex = findIndexAtOrAfter(records.map(record => getRecordTime(record)), lowerBound);
      for (let i = startIndex; i < records.length; i++) {
        const record = records[i];
        const recordTime = getRecordTime(record);
        if (recordTime >= earliestTime) break;
        if (predicate(record, recordTime)) {
          earliest = record;
          earliestTime = recordTime;
          break;
        }
      }
    });

    return earliest;
  }

  resolvePlaybackStartTime() {
    const lowerBound = this.sessionStartTimeMs ?? this.telemetryTimes[0] ?? 0;
    const firstFastCar = this.findEarliestRecordAfter(this.telemetryByDriver, lowerBound, point => normalizeNumber(point.speed) >= 50);
    if (firstFastCar) return getRecordTime(firstFastCar);

    const firstMovingLocation = this.findEarliestRecordAfter(this.locationByDriver, lowerBound, point => normalizeNumber(point.x) !== 0 || normalizeNumber(point.y) !== 0 || normalizeNumber(point.z) !== 0);
    if (firstMovingLocation) return getRecordTime(firstMovingLocation);

    const firstMovingCar = this.findEarliestRecordAfter(this.telemetryByDriver, lowerBound, point => normalizeNumber(point.speed) > 0);
    if (firstMovingCar) return getRecordTime(firstMovingCar);

    return lowerBound || this.telemetryTimes[0] || 0;
  }

  buildTrackPath() {
    const lowerBound = this.sessionStartTimeMs ?? this.telemetryTimes[0] ?? 0;
    const firstFastCar = this.findEarliestRecordAfter(this.telemetryByDriver, lowerBound, point => normalizeNumber(point.speed) >= 50);
    const preferredDriver = firstFastCar?.driver_number;
    const preferredRecords = preferredDriver ? this.locationByDriver.get(preferredDriver) : null;
    const fallbackRecords = this.locationDriverNumbers
      .map(driverNumber => this.locationByDriver.get(driverNumber) ?? [])
      .sort((a, b) => b.length - a.length)[0];
    const source = (preferredRecords ?? fallbackRecords ?? []).filter(point => {
      const pointTime = getRecordTime(point);
      return pointTime >= lowerBound && (normalizeNumber(point.x) !== 0 || normalizeNumber(point.y) !== 0);
    });
    if (source.length === 0) return [];

    const startTime = getRecordTime(source[0]);
    const oneLapWindowMs = 110000;
    const sampled = [];
    let lastPoint = null;

    for (const point of source) {
      const pointTime = getRecordTime(point);
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

  computeTrackBounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.locationByDriver.forEach(records => {
      records.forEach(point => {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      });
    });

    return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
  }

  setFocusedDriver(driverNumber) {
    const parsedDriverNumber = Number(driverNumber);
    if (!Number.isFinite(parsedDriverNumber) || !this.telemetryByDriver.has(parsedDriverNumber)) return;

    this.focusedDriverNumber = parsedDriverNumber;
    this.emitDriverFocus();
    if (this.telemetryRecordCount > 0) {
      this.tick({ advance: false });
    }
  }

  seek(progress) {
    const parsedProgress = Number(progress);
    if (!Number.isFinite(parsedProgress) || this.telemetryRecordCount === 0) return;

    const clampedProgress = Math.min(Math.max(parsedProgress, 0), 1);
    this.currentIndex = Math.min(
      Math.max(Math.floor(clampedProgress * (this.telemetryRecordCount - 1)), 0),
      this.telemetryRecordCount - 1
    );
    this.replayTimeMs = this.telemetryTimes[this.currentIndex] ?? null;
    this.resetTickCursors();
    this.tick({ advance: false });
  }

  jump(seconds) {
    const parsedSeconds = Number(seconds);
    if (!Number.isFinite(parsedSeconds) || this.telemetryRecordCount === 0) return;

    const currentTime = this.telemetryTimes[this.currentIndex] || this.telemetryTimes[0];
    this.seekToTime(currentTime + parsedSeconds * 1000);
  }

  seekToTime(targetTime) {
    if (!Number.isFinite(targetTime) || this.telemetryTimes.length === 0) return;

    this.currentIndex = Math.min(Math.max(findIndexAtOrAfter(this.telemetryTimes, targetTime), 0), this.telemetryRecordCount - 1);
    this.replayTimeMs = this.telemetryTimes[this.currentIndex] ?? null;
    this.resetTickCursors();
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
    const targetTime = this.replayTimeMs ?? this.telemetryTimes[this.currentIndex] ?? null;
    if (targetTime === null) {
      this.stop();
      return;
    }
    if (this.lastCursorTime !== null && targetTime < this.lastCursorTime) {
      this.resetTickCursors();
    }
    this.lastCursorTime = targetTime;

    this.currentIndex = findIndexAtOrAfter(this.telemetryTimes, targetTime);
    if (this.currentIndex >= this.telemetryRecordCount) {
      this.stop();
      return;
    }

    const sectorSnapshots = this.buildSectorSnapshotsAtTime(targetTime);
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
        tyreAge,
        sectors: sectorSnapshots.get(Number(driverNumber)) ?? createEmptySectorSnapshots()
      };
    });

    const focusedData = this.findTelemetryForDriverAtTime(this.focusedDriverNumber, targetTime) || this.findAnyTelemetryForTime(targetTime);
    const focusedDriverNumber = focusedData?.driver_number ?? this.focusedDriverNumber ?? this.telemetryDriverNumbers[0];

    const telemetry = {
      driverNumber: String(focusedDriverNumber),
      speed: normalizeNumber(focusedData?.speed),
      gear: normalizeNumber(focusedData?.n_gear),
      throttle: clampPercent(focusedData?.throttle),
      brake: clampPercent(focusedData?.brake),
      rpm: normalizeNumber(focusedData?.rpm)
    };
    const lapSummary = this.buildLapSummaryForDriver(focusedDriverNumber, targetTime, sectorSnapshots.get(Number(focusedDriverNumber)));

    const positionsObj = {};
    this.locationDriverNumbers.forEach((drv) => {
      const bestLoc = this.findLocationForDriverAtTime(drv, targetTime);
      if (bestLoc) {
        positionsObj[drv] = { X: bestLoc.x, Y: bestLoc.y, Z: bestLoc.z };
      }
    });
    const raceControlMessages = this.findRaceControlMessagesAtTime(targetTime);
    const trackFlag = this.resolveTrackFlagAtTime(targetTime);
    const teamRadioMessages = this.findTeamRadioMessagesAtTime(focusedDriverNumber, targetTime);
    const teamRadioAlertMessages = this.findRecentTeamRadioMessagesAtTime(targetTime);
    const performanceEvents = this.findRecentPerformanceEventsAtTime(targetTime);
    const pitEvents = this.findRecentPitEventsAtTime(targetTime);
    const weather = this.findWeatherAtTime(targetTime);
    const stintSummary = this.buildStintSummaryForDriver(focusedDriverNumber, lapSummary.currentLap);

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
      teamRadioMessages,
      teamRadioAlertMessages,
      performanceEvents,
      pitEvents,
      totalLaps: this.totalLaps,
      weather,
      lapSummary,
      stintSummary,
      replayControl: this.buildReplayControl()
    });
  }

  findTelemetryForDriverAtTime(driverNumber, targetTime) {
    return this.findRecordAtOrAfterWithCursor('telemetry', this.telemetryByDriver, driverNumber, targetTime);
  }

  resetTickCursors() {
    this.cursorCache.clear();
    this.lastCursorTime = null;
  }

  getCursorKey(scope, driverNumber) {
    return `${scope}:${driverNumber}`;
  }

  findRecordAtOrAfterWithCursor(scope, recordsByDriver, driverNumber, targetTime) {
    const records = recordsByDriver.get(Number(driverNumber)) ?? recordsByDriver.get(driverNumber);
    if (!records || records.length === 0) return null;

    const key = this.getCursorKey(scope, driverNumber);
    const index = findCursorIndexAtOrAfter(records, targetTime, this.cursorCache.get(key) ?? 0);
    this.cursorCache.set(key, index);
    return records[index] ?? null;
  }

  findRecordAtOrBeforeWithCursor(scope, recordsByDriver, driverNumber, targetTime) {
    const records = recordsByDriver.get(Number(driverNumber)) ?? recordsByDriver.get(driverNumber);
    if (!records || records.length === 0) return null;

    const key = this.getCursorKey(scope, driverNumber);
    const index = findCursorIndexAtOrBefore(records, targetTime, this.cursorCache.get(key) ?? 0);
    this.cursorCache.set(key, Math.max(index, 0));
    return index >= 0 ? records[index] : null;
  }

  findRecordsAroundWithCursor(scope, recordsByDriver, driverNumber, targetTime) {
    const records = recordsByDriver.get(Number(driverNumber)) ?? recordsByDriver.get(driverNumber);
    if (!records || records.length === 0) return { previous: null, next: null };

    const key = this.getCursorKey(scope, driverNumber);
    const index = findCursorIndexAtOrAfter(records, targetTime, this.cursorCache.get(key) ?? 0);
    this.cursorCache.set(key, index);

    const next = records[index] ?? null;
    const nextTime = next ? getRecordTime(next) : Number.POSITIVE_INFINITY;
    const previous = nextTime <= targetTime ? next : (records[index - 1] ?? next);

    return { previous, next };
  }

  findAnyTelemetryForTime(targetTime) {
    let closest = null;
    let closestTime = Number.POSITIVE_INFINITY;

    this.telemetryByDriver.forEach((records, driverNumber) => {
      const record = this.findRecordAtOrAfterWithCursor('telemetry', this.telemetryByDriver, driverNumber, targetTime);
      if (!record) return;
      const recordTime = getRecordTime(record);
      if (recordTime < closestTime) {
        closest = record;
        closestTime = recordTime;
      }
    });

    return closest;
  }

  buildLeaderboard(targetTime) {
    const entries = this.telemetryDriverNumbers.map((driverNumber, fallbackIndex) => {
      const positionRecord = this.findRecordAtOrBeforeWithCursor('position', this.positionByDriver, driverNumber, targetTime);
      const intervalRecord = this.findRecordAtOrBeforeWithCursor('interval', this.intervalByDriver, driverNumber, targetTime);
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
      if (getRecordFieldTime(records[mid], 'date_start') <= targetTime) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return getRecordFieldTime(records[low], 'date_start') <= targetTime ? records[low] : null;
  }

  buildSectorTimeline() {
    const events = [];

    this.lapData.forEach(lap => {
      const driverNumber = normalizeNumber(lap.driver_number);
      const lapNumber = normalizeNumber(lap.lap_number);
      const lapStart = getRecordFieldTime(lap, 'date_start');
      if (!Number.isFinite(driverNumber) || !Number.isFinite(lapNumber) || !Number.isFinite(lapStart)) return;

      const sectorDurations = [
        Number(lap.duration_sector_1),
        Number(lap.duration_sector_2),
        Number(lap.duration_sector_3)
      ];

      let elapsedSeconds = 0;
      sectorDurations.forEach((duration, index) => {
        if (!Number.isFinite(duration) || duration <= 0) return;
        elapsedSeconds += duration;
        events.push({
          time: lapStart + elapsedSeconds * 1000,
          driverNumber,
          lapNumber,
          sector: index + 1,
          duration
        });
      });
    });

    this.sectorEvents = events.sort((a, b) => a.time - b.time || a.sector - b.sector);
    this.sectorEventTimes = this.sectorEvents.map(event => event.time);
  }

  buildPerformanceTimeline() {
    const events = [];
    const driverBestSector = new Map();
    const overallBestSector = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const getDriverSectorBest = (driverNumber) => {
      const existing = driverBestSector.get(driverNumber);
      if (existing) return existing;

      const initial = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      driverBestSector.set(driverNumber, initial);
      return initial;
    };

    this.sectorEvents.forEach(event => {
      const sectorIndex = event.sector - 1;
      const driverBest = getDriverSectorBest(event.driverNumber);
      const previousDriverBest = driverBest[sectorIndex];
      const previousOverallBest = overallBestSector[sectorIndex];
      const status = getSectorStatus(event.duration, previousDriverBest, previousOverallBest);

      if (status === 'overall' && event.lapNumber > 1) {
        events.push({
          id: `sector.${event.driverNumber}.${event.lapNumber}.${event.sector}`,
          type: 'purple-sector',
          time: event.time,
          date: new Date(event.time).toISOString(),
          driverNumber: String(event.driverNumber),
          lap: event.lapNumber,
          sector: event.sector,
          value: event.duration,
          delta: Number.isFinite(previousOverallBest) ? event.duration - previousOverallBest : undefined
        });
      }

      driverBest[sectorIndex] = Math.min(driverBest[sectorIndex], event.duration);
      overallBestSector[sectorIndex] = Math.min(overallBestSector[sectorIndex], event.duration);
    });

    const lapCompletions = [];
    this.lapData.forEach(lap => {
      const driverNumber = normalizeNumber(lap.driver_number);
      const lapNumber = normalizeNumber(lap.lap_number);
      const lapStart = getRecordFieldTime(lap, 'date_start');
      const lapDuration = Number(lap.lap_duration);
      if (!Number.isFinite(driverNumber) || !Number.isFinite(lapNumber) || !Number.isFinite(lapStart) || !Number.isFinite(lapDuration) || lapDuration <= 0) return;

      lapCompletions.push({
        time: lapStart + lapDuration * 1000,
        driverNumber,
        lapNumber,
        duration: lapDuration
      });
    });

    lapCompletions.sort((a, b) => a.time - b.time);

    const driverBestLap = new Map();
    let overallBestLap = Number.POSITIVE_INFINITY;

    lapCompletions.forEach(lap => {
      const previousDriverBest = driverBestLap.get(lap.driverNumber) ?? Number.POSITIVE_INFINITY;
      const previousOverallBest = overallBestLap;
      const isOverallBest = lap.duration < previousOverallBest;
      const isPersonalBest = lap.duration < previousDriverBest;

      if (lap.lapNumber > 1 && isOverallBest) {
        events.push({
          id: `lap.fastest.${lap.driverNumber}.${lap.lapNumber}`,
          type: 'fastest-lap',
          time: lap.time,
          date: new Date(lap.time).toISOString(),
          driverNumber: String(lap.driverNumber),
          lap: lap.lapNumber,
          value: lap.duration,
          delta: Number.isFinite(previousOverallBest) ? lap.duration - previousOverallBest : undefined
        });
      } else if (lap.lapNumber > 1 && isPersonalBest) {
        events.push({
          id: `lap.personal.${lap.driverNumber}.${lap.lapNumber}`,
          type: 'personal-lap',
          time: lap.time,
          date: new Date(lap.time).toISOString(),
          driverNumber: String(lap.driverNumber),
          lap: lap.lapNumber,
          value: lap.duration,
          delta: Number.isFinite(previousDriverBest) ? lap.duration - previousDriverBest : undefined
        });
      }

      driverBestLap.set(lap.driverNumber, Math.min(previousDriverBest, lap.duration));
      overallBestLap = Math.min(overallBestLap, lap.duration);
    });

    this.performanceEvents = events.sort((a, b) => a.time - b.time);
    this.performanceEventTimes = this.performanceEvents.map(event => event.time);
  }

  buildSectorSnapshotsAtTime(targetTime) {
    const latestIndex = findLastIndexAtOrBefore(this.sectorEventTimes, targetTime);
    const snapshots = new Map();
    const currentLapByDriver = new Map();

    this.telemetryDriverNumbers.forEach(driverNumber => {
      const numericDriverNumber = Number(driverNumber);
      const currentLap = this.findLapForDriverAtTime(numericDriverNumber, targetTime);
      snapshots.set(numericDriverNumber, createEmptySectorSnapshots());
      currentLapByDriver.set(numericDriverNumber, normalizeNumber(currentLap?.lap_number));
    });

    if (latestIndex < 0) return snapshots;

    const driverBest = new Map();
    const overallBest = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

    const getDriverBest = (driverNumber) => {
      const existing = driverBest.get(driverNumber);
      if (existing) return existing;

      const initial = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      driverBest.set(driverNumber, initial);
      return initial;
    };

    for (let i = 0; i <= latestIndex; i++) {
      const event = this.sectorEvents[i];
      const sectorIndex = event.sector - 1;
      const driverSectorBest = getDriverBest(event.driverNumber);
      const status = getSectorStatus(event.duration, driverSectorBest[sectorIndex], overallBest[sectorIndex]);

      driverSectorBest[sectorIndex] = Math.min(driverSectorBest[sectorIndex], event.duration);
      overallBest[sectorIndex] = Math.min(overallBest[sectorIndex], event.duration);

      if (currentLapByDriver.get(event.driverNumber) !== event.lapNumber) continue;

      snapshots.set(event.driverNumber, [
        ...(snapshots.get(event.driverNumber) ?? createEmptySectorSnapshots())
      ]);
      snapshots.get(event.driverNumber)[sectorIndex] = {
        sector: event.sector,
        status,
        value: event.duration,
        lap: event.lapNumber,
        bestPersonal: driverSectorBest[sectorIndex],
        bestOverall: overallBest[sectorIndex],
        deltaToPersonal: event.duration - driverSectorBest[sectorIndex],
        deltaToOverall: event.duration - overallBest[sectorIndex]
      };
    }

    return snapshots;
  }

  buildSectorSnapshotsForLapAtTime(driverNumber, lapNumber, targetTime) {
    const numericDriverNumber = Number(driverNumber);
    const numericLapNumber = Number(lapNumber);
    const snapshots = createEmptySectorSnapshots();
    const latestIndex = findLastIndexAtOrBefore(this.sectorEventTimes, targetTime);

    if (!Number.isFinite(numericDriverNumber) || !Number.isFinite(numericLapNumber) || latestIndex < 0) {
      return snapshots;
    }

    const driverBest = new Map();
    const overallBest = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

    const getDriverBest = (eventDriverNumber) => {
      const existing = driverBest.get(eventDriverNumber);
      if (existing) return existing;

      const initial = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      driverBest.set(eventDriverNumber, initial);
      return initial;
    };

    for (let i = 0; i <= latestIndex; i++) {
      const event = this.sectorEvents[i];
      const sectorIndex = event.sector - 1;
      const driverSectorBest = getDriverBest(event.driverNumber);
      const status = getSectorStatus(event.duration, driverSectorBest[sectorIndex], overallBest[sectorIndex]);

      driverSectorBest[sectorIndex] = Math.min(driverSectorBest[sectorIndex], event.duration);
      overallBest[sectorIndex] = Math.min(overallBest[sectorIndex], event.duration);

      if (event.driverNumber !== numericDriverNumber || event.lapNumber !== numericLapNumber) continue;

      snapshots[sectorIndex] = {
        sector: event.sector,
        status,
        value: event.duration,
        lap: event.lapNumber,
        bestPersonal: driverSectorBest[sectorIndex],
        bestOverall: overallBest[sectorIndex],
        deltaToPersonal: event.duration - driverSectorBest[sectorIndex],
        deltaToOverall: event.duration - overallBest[sectorIndex]
      };
    }

    return snapshots;
  }

  buildLapSummaryForDriver(driverNumber, targetTime, currentSectors = createEmptySectorSnapshots()) {
    const numericDriverNumber = Number(driverNumber);
    const records = this.lapByDriver.get(numericDriverNumber) ?? [];
    if (records.length === 0) {
      return {
        driverNumber: String(driverNumber),
        sectors: currentSectors
      };
    }

    const currentLap = this.findLapForDriverAtTime(numericDriverNumber, targetTime);
    let lastCompletedLap = null;
    let bestLap = null;

    for (const lap of records) {
      const lapStart = getRecordFieldTime(lap, 'date_start');
      const lapDuration = Number(lap.lap_duration);
      if (!Number.isFinite(lapStart) || !Number.isFinite(lapDuration) || lapDuration <= 0) continue;
      if (lapStart + lapDuration * 1000 > targetTime) continue;

      lastCompletedLap = lap;
      if (!bestLap || lapDuration < Number(bestLap.lap_duration)) {
        bestLap = lap;
      }
    }

    const lastLapTime = Number(lastCompletedLap?.lap_duration);
    const bestLapTime = Number(bestLap?.lap_duration);
    const hasCurrentSector = currentSectors.some(sector => sector.status !== 'none');
    const lastLapNumber = normalizeNumber(lastCompletedLap?.lap_number);
    const displayPreviousLapSectors = !hasCurrentSector && Number.isFinite(lastLapNumber);
    const displaySectors = displayPreviousLapSectors
      ? this.buildSectorSnapshotsForLapAtTime(numericDriverNumber, lastLapNumber, targetTime)
      : currentSectors;

    return {
      driverNumber: String(driverNumber),
      currentLap: currentLap?.lap_number,
      lastLap: lastCompletedLap?.lap_number,
      lastLapTime: Number.isFinite(lastLapTime) ? lastLapTime : undefined,
      bestLap: bestLap?.lap_number,
      bestLapTime: Number.isFinite(bestLapTime) ? bestLapTime : undefined,
      deltaToBest: Number.isFinite(lastLapTime) && Number.isFinite(bestLapTime) ? lastLapTime - bestLapTime : undefined,
      sectorsLap: displayPreviousLapSectors ? lastLapNumber : normalizeNumber(currentLap?.lap_number),
      sectorsSource: displayPreviousLapSectors ? 'last' : 'current',
      sectors: displaySectors
    };
  }

  buildPitTimeline() {
    const events = [];

    this.stintData.forEach(stint => {
      const stintNumber = normalizeNumber(stint.stint_number);
      if (stintNumber <= 1) return;

      const driverNumber = normalizeNumber(stint.driver_number);
      const lapStart = normalizeNumber(stint.lap_start);
      if (lapStart <= 1) return;

      const lapRecord = (this.lapByDriver.get(driverNumber) ?? []).find(lap => normalizeNumber(lap.lap_number) === lapStart);
      const eventTime = getRecordFieldTime(lapRecord, 'date_start');
      if (!Number.isFinite(driverNumber) || !Number.isFinite(lapStart) || !Number.isFinite(eventTime)) return;

      events.push({
        id: `pit.${driverNumber}.${stintNumber}.${lapStart}`,
        time: eventTime,
        date: new Date(eventTime).toISOString(),
        driverNumber: String(driverNumber),
        lap: lapStart,
        stintNumber,
        compound: String(stint.compound ?? 'UNKNOWN'),
        tyreAgeAtStart: normalizeNumber(stint.tyre_age_at_start)
      });
    });

    this.pitEvents = events.sort((a, b) => a.time - b.time);
    this.pitEventTimes = this.pitEvents.map(event => event.time);
  }

  buildStintSummaryForDriver(driverNumber, lapNumber) {
    const lap = Number(lapNumber);
    const numericDriverNumber = Number(driverNumber);
    if (!Number.isFinite(lap)) {
      return { driverNumber: String(driverNumber) };
    }

    const stint = this.findStintForDriverLap(numericDriverNumber, lap);
    if (!stint) {
      return { driverNumber: String(driverNumber) };
    }

    const lapStart = normalizeNumber(stint.lap_start);
    const lapEnd = normalizeNumber(stint.lap_end);
    const tyreAgeAtStart = normalizeNumber(stint.tyre_age_at_start);

    return {
      driverNumber: String(driverNumber),
      stintNumber: normalizeNumber(stint.stint_number),
      compound: stint.compound,
      lapStart,
      lapEnd: lapEnd > 0 ? lapEnd : undefined,
      stintLap: Math.max(1, lap - lapStart + 1),
      tyreAge: tyreAgeAtStart + Math.max(0, lap - lapStart),
      tyreAgeAtStart
    };
  }

  computeTotalLaps() {
    const maxLap = Math.max(0, ...this.lapData.map(lap => normalizeNumber(lap.lap_number)));
    return maxLap > 0 ? maxLap : null;
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

  findTeamRadioMessagesAtTime(driverNumber, targetTime) {
    const records = this.teamRadioByDriver.get(Number(driverNumber)) ?? [];
    if (records.length === 0) return [];

    const latestIndex = findCursorIndexAtOrBefore(records, targetTime, this.cursorCache.get(this.getCursorKey('team-radio', driverNumber)) ?? 0);
    this.cursorCache.set(this.getCursorKey('team-radio', driverNumber), Math.max(latestIndex, 0));
    if (latestIndex < 0) return [];

    const startIndex = Math.max(0, latestIndex - 4);
    const endIndex = latestIndex + 1;

    return records.slice(startIndex, endIndex).map(message => ({
      date: message.date,
      driverNumber: String(message.driver_number),
      recordingUrl: message.recording_url
    }));
  }

  findRecentTeamRadioMessagesAtTime(targetTime, windowMs = 15_000) {
    const latestIndex = findLastIndexAtOrBefore(this.teamRadioTimes, targetTime);
    if (latestIndex < 0) return [];

    const startTime = targetTime - windowMs;
    const messages = [];

    for (let i = latestIndex; i >= 0; i--) {
      const messageTime = this.teamRadioTimes[i];
      if (messageTime < startTime) break;

      const message = this.teamRadioData[i];
      messages.push({
        date: message.date,
        driverNumber: String(message.driver_number),
        recordingUrl: message.recording_url
      });
    }

    return messages.reverse();
  }

  findRecentPerformanceEventsAtTime(targetTime, windowMs = 12_000) {
    const latestIndex = findLastIndexAtOrBefore(this.performanceEventTimes, targetTime);
    if (latestIndex < 0) return [];

    const startTime = targetTime - windowMs;
    const events = [];

    for (let i = latestIndex; i >= 0; i--) {
      const eventTime = this.performanceEventTimes[i];
      if (eventTime < startTime) break;

      const event = this.performanceEvents[i];
      events.push({
        id: event.id,
        type: event.type,
        date: event.date,
        driverNumber: event.driverNumber,
        lap: event.lap,
        sector: event.sector,
        value: event.value,
        delta: event.delta
      });
    }

    return events.reverse();
  }

  findRecentPitEventsAtTime(targetTime, windowMs = 18_000) {
    const latestIndex = findLastIndexAtOrBefore(this.pitEventTimes, targetTime);
    if (latestIndex < 0) return [];

    const startTime = targetTime - windowMs;
    const events = [];

    for (let i = latestIndex; i >= 0; i--) {
      const eventTime = this.pitEventTimes[i];
      if (eventTime < startTime) break;

      const event = this.pitEvents[i];
      events.push({
        id: event.id,
        date: event.date,
        driverNumber: event.driverNumber,
        lap: event.lap,
        stintNumber: event.stintNumber,
        compound: event.compound,
        tyreAgeAtStart: event.tyreAgeAtStart
      });
    }

    return events.reverse();
  }

  findWeatherAtTime(targetTime) {
    const latestIndex = findLastIndexAtOrBefore(this.weatherTimes, targetTime);
    if (latestIndex < 0) return null;

    const record = this.weatherData[latestIndex];
    return {
      date: record.date,
      airTemperature: normalizeNumber(record.air_temperature),
      trackTemperature: normalizeNumber(record.track_temperature),
      humidity: normalizeNumber(record.humidity),
      pressure: normalizeNumber(record.pressure),
      rainfall: normalizeNumber(record.rainfall),
      windDirection: normalizeNumber(record.wind_direction),
      windSpeed: normalizeNumber(record.wind_speed)
    };
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
    const { previous, next } = this.findRecordsAroundWithCursor('location', this.locationByDriver, driverNumber, targetTime);
    if (!previous && !next) return null;
    if (!previous || !next || previous === next) return previous ?? next;

    const previousTime = getRecordTime(previous);
    const nextTime = getRecordTime(next);
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
      total: this.telemetryRecordCount,
      progress: this.telemetryRecordCount > 0 ? this.currentIndex / this.telemetryRecordCount : 0,
      currentTimestamp: this.replayTimeMs ? new Date(this.replayTimeMs).toISOString() : (this.telemetryTimes[this.currentIndex] ? new Date(this.telemetryTimes[this.currentIndex]).toISOString() : undefined)
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

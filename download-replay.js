import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENF1 = 'https://api.openf1.org/v1';
const args = parseArgs(process.argv.slice(2));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(argv) {
  const parsed = {
    year: 2026,
    sessionKey: null,
    latestRace: false,
    allDrivers: true,
    drivers: [],
    force: false,
    delayMs: 350
  };

  for (const arg of argv) {
    if (arg === '--latest-race') parsed.latestRace = true;
    if (arg === '--all-drivers') parsed.allDrivers = true;
    if (arg === '--force') parsed.force = true;
    if (arg.startsWith('--year=')) parsed.year = Number(arg.split('=')[1]);
    if (arg.startsWith('--session-key=')) parsed.sessionKey = Number(arg.split('=')[1]);
    if (arg.startsWith('--drivers=')) {
      parsed.allDrivers = false;
      parsed.drivers = arg.split('=')[1].split(',').map(Number).filter(Number.isFinite);
    }
    if (arg.startsWith('--delay-ms=')) parsed.delayMs = Number(arg.split('=')[1]);
  }

  return parsed;
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      const waitMs = 1500 + attempt * 1000;
      console.log(`[429] Rate limited. Waiting ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Max retries exceeded for ${url}`);
}

async function resolveSession() {
  if (Number.isFinite(args.sessionKey)) {
    const sessions = await fetchWithRetry(`${OPENF1}/sessions?session_key=${args.sessionKey}`);
    if (!sessions[0]) throw new Error(`Session ${args.sessionKey} not found`);
    return sessions[0];
  }

  const sessions = await fetchWithRetry(`${OPENF1}/sessions?year=${args.year}`);
  const candidates = sessions
    .filter(session => !session.is_cancelled)
    .filter(session => args.latestRace ? session.session_type === 'Race' : true)
    .filter(session => new Date(session.date_end).getTime() <= Date.now())
    .sort((a, b) => new Date(b.date_end).getTime() - new Date(a.date_end).getTime());

  if (!candidates[0]) {
    throw new Error(`No completed ${args.latestRace ? 'race ' : ''}sessions found for ${args.year}`);
  }

  return candidates[0];
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function run() {
  const session = await resolveSession();
  const outDir = path.join(__dirname, 'library', session.session_key.toString());
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Downloading ${session.year} ${session.country_name} ${session.session_name} (${session.session_key})`);

  console.log('Fetching drivers...');
  const drivers = await fetchWithRetry(`${OPENF1}/drivers?session_key=${session.session_key}`);
  const targetDrivers = args.allDrivers
    ? drivers.map(driver => driver.driver_number).filter(Number.isFinite)
    : args.drivers;

  if (targetDrivers.length === 0) {
    throw new Error('No target drivers resolved for this session');
  }

  writeJson(path.join(outDir, 'session.json'), {
    ...session,
    downloaded_at: new Date().toISOString(),
    driver_count: targetDrivers.length
  });
  writeJson(path.join(outDir, 'drivers.json'), drivers);

  const telemetry = [];
  const locations = [];

  console.log('Fetching race positions...');
  const positionPath = path.join(outDir, 'position.json');
  const positions = !args.force && fs.existsSync(positionPath)
    ? JSON.parse(fs.readFileSync(positionPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/position?session_key=${session.session_key}`);
  writeJson(positionPath, positions);

  console.log('Fetching race intervals...');
  const intervalsPath = path.join(outDir, 'intervals.json');
  const intervals = !args.force && fs.existsSync(intervalsPath)
    ? JSON.parse(fs.readFileSync(intervalsPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/intervals?session_key=${session.session_key}`);
  writeJson(intervalsPath, intervals);

  console.log('Fetching laps...');
  const lapsPath = path.join(outDir, 'laps.json');
  const laps = !args.force && fs.existsSync(lapsPath)
    ? JSON.parse(fs.readFileSync(lapsPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/laps?session_key=${session.session_key}`);
  writeJson(lapsPath, laps);

  console.log('Fetching stints...');
  const stintsPath = path.join(outDir, 'stints.json');
  const stints = !args.force && fs.existsSync(stintsPath)
    ? JSON.parse(fs.readFileSync(stintsPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/stints?session_key=${session.session_key}`);
  writeJson(stintsPath, stints);

  console.log('Fetching race control messages...');
  const raceControlPath = path.join(outDir, 'race_control.json');
  const raceControl = !args.force && fs.existsSync(raceControlPath)
    ? JSON.parse(fs.readFileSync(raceControlPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/race_control?session_key=${session.session_key}`);
  writeJson(raceControlPath, raceControl);

  console.log('Fetching team radio metadata...');
  const teamRadioPath = path.join(outDir, 'team_radio.json');
  const teamRadio = !args.force && fs.existsSync(teamRadioPath)
    ? JSON.parse(fs.readFileSync(teamRadioPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/team_radio?session_key=${session.session_key}`);
  writeJson(teamRadioPath, teamRadio);

  console.log('Fetching weather...');
  const weatherPath = path.join(outDir, 'weather.json');
  const weather = !args.force && fs.existsSync(weatherPath)
    ? JSON.parse(fs.readFileSync(weatherPath, 'utf8'))
    : await fetchWithRetry(`${OPENF1}/weather?session_key=${session.session_key}`);
  writeJson(weatherPath, weather);

  for (const driverNumber of targetDrivers) {
    console.log(`Fetching car_data for driver ${driverNumber}...`);
    const carPath = path.join(outDir, `car_data.${driverNumber}.json`);
    const carData = !args.force && fs.existsSync(carPath)
      ? JSON.parse(fs.readFileSync(carPath, 'utf8'))
      : await fetchWithRetry(`${OPENF1}/car_data?session_key=${session.session_key}&driver_number=${driverNumber}`);
    writeJson(carPath, carData);
    telemetry.push(...carData);
    await sleep(args.delayMs);

    console.log(`Fetching location for driver ${driverNumber}...`);
    const locationPath = path.join(outDir, `location.${driverNumber}.json`);
    const locationData = !args.force && fs.existsSync(locationPath)
      ? JSON.parse(fs.readFileSync(locationPath, 'utf8'))
      : await fetchWithRetry(`${OPENF1}/location?session_key=${session.session_key}&driver_number=${driverNumber}`);
    writeJson(locationPath, locationData);
    locations.push(...locationData);
    await sleep(args.delayMs);
  }

  telemetry.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  locations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  console.log(`Saving merged ${telemetry.length} telemetry records...`);
  writeJson(path.join(outDir, 'car_data.json'), telemetry);

  console.log(`Saving merged ${locations.length} location records...`);
  writeJson(path.join(outDir, 'location.json'), locations);

  writeJson(path.join(outDir, 'manifest.json'), {
    session_key: session.session_key,
    year: session.year,
    country_name: session.country_name,
    session_name: session.session_name,
    circuit_key: session.circuit_key,
    drivers: targetDrivers,
    telemetry_records: telemetry.length,
    location_records: locations.length,
    position_records: positions.length,
    interval_records: intervals.length,
    lap_records: laps.length,
    stint_records: stints.length,
    race_control_records: raceControl.length,
    team_radio_records: teamRadio.length,
    weather_records: weather.length,
    complete: true,
    updated_at: new Date().toISOString()
  });

  console.log('Done.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

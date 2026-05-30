# V-Max Roadmap

Current focus: prepare V-Max for a real LIVE MODE validation during the 2026 Monaco Grand Prix weekend.

## Phase 1 - Monaco LIVE MODE Test

Target event: 2026 Monaco Grand Prix, Monte Carlo, June 5-7, 2026.

Primary goal: confirm that V-Max works with real live F1 data, not only local replay sessions.

### Live Data Health

- Verify that LIVE MODE detects active and inactive sessions correctly.
- Confirm the live status indicator states:
  - Blue: no live race/session feed.
  - Green: stable live data.
  - Yellow: delayed or partial live data.
  - Red: broken or unavailable live data.
- Check whether OpenF1/live source delays are handled without UI lockups.

### Track Map

- Validate Monaco track rendering with live coordinates.
- Confirm cars stay on the track through slow corners, tunnel, chicane, swimming pool, and final sector.
- Check label overlap in dense traffic.
- Verify selected driver highlight remains readable.
- Confirm S1/S2/S3 overlays do not look like flag states or safety car warnings.

### Timing Tower

- Verify live driver order, gaps, laps, tyre compounds, and sector states.
- Confirm the leaderboard does not shuffle randomly when gaps or intervals are missing.
- Check that lapped cars, pit entries, and formation/start conditions are displayed cleanly.

### Telemetry Panel

- Verify focused driver telemetry in LIVE MODE:
  - Speed.
  - Gear.
  - Throttle.
  - Brake.
  - RPM/load estimate.
  - Lap/sector cards.
  - Tyre/stint panel.
  - Pedal trace.
- Confirm replay-only fallback values do not leak into live sessions.

### Race Control

- Validate live race control messages.
- Confirm filters work for:
  - Flags.
  - Incidents.
  - Penalties.
  - Straight mode.
  - Radio-related events.
- Check visual notifications and audio alerts against Settings toggles.

### Team Radio

- Verify whether live team radio is available or delayed.
- Confirm the UI clearly distinguishes:
  - No feed.
  - No captures yet.
  - New radio available.
  - Selected/archive radio.
- Check that driver names, abbreviations, and capture counts stay correct.

## Phase 2 - Post-Monaco Fix Stage

After the Monaco test, create a bug list grouped by severity.

### Critical

- Live data crashes.
- Broken map rendering.
- Incorrect driver identity.
- Wrong race order.
- UI lockups.

### Data Mismatch

- Wrong gaps.
- Wrong lap count.
- Wrong sectors.
- Wrong tyre/stint data.
- Delayed or duplicated race control events.

### Visual

- Label overlap.
- Sector labels/markers placement.
- Scrollbar polish.
- Dense Monaco map readability.
- Settings layout edge cases.

### Performance

- Renderer load during 1x/2x/4x replay.
- LIVE MODE update frequency.
- Map re-render pressure.
- Team radio/audio notification throttling.

## Phase 3 - Feature Polish

- Improve Timing Tower readability.
- Finalize sector overlay style.
- Add clearer map incident markers.
- Expand telemetry depth with stronger focused-driver context.
- Refine Team Radio archive and notification behavior.
- Continue Settings polish for themes, audio, dev controls, and OTA placeholders.

## Phase 4 - Media And External Panels

- Continue improving Media tab:
  - F1 news.
  - F1 YouTube.
  - UAF1 sources.
- Keep UA Monitor private and avoid exposing location-sensitive screenshots.
- Review Discord Rich Presence text after real live-session testing.

## Phase 5 - Release Readiness

- Run a full QA pass after Monaco.
- Update README and UPDATE.md.
- Add fresh screenshots only from safe/non-sensitive tabs.
- Create a clean release note.
- Backup before major refactors.


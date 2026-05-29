import { discordPresence } from './discord-presence.js';

export function sendF1Data(mainWindow, data) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  discordPresence.updateFromF1Data(data);
  mainWindow.webContents.send('f1-data', data);
}

export function sendSourceStatus(mainWindow, mode, status, message, liveHealth, liveHealthLabel) {
  sendF1Data(mainWindow, {
    type: 'source-status',
    mode,
    status,
    message,
    liveHealth,
    liveHealthLabel
  });
}

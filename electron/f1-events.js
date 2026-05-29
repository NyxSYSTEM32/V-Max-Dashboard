export function sendF1Data(mainWindow, data) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('f1-data', data);
}

export function sendSourceStatus(mainWindow, mode, status, message) {
  sendF1Data(mainWindow, {
    type: 'source-status',
    mode,
    status,
    message
  });
}

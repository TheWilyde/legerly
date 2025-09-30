import log from 'electron-log/main';

// Console: verbose in dev, quieter in prod
log.transports.console.level = process.env.VITE_DEV_SERVER_URL ? 'debug' : 'warn';
// File: keep useful info in production logs
log.transports.file.level = 'info';

export default log;
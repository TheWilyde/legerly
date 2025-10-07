import {app, session} from 'electron';

export function installCSP(isDev: boolean) {
  const devPolicy = [
    "default-src 'self' http://localhost:5173",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self' http://localhost:5173 'unsafe-eval' 'unsafe-inline' blob:",
    "style-src 'self' http://localhost:5173 'unsafe-inline'",
    "img-src 'self' data: blob: file: http://localhost:5173",
    "font-src 'self' data: http://localhost:5173",
    "connect-src 'self' http://localhost:5173 ws://localhost:5173",
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
    "frame-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const prodPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-elem 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
    "frame-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const csp = isDev ? devPolicy : prodPolicy;

  const install = () => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders || {};
      headers['Content-Security-Policy'] = [csp];
      callback({responseHeaders: headers});
    });
    if (isDev) process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  };

  if (app.isReady()) {
    install();
  } else {
    app.on('ready', install);
  }
}

import fs from 'fs';
import path from 'path';

const logFile = fs.createWriteStream(path.join(process.cwd(), 'vibehost_boot.log'), { flags: 'a' });
const logStdout = process.stdout;
const logStderr = process.stderr;

console.log = function(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
  logFile.write(`[LOG] ${new Date().toISOString()} ${msg}`);
  logStdout.write(msg);
};

console.error = function(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
  logFile.write(`[ERR] ${new Date().toISOString()} ${msg}`);
  logStderr.write(msg);
};

console.warn = function(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
  logFile.write(`[WARN] ${new Date().toISOString()} ${msg}`);
  logStdout.write(msg);
};

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION AT:', promise, 'REASON:', reason);
});

console.log('[BOOT] Initializing VibeHost Boot redirection...');

import('./src/index.js');

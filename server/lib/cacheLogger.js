/**
 * Cache-specific logger. Writes to logs/cache.log instead of stdout.
 * Errors still go to stderr so they're visible if something is truly broken.
 *
 * Set CACHE_LOG_CONSOLE=1 to also print to console (for debugging).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'cache.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — rotate when exceeded
const CONSOLE_TOO = process.env.CACHE_LOG_CONSOLE === '1' || process.env.CACHE_LOG_CONSOLE === 'true';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        const rotated = LOG_FILE + '.1';
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(LOG_FILE, rotated);
      }
    }
  } catch (_) {
    // ignore rotation errors
  }
}

function write(level, tag, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `${timestamp} [${level}] [${tag}] ${message}\n`;

  rotateIfNeeded();
  fs.appendFileSync(LOG_FILE, line);

  if (CONSOLE_TOO) {
    if (level === 'ERROR') console.error(line.trimEnd());
    else console.log(line.trimEnd());
  }
}

export const cacheLog = {
  info: (tag, ...args) => write('INFO', tag, ...args),
  warn: (tag, ...args) => write('WARN', tag, ...args),
  error: (tag, ...args) => {
    write('ERROR', tag, ...args);
    // Errors also go to stderr so they're not invisible
    const timestamp = new Date().toISOString();
    const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.error(`${timestamp} [cache-error] [${tag}] ${message}`);
  },
};

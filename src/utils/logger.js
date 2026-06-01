const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const activeLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

const format = (level, message, meta) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level.toUpperCase()}: ${message}`;
  return meta !== undefined ? `${base} ${JSON.stringify(meta)}` : base;
};

const log = (level, message, meta) => {
  if (LEVELS[level] < activeLevel) return;
  const line = format(level, message, meta);
  level === 'error' || level === 'warn'
    ? console.error(line)
    : console.log(line);
};

export const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

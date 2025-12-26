import winston from 'winston';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logsPath = process.env.LOGS_PATH || './logs';
if (!fs.existsSync(logsPath)) {
  fs.mkdirSync(logsPath, { recursive: true });
}

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  http: '\x1b[35m',  // Magenta
  debug: '\x1b[32m', // Green
  reset: '\x1b[0m',  // Reset
};

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...metadata } = info;
    const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
  })
);

const transports = [
  // Console transport with colors
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ colors }),
      format
    ),
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(logsPath, 'combined.log'),
    format,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  // File transport for errors only
  new winston.transports.File({
    filename: path.join(logsPath, 'error.log'),
    level: 'error',
    format,
    maxsize: 5242880,
    maxFiles: 5,
  }),
];

/**
 * Main logger instance
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format,
  transports,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsPath, 'exceptions.log'),
      format,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsPath, 'rejections.log'),
      format,
    }),
  ],
});

export default logger;

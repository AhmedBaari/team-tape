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

// Simple format without colorize for now
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...metadata } = info;
    const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
  })
);

const transports = [
  // Console transport without custom colors (use winston defaults)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(), // Use default winston colorize
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.printf((info) => {
        const { timestamp, level, message, ...metadata } = info;
        const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
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
  exitOnError: false,
});

export default logger;

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = './logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present, but avoid circular references
    if (Object.keys(meta).length > 0) {
      try {
        msg += ` ${JSON.stringify(meta)}`;
      } catch (error) {
        msg += ` [metadata contains circular references]`;
      }
    }
    
    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'minibot' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create specialized loggers for different components
export const memoryLogger = logger.child({ component: 'memory' });
export const mcpLogger = logger.child({ component: 'mcp' });
export const messagingLogger = logger.child({ component: 'messaging' });
export const aiLogger = logger.child({ component: 'ai' });

// Helper functions for structured logging
export const logUserAction = (userId, action, details = {}) => {
  logger.info('User action', {
    userId,
    action,
    ...details,
    timestamp: new Date().toISOString()
  });
};

export const logError = (error, context = {}) => {
  logger.error('Application error', {
    error: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString()
  });
};

export const logPerformance = (operation, duration, details = {}) => {
  logger.info('Performance metric', {
    operation,
    duration,
    ...details,
    timestamp: new Date().toISOString()
  });
};

export const logMemoryUsage = () => {
  const usage = process.memoryUsage();
  logger.info('Memory usage', {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`,
    timestamp: new Date().toISOString()
  });
};

// Log memory usage every 5 minutes in production
if (process.env.NODE_ENV === 'production') {
  setInterval(logMemoryUsage, 5 * 60 * 1000);
}
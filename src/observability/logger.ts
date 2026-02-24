import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino/file', options: { destination: 1 } } }
    : {}),
});

/** Create a child logger with a request / correlation id */
export function childLogger(requestId: string, extra?: Record<string, unknown>): pino.Logger {
  return logger.child({ requestId, ...extra });
}

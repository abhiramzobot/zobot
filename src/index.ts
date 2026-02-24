import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './observability/logger';

async function main(): Promise<void> {
  const { app, redis, scheduler } = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    if (scheduler) {
      scheduler.stop();
      logger.info('Learning scheduler stopped');
    }
    await app.close();
    if (redis) {
      redis.disconnect();
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start server
  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    logger.info({
      port: env.port,
      env: env.nodeEnv,
      primaryProvider: env.llm.primaryProvider,
    }, 'Zobot enterprise chatbot started');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();

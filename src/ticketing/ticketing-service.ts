import { env } from '../config/env';
import { TicketingService } from './types';
import { SalesIQTicketingService } from './salesiq-ticketing';
import { MockTicketingService } from './mock-ticketing';
import { logger } from '../observability/logger';

/**
 * Factory: returns SalesIQ ticketing in production, mock in dev/test.
 */
export function createTicketingService(): TicketingService {
  if (env.salesiq.accessToken && env.salesiq.appId && !env.isDev) {
    logger.info('Using SalesIQ ticketing service');
    return new SalesIQTicketingService();
  }

  logger.info('Using mock ticketing service (development mode)');
  return new MockTicketingService();
}

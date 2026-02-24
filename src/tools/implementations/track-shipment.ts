import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * Clickpost Shipment Tracking API
 * GET /track-order/?format=json&key=...&username=dentalkart&waybill=...&cp_id=...
 * Tracks a shipment by AWB number using Clickpost aggregation.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'track_shipment', conversationId: ctx.conversationId });

  const waybill = String(args.waybill ?? '').trim();
  if (!waybill) {
    return {
      success: false,
      error: 'An AWB (Air Waybill) number is required to track the shipment.',
    };
  }

  // cp_id is the courier partner ID in Clickpost's system
  // Common IDs: 2 = Delhivery, 5 = Bluedart, 8 = Ecom Express, etc.
  // If not specified, Clickpost usually auto-detects
  const cpId = args.cp_id ? String(args.cp_id) : '';

  const params = new URLSearchParams({
    format: 'json',
    key: env.clickpost.apiKey,
    username: env.clickpost.username,
  });
  params.set('waybill', waybill);
  if (cpId) params.set('cp_id', cpId);

  const url = `${env.clickpost.baseUrl}/track-order/?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      log.error({ status: response.status, waybill }, 'Clickpost tracking API error');
      return {
        success: false,
        error: `Tracking lookup failed with status ${response.status}. Please verify the AWB number.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Clickpost wraps result in meta + result
    const meta = (data?.meta ?? {}) as Record<string, unknown>;
    const result = (data?.result ?? {}) as Record<string, unknown>;

    if (meta.status !== 200) {
      return {
        success: true,
        data: {
          found: false,
          waybill,
          message: `No tracking information found for AWB ${waybill}. Please check the number and try again.`,
        },
      };
    }

    // Extract latest status and scan history
    const latestStatus = (result.latest_status ?? {}) as Record<string, unknown>;
    const scans = Array.isArray(result.scans) ? result.scans : [];
    const additional = (result.additional ?? {}) as Record<string, unknown>;

    const trackingInfo = {
      waybill,
      courierPartner: additional.courier_partner_name ?? additional.cp_name ?? 'Unknown',
      currentStatus: latestStatus.clickpost_status_description ?? latestStatus.status ?? 'Unknown',
      statusCode: latestStatus.clickpost_status_code,
      timestamp: latestStatus.timestamp,
      location: latestStatus.clickpost_city ?? latestStatus.location ?? '',
      expectedDelivery: additional.edd_stamp ?? additional.edd ?? null,
      ndrStatus: additional.ndr_status_description ?? null,
      recentScans: scans.slice(0, 5).map((scan: Record<string, unknown>) => ({
        status: (scan as Record<string, unknown>).clickpost_status_description ?? (scan as Record<string, unknown>).status,
        location: (scan as Record<string, unknown>).clickpost_city ?? (scan as Record<string, unknown>).location,
        timestamp: (scan as Record<string, unknown>).timestamp,
      })),
    };

    log.info({ waybill, status: trackingInfo.currentStatus }, 'Shipment tracking retrieved');

    return {
      success: true,
      data: {
        found: true,
        tracking: trackingInfo,
      },
    };
  } catch (err) {
    log.error({ err, waybill }, 'Failed to track shipment via Clickpost');
    return {
      success: false,
      error: 'Unable to retrieve tracking information right now. Please try again in a moment.',
    };
  }
};

export const trackShipmentTool: ToolDefinition = {
  name: 'track_shipment',
  version: '1.0.0',
  description:
    'Track a shipment using the AWB (Air Waybill) number via Clickpost. Returns current delivery status, location, expected delivery date, and recent scan history. Use when customer asks about delivery status or shipment tracking.',
  inputSchema: {
    type: 'object',
    properties: {
      waybill: {
        type: 'string',
        description: 'The AWB (Air Waybill / tracking) number for the shipment.',
      },
      cp_id: {
        type: 'string',
        description: 'Optional Clickpost courier partner ID. Leave empty for auto-detection.',
      },
    },
    required: ['waybill'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      tracking: { type: 'object' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 20,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.track_shipment',
  handler,
};

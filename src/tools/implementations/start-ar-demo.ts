import { ToolDefinition, ToolHandler } from '../types';
import { getLensClient } from '../../lens/lens-client';
import { logger } from '../../observability/logger';

/**
 * Start AR Demo Tool
 *
 * Creates a Zoho Lens augmented reality session for product demonstrations,
 * visual troubleshooting, or installation guidance. The customer receives a
 * join link that opens in their mobile browser (no app install required).
 *
 * Use cases:
 *   - Dental equipment product demos (chairs, autoclaves, handpieces)
 *   - Visual troubleshooting for product issues
 *   - Installation / setup guidance with AR annotations
 *   - Visual inspection of damaged products for return claims
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'start_ar_demo', conversationId: ctx.conversationId });

  const lensClient = getLensClient();
  if (!lensClient || !lensClient.isConfigured()) {
    log.warn('Zoho Lens client not configured');
    return {
      success: false,
      error: 'AR demo feature is not currently available. Please contact support for a product demo.',
    };
  }

  const productName = String(args.product_name ?? 'Product Demo');
  const productId = args.product_id as string | number | undefined;
  const demoType = String(args.demo_type ?? 'product_demo');
  const scheduleTime = args.schedule_time ? String(args.schedule_time) : undefined;

  // Build descriptive session title
  const demoTypeLabels: Record<string, string> = {
    product_demo: '🔬 Product Demo',
    troubleshooting: '🔧 Troubleshooting',
    installation_guide: '📋 Installation Guide',
    visual_inspection: '🔍 Visual Inspection',
  };
  const typeLabel = demoTypeLabels[demoType] || '🔬 Product Demo';
  const sessionTitle = `${typeLabel}: ${productName}`;

  // Check for existing active session
  const existingSession = lensClient.getActiveSession(ctx.visitorId);
  if (existingSession && (existingSession.status === 'active' || existingSession.status === 'creating')) {
    log.info({ existingSession: existingSession.sessionId }, 'Returning existing active AR session');
    return {
      success: true,
      data: {
        sessionStarted: true,
        customerJoinUrl: existingSession.customerJoinUrl,
        sessionTitle: existingSession.title,
        demoType,
        message: `You already have an active AR session. Join using the link below.`,
        instructions: getInstructions(demoType),
        alreadyActive: true,
      },
    };
  }

  try {
    const session = await lensClient.startARDemo(
      ctx.visitorId,
      ctx.conversationId,
      sessionTitle,
      productId,
      productName,
    );

    log.info({
      sessionId: session.sessionId,
      productName,
      demoType,
      customerJoinUrl: session.customerJoinUrl,
    }, 'AR demo session started');

    return {
      success: true,
      data: {
        sessionStarted: true,
        customerJoinUrl: session.customerJoinUrl,
        sessionTitle,
        demoType,
        productName,
        productId,
        message: `AR ${typeLabel.replace(/[🔬🔧📋🔍]\s*/, '')} session is ready for "${productName}". Click the link below to join from your mobile device.`,
        instructions: getInstructions(demoType),
      },
    };
  } catch (err) {
    log.error({ err, productName, demoType }, 'Failed to create AR demo session');
    return {
      success: false,
      error: 'Unable to start AR demo session right now. Please try again in a moment or contact support.',
    };
  }
};

/**
 * Get contextual instructions based on demo type.
 */
function getInstructions(demoType: string): string {
  switch (demoType) {
    case 'product_demo':
      return 'Open the link on your phone → Allow camera access → Point your camera at the area where you want to see the product. Our expert will guide you through AR annotations.';
    case 'troubleshooting':
      return 'Open the link on your phone → Allow camera access → Point your camera at the product you need help with. Our technician will annotate and guide you through the fix.';
    case 'installation_guide':
      return 'Open the link on your phone → Allow camera access → Point your camera at the installation area. Our expert will provide step-by-step AR-guided installation instructions.';
    case 'visual_inspection':
      return 'Open the link on your phone → Allow camera access → Show the product from all angles. Our team will inspect and document the condition.';
    default:
      return 'Open the link on your phone → Allow camera access → Follow the AR annotations from our expert.';
  }
}

export const startARDemoTool: ToolDefinition = {
  name: 'start_ar_demo',
  version: '1.0.0',
  description:
    'Start an augmented reality (AR) product demo session using Zoho Lens. Creates an AR session where the customer can view product demonstrations, get visual troubleshooting help, installation guidance, or submit visual inspection for damaged products. The customer joins from their mobile browser — no app installation needed. Use when the customer asks to see a product demo, needs visual help with equipment, or wants to show a damaged product.',
  inputSchema: {
    type: 'object',
    properties: {
      product_name: {
        type: 'string',
        description: 'Name of the product for the AR demo (e.g., "Dental Autoclave B-Class", "LED Curing Light").',
      },
      product_id: {
        type: ['string', 'number'],
        description: 'Optional product ID from search results.',
      },
      demo_type: {
        type: 'string',
        enum: ['product_demo', 'troubleshooting', 'installation_guide', 'visual_inspection'],
        description: 'Type of AR session: product_demo (default), troubleshooting, installation_guide, or visual_inspection.',
      },
      customer_email: {
        type: 'string',
        description: 'Customer email to send session invite (optional — join link is provided in chat).',
      },
      customer_phone: {
        type: 'string',
        description: 'Customer phone to send session invite via SMS (optional).',
      },
      schedule_time: {
        type: 'string',
        description: 'ISO 8601 time to schedule the AR session for later (optional — defaults to immediate).',
      },
    },
    required: ['product_name'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      sessionStarted: { type: 'boolean' },
      customerJoinUrl: { type: 'string' },
      sessionTitle: { type: 'string' },
      demoType: { type: 'string' },
      message: { type: 'string' },
      instructions: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.start_ar_demo',
  handler,
};

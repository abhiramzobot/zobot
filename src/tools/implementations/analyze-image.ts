/**
 * Image/Vision Analysis Tool (Enhancement v5 — B1)
 *
 * Analyzes customer-uploaded images (damaged products, prescriptions, etc.)
 * using LLM vision capabilities (OpenAI GPT-4o vision API).
 */

import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';
import { env } from '../../config/env';
import OpenAI from 'openai';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'analyze_image', conversationId: ctx.conversationId });

  const imageUrl = args.image_url ? String(args.image_url).trim() : '';
  const analysisType = String(args.analysis_type || 'general').trim();
  const additionalContext = args.context ? String(args.context).trim() : '';

  if (!imageUrl) {
    return { success: false, error: 'Please provide an image URL to analyze.' };
  }

  // Validate URL format
  if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:image')) {
    return { success: false, error: 'Invalid image URL. Please upload an image first.' };
  }

  // Build analysis prompt based on type
  const prompts: Record<string, string> = {
    damage_assessment: [
      'Analyze this product image for damage. Identify:',
      '1. Type of damage (scratches, dents, cracks, broken parts, missing pieces)',
      '2. Severity (minor, moderate, severe)',
      '3. Affected area/component',
      '4. Whether the product is usable',
      '5. Recommended action (replacement, partial refund, repair)',
      additionalContext ? `Additional context: ${additionalContext}` : '',
    ].filter(Boolean).join('\n'),

    product_identification: [
      'Identify this dental/medical product. Provide:',
      '1. Product name and type',
      '2. Brand (if visible)',
      '3. Category (restorative, endodontic, orthodontic, etc.)',
      '4. Key specifications visible',
      '5. Estimated price range',
      additionalContext ? `Additional context: ${additionalContext}` : '',
    ].filter(Boolean).join('\n'),

    prescription_analysis: [
      'Analyze this dental prescription/order form:',
      '1. Products/materials mentioned',
      '2. Quantities needed',
      '3. Any special specifications (shade, size, type)',
      '4. Urgency indicators',
      'Note: This is for product matching, not medical advice.',
      additionalContext ? `Additional context: ${additionalContext}` : '',
    ].filter(Boolean).join('\n'),

    general: [
      'Analyze this image in the context of dental products/equipment support:',
      '1. Describe what you see',
      '2. Identify any products or equipment',
      '3. Note any issues or concerns',
      '4. Suggest relevant actions',
      additionalContext ? `Additional context: ${additionalContext}` : '',
    ].filter(Boolean).join('\n'),
  };

  const prompt = prompts[analysisType] || prompts.general;

  const analysisLabels: Record<string, string> = {
    damage_assessment: 'Damage Assessment',
    product_identification: 'Product Identification',
    prescription_analysis: 'Prescription Analysis',
    general: 'General Image Analysis',
  };

  log.info({ imageUrl: imageUrl.substring(0, 50), analysisType }, 'Image analysis requested');

  // Call OpenAI GPT-4o Vision API
  if (!env.openai.apiKey) {
    log.warn('OpenAI API key not configured; returning placeholder analysis');
    return {
      success: true,
      data: {
        analysisType,
        analysisLabel: analysisLabels[analysisType] || analysisLabels.general,
        imageUrl,
        analysis: 'Vision analysis is not available — OpenAI API key not configured.',
        suggestedActions: getSuggestedActions(analysisType),
      },
    };
  }

  try {
    const client = new OpenAI({
      apiKey: env.openai.apiKey,
      timeout: env.openai.timeoutMs,
    });

    const visionModel = env.openai.model.includes('gpt-4') ? env.openai.model : 'gpt-4o';

    const completion = await client.chat.completions.create({
      model: visionModel,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You are a dental product support specialist analyzing images for Dentalkart customer service. Provide structured, actionable analysis. Be concise.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
    });

    const analysisText = completion.choices[0]?.message?.content || 'Unable to analyze the image.';

    log.info({
      analysisType,
      tokens: completion.usage?.total_tokens,
      model: completion.model,
    }, 'Vision analysis completed');

    return {
      success: true,
      data: {
        analysisType,
        analysisLabel: analysisLabels[analysisType] || analysisLabels.general,
        imageUrl,
        analysis: analysisText,
        model: completion.model,
        suggestedActions: getSuggestedActions(analysisType),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    log.error({ err }, 'Vision API call failed');
    return {
      success: false,
      error: `Image analysis failed: ${errorMsg}. Please try again or describe the issue in text.`,
    };
  }
};

function getSuggestedActions(type: string): string[] {
  switch (type) {
    case 'damage_assessment':
      return [
        'If damaged: Initiate return/refund',
        'If minor damage: Request partial refund',
        'Contact support for replacement',
      ];
    case 'product_identification':
      return [
        'Search for identified product',
        'Add to cart',
        'Request quote for bulk order',
      ];
    case 'prescription_analysis':
      return [
        'Search for mentioned products',
        'Create bulk order',
        'Request consultation',
      ];
    default:
      return ['Describe the issue', 'Search related products', 'Contact support'];
  }
}

export const analyzeImageTool: ToolDefinition = {
  name: 'analyze_image',
  version: '1.0.0',
  description:
    'Analyze a customer-uploaded image using AI vision. Supports damage assessment (broken/defective products), product identification, prescription reading, and general image analysis. Use when customer uploads a photo or says "look at this image", "my product is damaged", or shares a prescription.',
  inputSchema: {
    type: 'object',
    properties: {
      image_url: {
        type: 'string',
        description: 'URL of the uploaded image to analyze.',
      },
      analysis_type: {
        type: 'string',
        enum: ['damage_assessment', 'product_identification', 'prescription_analysis', 'general'],
        description: 'Type of analysis to perform (default: general).',
      },
      context: {
        type: 'string',
        description: 'Additional context from the customer about the image.',
      },
    },
    required: ['image_url'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      analysisType: { type: 'string' },
      imageUrl: { type: 'string' },
      analysis: { type: 'string' },
      suggestedActions: { type: 'array' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.analyze_image',
  handler,
};

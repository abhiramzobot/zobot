/**
 * Channel Capabilities (Phase 1E)
 *
 * Per-channel feature support mapping.
 */

import { Channel } from '../config/types';
import { RichMediaType } from './rich-media-types';

export interface ChannelCapability {
  maxButtons: number;
  maxCarouselItems: number;
  supportsImages: boolean;
  supportsCarousel: boolean;
  supportsQuickReplies: boolean;
  supportsStatusCard: boolean;
  supportsInteractiveList: boolean;
  supportsTemplateMessages: boolean;
  maxMessageLength: number;
}

const CAPABILITIES: Record<Channel, ChannelCapability> = {
  whatsapp: {
    maxButtons: 3,
    maxCarouselItems: 10,
    supportsImages: true,
    supportsCarousel: false, // WA uses list messages instead
    supportsQuickReplies: true,
    supportsStatusCard: false, // Rendered as text
    supportsInteractiveList: true,
    supportsTemplateMessages: true,
    maxMessageLength: 4096,
  },
  business_chat: {
    maxButtons: 5,
    maxCarouselItems: 10,
    supportsImages: true,
    supportsCarousel: true,
    supportsQuickReplies: true,
    supportsStatusCard: true,
    supportsInteractiveList: true,
    supportsTemplateMessages: false,
    maxMessageLength: 8000,
  },
  web: {
    maxButtons: 10,
    maxCarouselItems: 20,
    supportsImages: true,
    supportsCarousel: true,
    supportsQuickReplies: true,
    supportsStatusCard: true,
    supportsInteractiveList: true,
    supportsTemplateMessages: false,
    maxMessageLength: 10000,
  },
};

export function getChannelCapabilities(channel: Channel): ChannelCapability {
  return CAPABILITIES[channel] ?? CAPABILITIES.web;
}

export function isRichMediaSupported(channel: Channel, mediaType: RichMediaType): boolean {
  const cap = getChannelCapabilities(channel);
  switch (mediaType) {
    case 'product_carousel': return cap.supportsCarousel;
    case 'quick_replies': return cap.supportsQuickReplies;
    case 'status_card': return cap.supportsStatusCard;
    case 'interactive_list': return cap.supportsInteractiveList;
    default: return false;
  }
}

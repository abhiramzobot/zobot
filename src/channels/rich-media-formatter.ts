/**
 * Rich Media Formatter (Phase 1E)
 *
 * Channel-aware payload formatting.
 * Degrades gracefully to text when channel doesn't support rich media.
 */

import { Channel } from '../config/types';
import { getChannelCapabilities, isRichMediaSupported } from './channel-capabilities';
import { RichMediaPayload, ProductCarousel, StatusCard, InteractiveList, QuickReplies } from './rich-media-types';

export interface FormattedRichMedia {
  /** Whether the channel supports native rendering */
  nativeSupported: boolean;
  /** Formatted payload for channel adapter (JSON) */
  channelPayload?: Record<string, unknown>;
  /** Text fallback (always present) */
  textFallback: string;
}

export function formatRichMedia(channel: Channel, payload: RichMediaPayload): FormattedRichMedia {
  const supported = isRichMediaSupported(channel, payload.type);

  if (!supported) {
    return {
      nativeSupported: false,
      textFallback: renderTextFallback(payload),
    };
  }

  const cap = getChannelCapabilities(channel);

  switch (payload.type) {
    case 'product_carousel':
      return formatCarousel(channel, payload, cap.maxCarouselItems);
    case 'status_card':
      return formatStatusCard(channel, payload);
    case 'interactive_list':
      return formatInteractiveList(channel, payload);
    case 'quick_replies':
      return formatQuickReplies(channel, payload, cap.maxButtons);
    default:
      return { nativeSupported: false, textFallback: renderTextFallback(payload) };
  }
}

function formatCarousel(channel: Channel, carousel: ProductCarousel, maxItems: number): FormattedRichMedia {
  const items = carousel.items.slice(0, maxItems);
  return {
    nativeSupported: true,
    channelPayload: {
      type: 'carousel',
      items: items.map((item) => ({
        title: item.title,
        subtitle: item.subtitle,
        image_url: item.imageUrl,
        price: item.price,
        url: item.url,
        buttons: item.buttons?.map((b) => ({ label: b.label, value: b.value })),
      })),
    },
    textFallback: renderTextFallback(carousel),
  };
}

function formatStatusCard(_channel: Channel, card: StatusCard): FormattedRichMedia {
  return {
    nativeSupported: true,
    channelPayload: {
      type: 'status_card',
      title: card.title,
      status: card.status,
      statusColor: card.statusColor,
      fields: card.fields,
      actions: card.actions,
    },
    textFallback: renderTextFallback(card),
  };
}

function formatInteractiveList(_channel: Channel, list: InteractiveList): FormattedRichMedia {
  return {
    nativeSupported: true,
    channelPayload: {
      type: 'interactive_list',
      title: list.title,
      button_text: list.buttonText,
      sections: list.sections,
    },
    textFallback: renderTextFallback(list),
  };
}

function formatQuickReplies(_channel: Channel, qr: QuickReplies, maxButtons: number): FormattedRichMedia {
  const buttons = qr.buttons.slice(0, maxButtons);
  return {
    nativeSupported: true,
    channelPayload: {
      type: 'quick_replies',
      text: qr.text,
      buttons: buttons.map((b) => ({ label: b.label, value: b.value })),
    },
    textFallback: renderTextFallback(qr),
  };
}

// ───── Text Fallback Renderers ──────────────────────────────────

function renderTextFallback(payload: RichMediaPayload): string {
  switch (payload.type) {
    case 'product_carousel': {
      const lines = payload.items.map((item, i) =>
        `${i + 1}. ${item.title}${item.price ? ` — ${item.price}` : ''}${item.url ? `\n   ${item.url}` : ''}`,
      );
      return lines.join('\n');
    }
    case 'status_card': {
      const fields = payload.fields.map((f) => `• ${f.label}: ${f.value}`).join('\n');
      return `📋 ${payload.title}\nStatus: ${payload.status}\n${fields}`;
    }
    case 'interactive_list': {
      const sections = payload.sections.map((s) => {
        const items = s.items.map((item) => `  • ${item.title}${item.description ? ` — ${item.description}` : ''}`);
        return `${s.title}:\n${items.join('\n')}`;
      });
      return `${payload.title}\n${sections.join('\n')}`;
    }
    case 'quick_replies': {
      const options = payload.buttons.map((b) => b.label).join(' | ');
      return `${payload.text}\n\nOptions: ${options}`;
    }
    default:
      return '';
  }
}

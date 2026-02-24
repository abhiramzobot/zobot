/**
 * Rich Media Types (Phase 1E)
 *
 * Interactive message types for multi-channel support.
 */

export interface QuickReplyButton {
  label: string;
  value: string;
  /** Optional icon/emoji */
  icon?: string;
}

export interface ProductCarouselItem {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  price?: string;
  originalPrice?: string;
  url?: string;
  buttons?: QuickReplyButton[];
}

export interface ProductCarousel {
  type: 'product_carousel';
  items: ProductCarouselItem[];
}

export interface StatusCard {
  type: 'status_card';
  title: string;
  status: string;
  statusColor?: 'green' | 'yellow' | 'red' | 'blue';
  fields: Array<{ label: string; value: string }>;
  actions?: QuickReplyButton[];
}

export interface InteractiveList {
  type: 'interactive_list';
  title: string;
  sections: Array<{
    title: string;
    items: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
  buttonText: string;
}

export interface QuickReplies {
  type: 'quick_replies';
  text: string;
  buttons: QuickReplyButton[];
}

export type RichMediaPayload = ProductCarousel | StatusCard | InteractiveList | QuickReplies;

export type RichMediaType = RichMediaPayload['type'];

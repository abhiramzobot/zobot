export interface PromptBundle {
  version: string;
  system: string;
  developer: string;
  brandTone: string;
  /** AI governance prompt (Phase 1D) */
  governance?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

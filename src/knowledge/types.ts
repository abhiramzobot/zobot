export interface FAQEntry {
  question: string;
  answer: string;
  tags: string[];
  category: string;
}

export interface ProductEntry {
  id: string;
  name: string;
  description: string;
  features: string[];
  pricing?: string;
  category: string;
  subcategories?: ProductSubcategory[];
  brands?: string[];
  troubleshooting_ref?: string;
}

export interface ProductSubcategory {
  name: string;
  description: string;
  brands?: string[];
  troubleshooting_ref?: string;
}

export interface PolicyEntry {
  id: string;
  title: string;
  content: string;
  category: string;
}

export interface TroubleshootingIssue {
  issue: string;
  steps: string[];
}

export interface TroubleshootingEntry {
  id: string;
  product: string;
  category: string;
  applicable_models?: string[];
  warranty?: string;
  notes?: string;
  video_link?: string;
  product_link?: string;
  issues: TroubleshootingIssue[];
}

export interface EscalationEntry {
  desk: string;
  alias: string;
  handles: string[];
  tat: string;
  escalation_context_required: string[];
}

export interface KnowledgeSearchResult {
  type: 'faq' | 'product' | 'policy' | 'troubleshooting' | 'escalation';
  content: string;
  score: number;
  source: string;
}

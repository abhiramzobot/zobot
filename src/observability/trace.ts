import { v4 as uuidv4 } from 'uuid';

export interface TraceContext {
  requestId: string;
  conversationId?: string;
  channel?: string;
  tenantId?: string;
  spans: SpanRecord[];
}

export interface SpanRecord {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
}

export function createTraceContext(overrides?: Partial<TraceContext>): TraceContext {
  return {
    requestId: overrides?.requestId ?? uuidv4(),
    conversationId: overrides?.conversationId,
    channel: overrides?.channel,
    tenantId: overrides?.tenantId,
    spans: [],
  };
}

export function startSpan(ctx: TraceContext, name: string, attrs?: Record<string, string | number | boolean>): SpanRecord {
  const span: SpanRecord = {
    name,
    startTime: Date.now(),
    attributes: attrs ?? {},
    status: 'ok',
  };
  ctx.spans.push(span);
  return span;
}

export function endSpan(span: SpanRecord, status: 'ok' | 'error' = 'ok'): void {
  span.endTime = Date.now();
  span.status = status;
}

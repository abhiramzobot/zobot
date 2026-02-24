/**
 * No-Code Flow Builder Types (Enhancement v5 — D1)
 *
 * Defines the visual conversation flow structure:
 * nodes (steps) + edges (connections) = flow definition.
 */

export type FlowNodeType =
  | 'greeting'       // Welcome message
  | 'question'       // Ask customer a question
  | 'tool_call'      // Call a registered tool
  | 'condition'      // If/else branching
  | 'response'       // Send a message
  | 'escalation'     // Hand off to human
  | 'delay'          // Wait before next step
  | 'set_variable'   // Set a context variable
  | 'end';           // End flow

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  position: FlowNodePosition;
  config: FlowNodeConfig;
}

export interface FlowNodeConfig {
  // Greeting node
  greetingMessage?: string;

  // Question node
  questionText?: string;
  variableName?: string;       // Store answer in this variable
  inputType?: 'text' | 'choice' | 'number' | 'email' | 'phone';
  choices?: string[];          // For choice input type

  // Tool call node
  toolName?: string;           // Registered tool name
  toolArgs?: Record<string, string>; // Arg name → value or {{variable}}

  // Condition node
  conditionType?: 'intent' | 'sentiment' | 'variable' | 'entity';
  conditionField?: string;     // Variable or field name
  conditionOperator?: 'equals' | 'contains' | 'gt' | 'lt' | 'exists' | 'not_exists';
  conditionValue?: string;

  // Response node
  responseText?: string;       // Supports {{variable}} interpolation

  // Escalation node
  escalationReason?: string;
  department?: string;

  // Delay node
  delaySeconds?: number;

  // Set variable node
  setVariableName?: string;
  setVariableValue?: string;
}

export interface FlowEdge {
  id: string;
  source: string;       // Source node ID
  target: string;       // Target node ID
  label?: string;       // Edge label (e.g., "Yes", "No", "Default")
  condition?: string;   // For condition nodes: "true" or "false"
}

export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  triggerIntent?: string;      // Intent that triggers this flow
  triggerKeywords?: string[];  // Keywords that trigger this flow
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: FlowVariable[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface FlowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  defaultValue?: string;
  description?: string;
}

export interface FlowExecutionContext {
  flowId: string;
  currentNodeId: string;
  variables: Record<string, unknown>;
  history: string[];        // Node IDs visited
  startedAt: number;
}

export interface FlowStore {
  getFlow(id: string): Promise<FlowDefinition | null>;
  getAllFlows(): Promise<FlowDefinition[]>;
  saveFlow(flow: FlowDefinition): Promise<void>;
  deleteFlow(id: string): Promise<void>;
}

/**
 * No-Code Flow Builder UI (Enhancement v5 — D1)
 *
 * Serves a visual admin interface at /admin/flow-builder
 * for creating and managing conversation flows without code.
 */

import { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger';

export function registerFlowBuilderUI(app: FastifyInstance): void {
  app.get('/admin/flow-builder', async (req, reply) => {
    reply.type('text/html').send(FLOW_BUILDER_HTML);
  });

  logger.info('Flow Builder UI registered at /admin/flow-builder');
}

const FLOW_BUILDER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resolvr Flow Builder</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --primary: #5C6BC0;
    --primary-dark: #3949AB;
    --bg: #f5f5f5;
    --surface: #fff;
    --text: #333;
    --text-secondary: #666;
    --border: #e0e0e0;
    --success: #4CAF50;
    --warning: #FF9800;
    --danger: #f44336;
    --radius: 8px;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }

  /* ── Header ── */
  .fb-header {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: #fff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
  }
  .fb-header h1 { font-size: 20px; font-weight: 600; }
  .fb-header .subtitle { font-size: 12px; opacity: .8; margin-top: 2px; }
  .fb-header-actions { display: flex; gap: 8px; }
  .fb-btn {
    padding: 8px 16px; border: none; border-radius: var(--radius); cursor: pointer;
    font-size: 13px; font-weight: 500; transition: all .2s;
  }
  .fb-btn-primary { background: #fff; color: var(--primary); }
  .fb-btn-primary:hover { background: #e8eaf6; }
  .fb-btn-success { background: var(--success); color: #fff; }
  .fb-btn-success:hover { background: #388E3C; }
  .fb-btn-outline { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  .fb-btn-outline:hover { background: rgba(255,255,255,.15); }

  /* ── Layout ── */
  .fb-layout { display: flex; height: calc(100vh - 60px); }

  /* ── Sidebar ── */
  .fb-sidebar {
    width: 260px; background: var(--surface); border-right: 1px solid var(--border);
    padding: 16px; overflow-y: auto;
  }
  .fb-sidebar h3 { font-size: 13px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 12px; letter-spacing: .5px; }

  .fb-node-palette { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
  .fb-palette-item {
    padding: 10px 12px; background: #f8f9fa; border: 1px solid var(--border);
    border-radius: var(--radius); cursor: grab; display: flex; align-items: center; gap: 10px;
    transition: all .2s; font-size: 13px;
  }
  .fb-palette-item:hover { border-color: var(--primary); background: #e8eaf6; }
  .fb-palette-item .icon { font-size: 18px; width: 28px; text-align: center; }
  .fb-palette-item .label { font-weight: 500; }
  .fb-palette-item .desc { font-size: 11px; color: var(--text-secondary); }

  /* ── Canvas ── */
  .fb-canvas {
    flex: 1; position: relative; overflow: auto; background:
      radial-gradient(circle, #ddd 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .fb-canvas-inner { position: relative; min-width: 2000px; min-height: 1500px; }

  /* ── Flow Nodes on Canvas ── */
  .fb-flow-node {
    position: absolute; min-width: 180px; background: var(--surface);
    border: 2px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 2px 8px rgba(0,0,0,.08); cursor: move; z-index: 10;
  }
  .fb-flow-node:hover { border-color: var(--primary); box-shadow: 0 4px 16px rgba(0,0,0,.12); }
  .fb-flow-node.selected { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(92,107,192,.2); }
  .fb-flow-node-header {
    padding: 8px 12px; background: #f5f5f5; border-bottom: 1px solid var(--border);
    border-radius: var(--radius) var(--radius) 0 0; display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 600;
  }
  .fb-flow-node-header .type-badge {
    padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase;
  }
  .type-greeting .type-badge { background: #E8F5E9; color: #2E7D32; }
  .type-question .type-badge { background: #E3F2FD; color: #1565C0; }
  .type-tool_call .type-badge { background: #FFF3E0; color: #E65100; }
  .type-condition .type-badge { background: #F3E5F5; color: #6A1B9A; }
  .type-response .type-badge { background: #E0F7FA; color: #00695C; }
  .type-escalation .type-badge { background: #FFEBEE; color: #C62828; }
  .fb-flow-node-body { padding: 10px 12px; font-size: 12px; color: var(--text-secondary); }

  /* ── Properties Panel ── */
  .fb-properties {
    width: 300px; background: var(--surface); border-left: 1px solid var(--border);
    padding: 16px; overflow-y: auto; display: none;
  }
  .fb-properties.visible { display: block; }
  .fb-properties h3 { font-size: 14px; margin-bottom: 16px; color: var(--primary); }
  .fb-prop-group { margin-bottom: 16px; }
  .fb-prop-group label {
    display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: var(--text-secondary);
  }
  .fb-prop-group input, .fb-prop-group textarea, .fb-prop-group select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
    font-size: 13px; font-family: inherit;
  }
  .fb-prop-group textarea { min-height: 80px; resize: vertical; }

  /* ── Flow List ── */
  .fb-flow-list { margin-top: 16px; }
  .fb-flow-item {
    padding: 10px 12px; background: #f8f9fa; border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: 8px; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
  }
  .fb-flow-item:hover { border-color: var(--primary); }
  .fb-flow-item .name { font-weight: 500; font-size: 13px; }
  .fb-flow-item .meta { font-size: 11px; color: var(--text-secondary); }
  .fb-status-badge {
    padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;
  }
  .fb-status-active { background: #E8F5E9; color: #2E7D32; }
  .fb-status-draft { background: #FFF3E0; color: #E65100; }

  /* ── Empty State ── */
  .fb-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; color: var(--text-secondary); text-align: center;
  }
  .fb-empty .icon { font-size: 48px; margin-bottom: 16px; opacity: .5; }
  .fb-empty h3 { font-size: 16px; margin-bottom: 8px; }
  .fb-empty p { font-size: 13px; max-width: 300px; }
</style>
</head>
<body>

<div class="fb-header">
  <div>
    <h1>🔧 Resolvr Flow Builder</h1>
    <div class="subtitle">Visual Conversation Flow Designer</div>
  </div>
  <div class="fb-header-actions">
    <button class="fb-btn fb-btn-outline" onclick="loadFlows()">📂 Load Flows</button>
    <button class="fb-btn fb-btn-outline" onclick="newFlow()">➕ New Flow</button>
    <button class="fb-btn fb-btn-primary" onclick="previewFlow()">▶️ Preview</button>
    <button class="fb-btn fb-btn-success" onclick="saveFlow()">💾 Save</button>
  </div>
</div>

<div class="fb-layout">
  <!-- Sidebar: Node Palette + Flow List -->
  <div class="fb-sidebar">
    <h3>📦 Node Types</h3>
    <div class="fb-node-palette">
      <div class="fb-palette-item" draggable="true" data-type="greeting">
        <div class="icon">👋</div>
        <div><div class="label">Greeting</div><div class="desc">Welcome message</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="question">
        <div class="icon">❓</div>
        <div><div class="label">Question</div><div class="desc">Ask customer input</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="tool_call">
        <div class="icon">🔧</div>
        <div><div class="label">Tool Call</div><div class="desc">Run a registered tool</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="condition">
        <div class="icon">🔀</div>
        <div><div class="label">Condition</div><div class="desc">If/else branching</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="response">
        <div class="icon">💬</div>
        <div><div class="label">Response</div><div class="desc">Send a message</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="escalation">
        <div class="icon">🚨</div>
        <div><div class="label">Escalation</div><div class="desc">Hand off to human</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="delay">
        <div class="icon">⏳</div>
        <div><div class="label">Delay</div><div class="desc">Wait before next step</div></div>
      </div>
      <div class="fb-palette-item" draggable="true" data-type="end">
        <div class="icon">🏁</div>
        <div><div class="label">End</div><div class="desc">End conversation flow</div></div>
      </div>
    </div>

    <h3>📋 Saved Flows</h3>
    <div class="fb-flow-list" id="flowList">
      <div class="fb-flow-item" style="color: var(--text-secondary); justify-content: center;">
        Click "Load Flows" to fetch
      </div>
    </div>
  </div>

  <!-- Canvas -->
  <div class="fb-canvas" id="canvas">
    <div class="fb-canvas-inner" id="canvasInner">
      <div class="fb-empty" id="emptyState">
        <div class="icon">🎨</div>
        <h3>Design Your Flow</h3>
        <p>Drag nodes from the palette to the canvas, then connect them to create conversation flows.</p>
      </div>
    </div>
  </div>

  <!-- Properties Panel -->
  <div class="fb-properties" id="propertiesPanel">
    <h3>⚙️ Node Properties</h3>
    <div id="propertiesContent">
      <p style="color: var(--text-secondary); font-size: 13px;">Select a node to edit its properties.</p>
    </div>
  </div>
</div>

<script>
  // ── State ──
  let currentFlow = null;
  let selectedNode = null;
  let nodeCounter = 0;
  const API_KEY = prompt('Enter admin API key:') || '';

  // ── API Helpers ──
  async function api(method, path, body) {
    const opts = {
      method, headers: { 'Content-Type': 'application/json', 'x-admin-api-key': API_KEY },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    return res.json();
  }

  // ── Flow Operations ──
  async function loadFlows() {
    const data = await api('GET', '/admin/flows');
    const list = document.getElementById('flowList');
    if (!data.flows || data.flows.length === 0) {
      list.innerHTML = '<div class="fb-flow-item" style="color:var(--text-secondary);justify-content:center;">No flows found</div>';
      return;
    }
    list.innerHTML = data.flows.map(f =>
      '<div class="fb-flow-item" onclick="openFlow(\\'' + f.id + '\\')">' +
      '<div><div class="name">' + f.name + '</div><div class="meta">' + f.nodeCount + ' nodes</div></div>' +
      '<span class="fb-status-badge ' + (f.isActive ? 'fb-status-active' : 'fb-status-draft') + '">' +
      (f.isActive ? 'Active' : 'Draft') + '</span></div>'
    ).join('');
  }

  async function openFlow(id) {
    const data = await api('GET', '/admin/flows/' + id);
    if (data.flow) {
      currentFlow = data.flow;
      renderFlow();
    }
  }

  function newFlow() {
    currentFlow = {
      id: null, name: 'New Flow', description: '', version: '1.0.0',
      isActive: false, nodes: [], edges: [], variables: [], triggerKeywords: [],
    };
    renderFlow();
  }

  async function saveFlow() {
    if (!currentFlow) { alert('No flow to save'); return; }
    let data;
    if (currentFlow.id) {
      data = await api('PUT', '/admin/flows/' + currentFlow.id, currentFlow);
    } else {
      data = await api('POST', '/admin/flows', currentFlow);
      if (data.flow) currentFlow.id = data.flow.id;
    }
    alert('Flow saved!');
    loadFlows();
  }

  function previewFlow() {
    if (!currentFlow) { alert('No flow to preview'); return; }
    alert('Preview mode: Flow "' + currentFlow.name + '" has ' + currentFlow.nodes.length + ' nodes and ' + currentFlow.edges.length + ' connections.\\n\\nExecution order: ' +
      currentFlow.nodes.map(n => n.label).join(' → '));
  }

  // ── Render ──
  function renderFlow() {
    const canvas = document.getElementById('canvasInner');
    const empty = document.getElementById('emptyState');
    empty.style.display = 'none';
    // Clear existing nodes
    canvas.querySelectorAll('.fb-flow-node').forEach(n => n.remove());

    currentFlow.nodes.forEach(node => {
      const el = document.createElement('div');
      el.className = 'fb-flow-node type-' + node.type;
      el.style.left = node.position.x + 'px';
      el.style.top = node.position.y + 'px';
      el.dataset.nodeId = node.id;
      el.innerHTML =
        '<div class="fb-flow-node-header"><span class="type-badge">' + node.type.replace('_', ' ') + '</span> ' + node.label + '</div>' +
        '<div class="fb-flow-node-body">' + getNodePreview(node) + '</div>';
      el.onclick = function(e) { selectNode(node.id); e.stopPropagation(); };
      makeDraggable(el, node);
      canvas.appendChild(el);
    });
  }

  function getNodePreview(node) {
    switch (node.type) {
      case 'greeting': return node.config.greetingMessage ? node.config.greetingMessage.substring(0, 60) + '...' : 'Welcome message';
      case 'question': return node.config.questionText || 'Ask a question';
      case 'tool_call': return '🔧 ' + (node.config.toolName || 'Select tool');
      case 'condition': return '🔀 ' + (node.config.conditionField || 'Set condition');
      case 'response': return node.config.responseText ? node.config.responseText.substring(0, 60) + '...' : 'Response text';
      case 'escalation': return '🚨 ' + (node.config.department || 'Support');
      case 'delay': return '⏳ ' + (node.config.delaySeconds || 0) + 's';
      case 'end': return '🏁 End of flow';
      default: return node.type;
    }
  }

  function selectNode(nodeId) {
    selectedNode = currentFlow.nodes.find(n => n.id === nodeId);
    document.querySelectorAll('.fb-flow-node').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector('[data-node-id="' + nodeId + '"]');
    if (el) el.classList.add('selected');
    showProperties(selectedNode);
  }

  function showProperties(node) {
    const panel = document.getElementById('propertiesPanel');
    const content = document.getElementById('propertiesContent');
    panel.classList.add('visible');

    let html = '<div class="fb-prop-group"><label>Label</label><input value="' + node.label + '" onchange="updateNode(\\'label\\', this.value)"></div>';
    html += '<div class="fb-prop-group"><label>Type</label><input value="' + node.type + '" disabled></div>';

    switch (node.type) {
      case 'greeting':
        html += '<div class="fb-prop-group"><label>Greeting Message</label><textarea onchange="updateConfig(\\'greetingMessage\\', this.value)">' + (node.config.greetingMessage || '') + '</textarea></div>';
        break;
      case 'question':
        html += '<div class="fb-prop-group"><label>Question Text</label><textarea onchange="updateConfig(\\'questionText\\', this.value)">' + (node.config.questionText || '') + '</textarea></div>';
        html += '<div class="fb-prop-group"><label>Variable Name</label><input value="' + (node.config.variableName || '') + '" onchange="updateConfig(\\'variableName\\', this.value)"></div>';
        break;
      case 'tool_call':
        html += '<div class="fb-prop-group"><label>Tool Name</label><input value="' + (node.config.toolName || '') + '" onchange="updateConfig(\\'toolName\\', this.value)" placeholder="e.g., search_products"></div>';
        break;
      case 'condition':
        html += '<div class="fb-prop-group"><label>Variable</label><input value="' + (node.config.conditionField || '') + '" onchange="updateConfig(\\'conditionField\\', this.value)"></div>';
        html += '<div class="fb-prop-group"><label>Operator</label><select onchange="updateConfig(\\'conditionOperator\\', this.value)"><option>equals</option><option>contains</option><option>gt</option><option>lt</option><option>exists</option></select></div>';
        html += '<div class="fb-prop-group"><label>Value</label><input value="' + (node.config.conditionValue || '') + '" onchange="updateConfig(\\'conditionValue\\', this.value)"></div>';
        break;
      case 'response':
        html += '<div class="fb-prop-group"><label>Response Text</label><textarea onchange="updateConfig(\\'responseText\\', this.value)">' + (node.config.responseText || '') + '</textarea></div>';
        break;
      case 'escalation':
        html += '<div class="fb-prop-group"><label>Department</label><input value="' + (node.config.department || '') + '" onchange="updateConfig(\\'department\\', this.value)"></div>';
        html += '<div class="fb-prop-group"><label>Reason</label><input value="' + (node.config.escalationReason || '') + '" onchange="updateConfig(\\'escalationReason\\', this.value)"></div>';
        break;
      case 'delay':
        html += '<div class="fb-prop-group"><label>Delay (seconds)</label><input type="number" value="' + (node.config.delaySeconds || 5) + '" onchange="updateConfig(\\'delaySeconds\\', parseInt(this.value))"></div>';
        break;
    }

    html += '<div style="margin-top:20px"><button class="fb-btn" style="background:var(--danger);color:#fff;width:100%" onclick="deleteNode()">🗑️ Delete Node</button></div>';
    content.innerHTML = html;
  }

  function updateNode(field, value) { if (selectedNode) { selectedNode[field] = value; renderFlow(); } }
  function updateConfig(field, value) { if (selectedNode) { selectedNode.config[field] = value; renderFlow(); } }
  function deleteNode() {
    if (!selectedNode || !currentFlow) return;
    currentFlow.nodes = currentFlow.nodes.filter(n => n.id !== selectedNode.id);
    currentFlow.edges = currentFlow.edges.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id);
    selectedNode = null;
    document.getElementById('propertiesPanel').classList.remove('visible');
    renderFlow();
  }

  // ── Drag & Drop ──
  function makeDraggable(el, node) {
    let offsetX, offsetY;
    el.onmousedown = function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      function onMove(e) {
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        el.style.left = Math.max(0, x) + 'px';
        el.style.top = Math.max(0, y) + 'px';
        node.position.x = Math.max(0, x);
        node.position.y = Math.max(0, y);
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  // ── Palette Drag to Canvas ──
  document.querySelectorAll('.fb-palette-item').forEach(item => {
    item.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('nodeType', item.dataset.type);
    });
  });

  document.getElementById('canvas').addEventListener('dragover', function(e) { e.preventDefault(); });
  document.getElementById('canvas').addEventListener('drop', function(e) {
    e.preventDefault();
    if (!currentFlow) { newFlow(); }
    const type = e.dataTransfer.getData('nodeType');
    if (!type) return;
    const rect = document.getElementById('canvasInner').getBoundingClientRect();
    nodeCounter++;
    const node = {
      id: 'node_new_' + nodeCounter,
      type: type,
      label: type.replace('_', ' ').replace(/\\b\\w/g, c => c.toUpperCase()),
      position: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      config: {},
    };
    currentFlow.nodes.push(node);
    renderFlow();
    selectNode(node.id);
  });

  // Click canvas to deselect
  document.getElementById('canvas').addEventListener('click', function() {
    selectedNode = null;
    document.querySelectorAll('.fb-flow-node').forEach(el => el.classList.remove('selected'));
    document.getElementById('propertiesPanel').classList.remove('visible');
  });
</script>
</body>
</html>`;

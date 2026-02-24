import { FastifyInstance } from 'fastify';
import { env } from '../config/env';

/**
 * Serves an enterprise chat UI at / for testing in development mode.
 * Features: pre-chat form, session management (end/restart), history panel,
 * CSAT survey, 11 festive themes, widget mode, sound notifications,
 * transcript download, timestamps, reconnection, file upload, quick replies.
 */
export function registerChatUI(app: FastifyInstance): void {
  app.get('/', async (_req, reply) => {
    reply.header('Content-Type', 'text/html');
    return reply.send(CHAT_HTML);
  });
}

const CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Dentalkart Support Chat</title>
  <style>
    /* ══════════════════════════════════════════
       CSS VARIABLES — Theme Engine
       ══════════════════════════════════════════ */
    :root {
      --primary: #1a73e8;
      --primary-dark: #1557b0;
      --accent: #4285f4;
      --bg: #f5f5f5;
      --surface: #ffffff;
      --surface-hover: #f0f4ff;
      --text: #1a1a1a;
      --text-secondary: #666;
      --text-muted: #999;
      --border: #e0e0e0;
      --bot-bubble: #ffffff;
      --bot-bubble-text: #1a1a1a;
      --user-bubble: #1a73e8;
      --user-bubble-text: #ffffff;
      --header-gradient: linear-gradient(135deg, #1a73e8, #4285f4);
      --input-bg: #ffffff;
      --input-border: #ddd;
      --meta-bg: #f8f9fa;
      --badge-bg: #e8f0fe;
      --shadow: rgba(0,0,0,0.08);
      --shadow-strong: rgba(0,0,0,0.12);
      --festive-animation: none;
    }

    /* ── THEME: Dark ── */
    [data-theme="dark"] {
      --primary: #bb86fc; --primary-dark: #9a67ea; --accent: #03dac6;
      --bg: #121212; --surface: #1e1e1e; --surface-hover: #2a2a2a;
      --text: #e0e0e0; --text-secondary: #aaa; --text-muted: #777;
      --border: #333; --bot-bubble: #1e1e1e; --bot-bubble-text: #e0e0e0;
      --user-bubble: #bb86fc; --user-bubble-text: #000;
      --header-gradient: linear-gradient(135deg, #1e1e1e, #2d2d2d);
      --input-bg: #2a2a2a; --input-border: #444; --meta-bg: #1a1a1a;
      --badge-bg: #2d2d2d; --shadow: rgba(0,0,0,0.3); --shadow-strong: rgba(0,0,0,0.5);
    }

    /* ── THEME: Diwali ── */
    [data-theme="diwali"] {
      --primary: #ff6f00; --primary-dark: #e65100; --accent: #ffd600;
      --bg: #fff3e0; --surface: #ffffff; --surface-hover: #fff8e1;
      --user-bubble: #ff6f00; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #ff6f00, #ffa000, #ffd600);
      --badge-bg: #fff3e0;
    }

    /* ── THEME: New Year ── */
    [data-theme="newyear"] {
      --primary: #6200ea; --primary-dark: #4a00b0; --accent: #ffd700;
      --bg: #1a1a2e; --surface: #16213e; --surface-hover: #1a2744;
      --text: #e0e0e0; --text-secondary: #aaa; --text-muted: #888;
      --border: #2a3050; --bot-bubble: #16213e; --bot-bubble-text: #e0e0e0;
      --user-bubble: #6200ea; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #6200ea, #3700b3, #ffd700);
      --input-bg: #1a2744; --input-border: #2a3050; --meta-bg: #0f1525;
      --badge-bg: #1a2744; --shadow: rgba(0,0,0,0.4);
    }

    /* ── THEME: Independence Day ── */
    [data-theme="independence"] {
      --primary: #138808; --primary-dark: #0e6606; --accent: #ff9933;
      --bg: #ffffff; --surface: #ffffff;
      --user-bubble: #138808; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(180deg, #ff9933 0%, #ffffff 50%, #138808 100%);
      --badge-bg: #e8f5e9;
    }

    /* ── THEME: Republic Day ── */
    [data-theme="republic"] {
      --primary: #000080; --primary-dark: #00006b; --accent: #ff9933;
      --bg: #f0f4ff; --surface: #ffffff;
      --user-bubble: #000080; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #000080, #1a237e, #ff9933);
      --badge-bg: #e8eaf6;
    }

    /* ── THEME: Ramadan ── */
    [data-theme="ramadan"] {
      --primary: #1b5e20; --primary-dark: #145218; --accent: #c0a44d;
      --bg: #f5f0e8; --surface: #ffffff; --surface-hover: #faf5eb;
      --user-bubble: #1b5e20; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #1b5e20, #2e7d32, #c0a44d);
      --badge-bg: #e8f5e9;
    }

    /* ── THEME: Doctors Day ── */
    [data-theme="doctors"] {
      --primary: #00695c; --primary-dark: #004d40; --accent: #e0f2f1;
      --bg: #ffffff; --surface: #ffffff;
      --user-bubble: #00695c; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #00695c, #00897b, #4db6ac);
      --badge-bg: #e0f2f1;
    }

    /* ── THEME: Christmas ── */
    [data-theme="christmas"] {
      --primary: #c62828; --primary-dark: #a51c1c; --accent: #2e7d32;
      --bg: #fafafa; --surface: #ffffff;
      --user-bubble: #c62828; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #c62828, #e53935, #2e7d32);
      --badge-bg: #ffebee;
    }

    /* ── THEME: Halloween ── */
    [data-theme="halloween"] {
      --primary: #ff6f00; --primary-dark: #e65100; --accent: #4a148c;
      --bg: #1a1a1a; --surface: #2d2d2d; --surface-hover: #333;
      --text: #e0e0e0; --text-secondary: #bbb; --text-muted: #888;
      --border: #444; --bot-bubble: #2d2d2d; --bot-bubble-text: #e0e0e0;
      --user-bubble: #ff6f00; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #ff6f00, #e65100, #4a148c);
      --input-bg: #333; --input-border: #555; --meta-bg: #222;
      --badge-bg: #333; --shadow: rgba(0,0,0,0.5);
    }

    /* ── THEME: Easter ── */
    [data-theme="easter"] {
      --primary: #7b1fa2; --primary-dark: #6a1b9a; --accent: #66bb6a;
      --bg: #fce4ec; --surface: #ffffff; --surface-hover: #f8e8f0;
      --user-bubble: #7b1fa2; --user-bubble-text: #fff;
      --header-gradient: linear-gradient(135deg, #7b1fa2, #ab47bc, #66bb6a);
      --badge-bg: #f3e5f5;
    }

    /* ══════════════════════════════════════════
       BASE STYLES
       ══════════════════════════════════════════ */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-end;
      overflow: hidden;
    }

    /* ── Widget Container ── */
    #widget-bubble {
      position: fixed; bottom: 24px; right: 24px;
      width: 60px; height: 60px; border-radius: 50%;
      background: var(--header-gradient);
      color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 16px var(--shadow-strong);
      display: none; align-items: center; justify-content: center;
      font-size: 26px; z-index: 9999;
      transition: transform 0.2s;
    }
    #widget-bubble:hover { transform: scale(1.1); }
    #widget-bubble .unread-badge {
      position: absolute; top: -4px; right: -4px;
      background: #ef5350; color: #fff;
      min-width: 20px; height: 20px; border-radius: 10px;
      font-size: 11px; font-weight: 700;
      display: none; align-items: center; justify-content: center;
      padding: 0 5px;
    }

    /* ── Chat Container ── */
    #chat-container {
      width: 100%; max-width: 480px; height: 100vh;
      display: flex; flex-direction: column;
      background: var(--bg);
      box-shadow: -2px 0 16px var(--shadow);
      position: relative;
      transition: all 0.3s ease;
    }
    @media (min-width: 600px) {
      #chat-container {
        height: 96vh; max-height: 780px;
        border-radius: 16px; margin: auto;
        box-shadow: 0 8px 32px var(--shadow-strong);
      }
    }

    /* ── Header ── */
    #chat-header {
      background: var(--header-gradient);
      color: #fff; padding: 12px 16px;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 2px 8px var(--shadow);
      position: relative; z-index: 10;
      border-radius: 16px 16px 0 0;
    }
    @media (max-width: 599px) { #chat-header { border-radius: 0; } }
    .header-logo {
      width: 36px; height: 36px; background: rgba(255,255,255,0.2);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; flex-shrink: 0;
    }
    .header-info { flex: 1; min-width: 0; }
    .header-info h1 { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .header-info .status { font-size: 11px; opacity: 0.85; }
    .header-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .header-btn {
      background: rgba(255,255,255,0.15); border: none; color: #fff;
      width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; transition: background 0.2s;
      position: relative;
    }
    .header-btn:hover { background: rgba(255,255,255,0.3); }
    .header-btn[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute; bottom: -28px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: #fff; padding: 3px 8px;
      border-radius: 4px; font-size: 10px; white-space: nowrap; z-index: 100;
    }

    /* ── Theme Picker ── */
    #theme-picker {
      display: none; position: absolute; top: 100%; right: 8px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 8px; z-index: 100;
      box-shadow: 0 8px 24px var(--shadow-strong);
      width: 220px;
    }
    #theme-picker.open { display: block; }
    .theme-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .theme-option {
      width: 100%; aspect-ratio: 1; border-radius: 8px;
      border: 2px solid transparent; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-size: 18px; transition: all 0.15s; background: var(--surface);
      position: relative;
    }
    .theme-option:hover { border-color: var(--primary); transform: scale(1.05); }
    .theme-option.active { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary); }
    .theme-option .theme-label { font-size: 8px; color: var(--text-secondary); margin-top: 2px; font-weight: 600; }
    .theme-option .suggested-badge {
      position: absolute; top: -4px; right: -4px;
      background: #ffd700; color: #000; font-size: 6px; font-weight: 700;
      padding: 1px 3px; border-radius: 3px; display: none;
    }

    /* ── Pre-Chat Form ── */
    #prechat-overlay {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 24px; background: var(--bg);
    }
    .prechat-card {
      background: var(--surface); border-radius: 16px; padding: 32px 24px;
      box-shadow: 0 4px 16px var(--shadow); width: 100%; max-width: 360px;
      text-align: center;
    }
    .prechat-card h2 { font-size: 18px; color: var(--text); margin-bottom: 4px; }
    .prechat-card p { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; }
    .prechat-field {
      width: 100%; padding: 11px 16px; border: 1px solid var(--input-border);
      border-radius: 10px; font-size: 14px; margin-bottom: 10px;
      background: var(--input-bg); color: var(--text); outline: none;
      transition: border-color 0.2s;
    }
    .prechat-field:focus { border-color: var(--primary); }
    .prechat-field::placeholder { color: var(--text-muted); }
    .prechat-submit {
      width: 100%; padding: 12px; background: var(--primary); color: #fff;
      border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
      cursor: pointer; margin-top: 6px; transition: background 0.2s;
    }
    .prechat-submit:hover { background: var(--primary-dark); }
    .prechat-submit:disabled { opacity: 0.6; cursor: not-allowed; }

    /* ── Chat Area ── */
    #chat-area { flex: 1; display: none; flex-direction: column; overflow: hidden; }
    #chat-messages {
      flex: 1; overflow-y: auto; padding: 12px 16px;
      display: flex; flex-direction: column; gap: 4px;
      scroll-behavior: smooth;
    }

    /* ── Messages ── */
    .msg {
      max-width: 85%; padding: 10px 14px; border-radius: 16px;
      font-size: 14px; line-height: 1.5; word-wrap: break-word;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .msg.user {
      align-self: flex-end; background: var(--user-bubble);
      color: var(--user-bubble-text); border-bottom-right-radius: 4px;
    }
    .msg.bot {
      align-self: flex-start; background: var(--bot-bubble);
      color: var(--bot-bubble-text); border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px var(--shadow);
    }
    .msg.bot p { margin: 4px 0; }
    .msg.system {
      align-self: center; background: transparent;
      color: var(--text-muted); font-size: 12px; padding: 4px 10px;
    }
    .msg-time {
      font-size: 10px; color: var(--text-muted); padding: 0 14px;
      margin-top: -2px; margin-bottom: 4px;
    }
    .msg-time.user-time { align-self: flex-end; }
    .msg-time.bot-time { align-self: flex-start; }

    /* ── Quick Replies ── */
    .quick-replies {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 4px 14px; align-self: flex-start;
    }
    .quick-reply-btn {
      padding: 6px 14px; background: var(--badge-bg); color: var(--primary);
      border: 1px solid var(--primary); border-radius: 20px;
      font-size: 12px; font-weight: 500; cursor: pointer;
      transition: all 0.15s;
    }
    .quick-reply-btn:hover { background: var(--primary); color: #fff; }

    /* ── Typing ── */
    .typing {
      align-self: flex-start; padding: 12px 18px;
      background: var(--bot-bubble); border-radius: 16px;
      box-shadow: 0 1px 3px var(--shadow);
    }
    .typing span {
      display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; background: var(--text-muted);
      margin: 0 2px; animation: bounce 1.2s infinite;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    /* ── Input Bar ── */
    #input-bar {
      padding: 10px 12px; background: var(--surface);
      border-top: 1px solid var(--border);
      display: flex; gap: 8px; align-items: center;
    }
    #input-bar .attach-btn {
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--badge-bg); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: var(--primary); flex-shrink: 0;
      transition: background 0.2s;
    }
    #input-bar .attach-btn:hover { background: var(--primary); color: #fff; }
    #input-bar input {
      flex: 1; padding: 10px 16px; border: 1px solid var(--input-border);
      border-radius: 24px; font-size: 14px; outline: none;
      background: var(--input-bg); color: var(--text);
      transition: border-color 0.2s;
    }
    #input-bar input:focus { border-color: var(--primary); }
    #input-bar input::placeholder { color: var(--text-muted); }
    #input-bar .send-btn {
      width: 40px; height: 40px; border-radius: 50%;
      background: var(--primary); color: #fff; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0; transition: background 0.2s;
    }
    #input-bar .send-btn:hover { background: var(--primary-dark); }
    #input-bar .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── CSAT Overlay ── */
    #csat-overlay {
      display: none; position: absolute; inset: 0; z-index: 50;
      background: rgba(0,0,0,0.5); align-items: center; justify-content: center;
    }
    .csat-card {
      background: var(--surface); border-radius: 16px; padding: 28px 24px;
      width: 90%; max-width: 340px; text-align: center;
      box-shadow: 0 8px 32px var(--shadow-strong);
    }
    .csat-card h3 { font-size: 16px; color: var(--text); margin-bottom: 4px; }
    .csat-card p { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
    .csat-stars { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
    .csat-star {
      font-size: 32px; cursor: pointer; color: var(--border);
      transition: color 0.15s, transform 0.15s;
    }
    .csat-star:hover, .csat-star.active { color: #ffc107; transform: scale(1.15); }
    .csat-textarea {
      width: 100%; padding: 10px; border: 1px solid var(--input-border);
      border-radius: 10px; font-size: 13px; resize: vertical;
      min-height: 60px; margin-bottom: 12px;
      background: var(--input-bg); color: var(--text);
    }
    .csat-actions { display: flex; gap: 8px; }
    .csat-actions button {
      flex: 1; padding: 10px; border-radius: 10px; font-size: 14px;
      font-weight: 600; cursor: pointer; border: none; transition: background 0.2s;
    }
    .csat-submit { background: var(--primary); color: #fff; }
    .csat-submit:hover { background: var(--primary-dark); }
    .csat-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .csat-skip { background: var(--badge-bg); color: var(--text); }
    .csat-skip:hover { background: var(--border); }

    /* ── History Panel ── */
    #history-panel {
      display: none; position: absolute; inset: 0; z-index: 40;
      background: var(--bg); flex-direction: column;
    }
    .history-header {
      padding: 14px 16px; background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .history-header h2 { flex: 1; font-size: 16px; color: var(--text); }
    .history-back {
      background: var(--badge-bg); border: none; width: 32px; height: 32px;
      border-radius: 50%; cursor: pointer; font-size: 16px; color: var(--text);
      display: flex; align-items: center; justify-content: center;
    }
    .history-list { flex: 1; overflow-y: auto; padding: 8px; }
    .history-item {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px; margin-bottom: 8px;
      cursor: pointer; transition: all 0.15s;
    }
    .history-item:hover { border-color: var(--primary); box-shadow: 0 2px 8px var(--shadow); }
    .history-item .hi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .history-item .hi-subject { font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
    .history-item .hi-date { font-size: 11px; color: var(--text-muted); }
    .history-item .hi-bottom { display: flex; gap: 8px; align-items: center; }
    .hi-state-badge {
      font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
    }
    .hi-state-badge.resolved { background: #d4edda; color: #155724; }
    .hi-state-badge.escalated { background: #fff3cd; color: #856404; }
    .hi-state-badge.active { background: #cce5ff; color: #004085; }
    .hi-turns { font-size: 11px; color: var(--text-muted); }
    .hi-csat { font-size: 11px; color: #ffc107; }
    .history-empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }

    /* ── Transcript View ── */
    #transcript-view {
      display: none; position: absolute; inset: 0; z-index: 45;
      background: var(--bg); flex-direction: column;
    }
    .transcript-header {
      padding: 14px 16px; background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .transcript-header h2 { flex: 1; font-size: 16px; color: var(--text); }
    .transcript-messages { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }

    /* ── Order/Product/Shipment Tables (keep from original) ── */
    .order-table-wrapper, .product-grid, .product-grid-header, .shipment-wrapper { align-self: flex-start; max-width: 98%; animation: fadeIn 0.3s ease; margin: 4px 0; }
    .order-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .order-table-header { font-size: 13px; font-weight: 600; color: var(--text); padding: 8px 12px; background: var(--badge-bg); border-radius: 12px 12px 0 0; border: 1px solid var(--border); border-bottom: none; }
    .order-table { width: 100%; border-collapse: collapse; font-size: 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 0 0 12px 12px; overflow: hidden; box-shadow: 0 1px 4px var(--shadow); table-layout: fixed; }
    .order-table th { background: var(--badge-bg); padding: 6px 6px; text-align: left; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid var(--border); white-space: nowrap; font-size: 10px; }
    .order-table td { padding: 6px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text); }
    .order-table tr:last-child td { border-bottom: none; }
    .order-table tbody tr { cursor: pointer; transition: background 0.15s; }
    .order-table tbody tr:hover td { background: var(--surface-hover); }
    .order-table .items-cell { text-align: center; }
    .item-count-badge { display: inline-block; padding: 2px 6px; border-radius: 10px; background: #e8eaf6; color: #283593; font-weight: 600; font-size: 10px; white-space: nowrap; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .status-delivered { background: #d4edda; color: #155724; }
    .status-shipped { background: #cce5ff; color: #004085; }
    .status-packed { background: #fff3cd; color: #856404; }
    .status-cancelled { background: #f8d7da; color: #721c24; }
    .status-returned { background: #f5c6cb; color: #721c24; }
    .status-rto { background: #f5c6cb; color: #721c24; }
    .status-processing { background: #e2e3e5; color: #383d41; }
    .status-default { background: #e2e3e5; color: #383d41; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .product-grid-header { font-size: 13px; font-weight: 600; color: var(--text); padding: 8px 12px; background: #e8f5e9; border-radius: 12px; border: 1px solid #c8e6c9; margin: 4px 0 0 0; }
    .product-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px var(--shadow); transition: box-shadow 0.2s, transform 0.2s; display: flex; flex-direction: column; }
    .product-card:hover { box-shadow: 0 4px 12px var(--shadow-strong); transform: translateY(-2px); }
    .product-card-img { width: 100%; height: 120px; object-fit: contain; background: var(--bg); padding: 8px; }
    .product-card-body { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; }
    .product-card-name { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.3; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .product-card-price { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
    .product-card-price .selling { font-size: 14px; font-weight: 700; color: var(--primary); }
    .product-card-price .original { font-size: 11px; color: var(--text-muted); text-decoration: line-through; }
    .product-card-price .discount-label { font-size: 10px; font-weight: 600; color: #2e7d32; background: #e8f5e9; padding: 1px 6px; border-radius: 4px; }
    .product-card-stock { font-size: 11px; margin-bottom: 4px; }
    .product-card-stock.in-stock { color: #2e7d32; }
    .product-card-stock.out-of-stock { color: #c62828; }
    .product-card-link { display: inline-block; margin-top: auto; padding: 6px 12px; background: var(--primary); color: #fff; text-decoration: none; border-radius: 6px; font-size: 11px; font-weight: 600; text-align: center; transition: background 0.2s; }
    .product-card-link:hover { background: var(--primary-dark); }
    .product-card-img-placeholder { width: 100%; height: 120px; background: linear-gradient(135deg, var(--bg), var(--border)); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 36px; }
    .shipment-header { font-size: 13px; font-weight: 600; color: var(--text); padding: 8px 12px; background: #e3f2fd; border-radius: 12px 12px 0 0; border: 1px solid #bbdefb; border-bottom: none; }
    .shipment-card { background: var(--surface); border: 1px solid #bbdefb; border-radius: 0 0 12px 12px; padding: 12px; box-shadow: 0 1px 4px var(--shadow); }
    .shipment-info-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 10px; font-size: 12px; }
    .shipment-info-item { display: flex; flex-direction: column; }
    .shipment-info-item .si-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .shipment-info-item .si-value { font-size: 13px; font-weight: 600; color: var(--text); }
    .shipment-items-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .shipment-items-table th { background: var(--badge-bg); padding: 6px 8px; text-align: left; font-weight: 600; color: var(--text-secondary); border-bottom: 1px solid var(--border); font-size: 11px; }
    .shipment-items-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text); }
    .shipment-items-table tr:last-child td { border-bottom: none; }
    .shipment-track-btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 8px 18px; background: var(--primary); color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: background 0.2s; }
    .shipment-track-btn:hover { background: var(--primary-dark); }
    .show-more-btn { display: block; width: 100%; padding: 10px; margin-top: -1px; background: var(--meta-bg); border: 1px solid var(--border); border-radius: 0 0 12px 12px; color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .show-more-btn:hover { background: var(--surface-hover); }
    .meta { font-size: 11px; margin-top: 4px; padding: 6px 10px; background: var(--meta-bg); border-radius: 8px; color: var(--text-secondary); border-left: 3px solid var(--primary); align-self: flex-start; max-width: 95%; }
    .meta .label { font-weight: 600; color: var(--text); }

    /* ── File upload preview ── */
    #upload-preview { display: none; padding: 8px 12px; background: var(--surface); border-top: 1px solid var(--border); }
    .upload-thumb { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); }
    .upload-file-info { display: flex; align-items: center; gap: 8px; }
    .upload-remove { background: #ef5350; color: #fff; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
    .msg-attachment { margin-top: 6px; }
    .msg-attachment img { max-width: 200px; border-radius: 8px; cursor: pointer; }
    .msg-attachment video { max-width: 200px; border-radius: 8px; }

    /* ── Drag & Drop overlay ── */
    #drop-overlay {
      display: none; position: absolute; inset: 0; z-index: 60;
      background: rgba(26,115,232,0.15); border: 3px dashed var(--primary);
      border-radius: 16px; align-items: center; justify-content: center;
    }
    #drop-overlay .drop-text { font-size: 18px; font-weight: 600; color: var(--primary); }

    /* ══════════════════════════════════════════
       EXPANDED CHAT WINDOW MODE
       ══════════════════════════════════════════ */
    #chat-container.expanded {
      max-width: 100vw !important; width: 100vw !important;
      height: 100vh !important; max-height: 100vh !important;
      border-radius: 0 !important; margin: 0 !important;
      position: fixed; inset: 0; z-index: 10000;
    }
    @media (min-width: 600px) {
      #chat-container.expanded {
        border-radius: 0 !important;
        box-shadow: none !important;
      }
    }
    #chat-container.expanded #chat-header { border-radius: 0; }
    #chat-container.expanded #chat-messages { padding: 16px 24px; }
    #chat-container.expanded .product-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
    #chat-container.expanded .msg { max-width: 70%; }
    #chat-container.expanded .order-table-wrapper,
    #chat-container.expanded .shipment-wrapper { max-width: 90%; }
    #chat-container.expanded .order-table { table-layout: auto; }

    /* ── Add to Cart Button on Product Cards ── */
    .product-card-actions { display: flex; gap: 6px; margin-top: 8px; }
    .product-card-cart-btn {
      flex: 1; padding: 7px 10px;
      background: #2e7d32; color: #fff;
      border: none; border-radius: 6px;
      font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 4px;
    }
    .product-card-cart-btn:hover { background: #1b5e20; transform: scale(1.02); }
    .product-card-cart-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .product-card-cart-btn.added { background: #4caf50; }
    .product-card-cart-btn.out-of-stock-btn { background: #9e9e9e; cursor: not-allowed; }

    /* ── AR Demo Button on Product Cards ── */
    .product-card-ar-btn {
      flex: 1; padding: 7px 10px;
      background: linear-gradient(135deg, #6200ea, #9c27b0);
      color: #fff; border: none; border-radius: 6px;
      font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 4px;
    }
    .product-card-ar-btn:hover { background: linear-gradient(135deg, #4a00b0, #7b1fa2); transform: scale(1.02); }

    /* ── AR Session Card ── */
    .ar-session-card {
      background: linear-gradient(135deg, #ede7f6, #e8eaf6);
      border: 1px solid #b39ddb; border-radius: 12px;
      padding: 16px; margin: 8px 0;
      animation: arPulse 2s ease-in-out infinite alternate;
    }
    @keyframes arPulse { from { box-shadow: 0 0 0 0 rgba(98,0,234,0.15); } to { box-shadow: 0 0 12px 4px rgba(98,0,234,0.1); } }
    .ar-session-card h4 { margin: 0 0 10px 0; font-size: 14px; color: #4a148c; display: flex; align-items: center; gap: 6px; }
    .ar-session-card .ar-type-badge {
      font-size: 10px; padding: 2px 8px;
      background: #7c4dff; color: #fff;
      border-radius: 10px; font-weight: 600;
    }
    .ar-session-card .ar-instructions {
      font-size: 12px; color: #555; margin: 8px 0;
      padding: 10px; background: rgba(255,255,255,0.7);
      border-radius: 8px; line-height: 1.5;
    }
    .ar-session-card .ar-join-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 20px; background: linear-gradient(135deg, #6200ea, #9c27b0);
      color: #fff; border: none; border-radius: 8px;
      font-size: 13px; font-weight: 700; cursor: pointer;
      text-decoration: none; transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(98,0,234,0.3);
    }
    .ar-session-card .ar-join-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(98,0,234,0.4);
    }
    .ar-session-card .ar-steps {
      display: flex; gap: 12px; margin: 10px 0;
      font-size: 11px; color: #666;
    }
    .ar-session-card .ar-step {
      display: flex; align-items: center; gap: 4px;
    }
    .ar-session-card .ar-step-num {
      width: 20px; height: 20px;
      background: #7c4dff; color: #fff;
      border-radius: 50%; display: flex;
      align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700;
    }

    /* ── Cart Badge in Header ── */
    .cart-badge {
      position: absolute; top: -2px; right: -2px;
      background: #ef5350; color: #fff;
      min-width: 16px; height: 16px; border-radius: 8px;
      font-size: 9px; font-weight: 700;
      display: none; align-items: center; justify-content: center;
      padding: 0 3px; line-height: 1;
    }
    .cart-badge.visible { display: flex; }

    /* ── Cart Panel ── */
    #cart-panel {
      display: none; position: absolute; inset: 0; z-index: 42;
      background: var(--bg); flex-direction: column;
    }
    .cart-header {
      padding: 14px 16px; background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .cart-header h2 { flex: 1; font-size: 16px; color: var(--text); }
    .cart-list { flex: 1; overflow-y: auto; padding: 8px 12px; }
    .cart-item {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 10px; margin-bottom: 8px;
      transition: all 0.15s;
    }
    .cart-item:hover { border-color: var(--primary); }
    .cart-item-img { width: 48px; height: 48px; border-radius: 8px; object-fit: contain; background: var(--bg); flex-shrink: 0; }
    .cart-item-img-placeholder { width: 48px; height: 48px; border-radius: 8px; background: var(--bg); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 20px; flex-shrink: 0; }
    .cart-item-info { flex: 1; min-width: 0; }
    .cart-item-name { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cart-item-price { font-size: 13px; font-weight: 700; color: var(--primary); }
    .cart-item-qty { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
    .cart-qty-btn {
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--badge-bg); border: 1px solid var(--border);
      color: var(--text); font-size: 14px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .cart-qty-btn:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
    .cart-qty-num { font-size: 13px; font-weight: 600; color: var(--text); min-width: 16px; text-align: center; }
    .cart-item-remove {
      background: none; border: none; color: #ef5350;
      font-size: 16px; cursor: pointer; padding: 4px;
      border-radius: 50%; transition: background 0.15s;
    }
    .cart-item-remove:hover { background: rgba(239,83,80,0.1); }
    .cart-footer {
      padding: 12px 16px; background: var(--surface);
      border-top: 1px solid var(--border);
    }
    .cart-summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: var(--text-secondary); }
    .cart-summary-row.total { font-size: 15px; font-weight: 700; color: var(--text); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
    .cart-summary-row .savings { color: #2e7d32; font-weight: 600; }
    .cart-checkout-btn {
      width: 100%; padding: 12px; margin-top: 10px;
      background: #2e7d32; color: #fff; border: none;
      border-radius: 10px; font-size: 15px; font-weight: 600;
      cursor: pointer; transition: background 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .cart-checkout-btn:hover { background: #1b5e20; }
    .cart-clear-btn {
      width: 100%; padding: 8px; margin-top: 6px;
      background: transparent; color: #ef5350; border: 1px solid #ef5350;
      border-radius: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    .cart-clear-btn:hover { background: #ef5350; color: #fff; }
    .cart-empty { text-align: center; padding: 40px 20px; color: var(--text-muted); }
    .cart-empty-icon { font-size: 48px; margin-bottom: 12px; }
    .cart-empty-text { font-size: 14px; }

    /* ── Cart Table (rendered in chat) ── */
    .cart-table-wrapper { align-self: flex-start; max-width: 95%; animation: fadeIn 0.3s ease; margin: 4px 0; }
    .cart-table-header { font-size: 13px; font-weight: 600; color: var(--text); padding: 8px 12px; background: #e8f5e9; border-radius: 12px 12px 0 0; border: 1px solid #c8e6c9; border-bottom: none; }
    .cart-table { width: 100%; border-collapse: collapse; font-size: 12px; background: var(--surface); border: 1px solid #c8e6c9; border-radius: 0 0 12px 12px; overflow: hidden; box-shadow: 0 1px 4px var(--shadow); }
    .cart-table th { background: #e8f5e9; padding: 8px 10px; text-align: left; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid #c8e6c9; white-space: nowrap; }
    .cart-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text); }
    .cart-table tr:last-child td { border-bottom: none; }
    .cart-table .cart-total-row { background: #f1f8e9; font-weight: 700; }

    /* ── Dynamic Shipment Action Buttons ── */
    .shipment-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .shipment-actions .shipment-track-btn { font-size: 12px; padding: 8px 16px; }
    .shipment-actions .shipment-track-btn:active { transform: scale(0.97); }

    /* ── Order Row Action Buttons ── */
    .order-action-btns { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .order-action-btn {
      padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 600;
      border: none; cursor: pointer; transition: all 0.15s;
      display: inline-flex; align-items: center; gap: 3px;
    }
    .order-action-btn:hover { transform: scale(1.04); filter: brightness(0.9); }
    .order-action-btn.track { background: #e3f2fd; color: #1565c0; }
    .order-action-btn.cancel { background: #ffebee; color: #c62828; }
    .order-action-btn.return { background: #fff3e0; color: #e65100; }
    .order-action-btn.invoice { background: #e8f5e9; color: #2e7d32; }
    .order-action-btn.reorder { background: #f3e5f5; color: #7b1fa2; }
    .order-action-btn.details { background: #e8eaf6; color: #283593; }

    /* ── Enhancement v5: Coupon Input in Cart ── */
    .cart-coupon-row {
      display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border);
    }
    .cart-coupon-input {
      flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px;
      font-size: 12px; text-transform: uppercase;
    }
    .cart-coupon-btn {
      padding: 6px 12px; background: var(--accent); color: #fff; border: none;
      border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600;
    }
    .cart-coupon-btn:hover { background: #5C6BC0; }
    .cart-coupon-applied {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 12px; background: #e8f5e9; border-radius: 6px; margin: 4px 12px;
      font-size: 11px; color: #2e7d32;
    }
    .cart-coupon-remove { cursor: pointer; color: #c62828; font-weight: 600; }

    /* ── Enhancement v5: Recommendation Carousel ── */
    .reco-carousel {
      background: linear-gradient(135deg, #f3e5f5, #e8eaf6); border-radius: 12px;
      padding: 14px; margin: 8px 0;
    }
    .reco-carousel h4 { font-size: 13px; color: #4a148c; margin-bottom: 10px; }
    .reco-grid { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
    .reco-card {
      min-width: 150px; background: #fff; border-radius: 10px; padding: 10px;
      box-shadow: 0 2px 6px rgba(0,0,0,.08); flex-shrink: 0;
    }
    .reco-card .name { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
    .reco-card .price { font-size: 13px; color: var(--accent); font-weight: 700; }
    .reco-card .reason { font-size: 10px; color: #666; margin-top: 4px; }
    .reco-card .reco-add-btn {
      margin-top: 8px; width: 100%; padding: 5px; background: var(--accent); color: #fff;
      border: none; border-radius: 6px; font-size: 11px; cursor: pointer;
    }
    .reco-card .reco-add-btn:hover { background: #5C6BC0; }

    /* ── Enhancement v5: Review Star Widget ── */
    .review-widget {
      background: linear-gradient(135deg, #fff8e1, #fff3e0); border-radius: 12px;
      padding: 14px; margin: 8px 0; text-align: center;
    }
    .review-widget h4 { font-size: 13px; color: #e65100; margin-bottom: 8px; }
    .review-stars { display: flex; justify-content: center; gap: 6px; margin: 8px 0; }
    .review-star {
      font-size: 28px; cursor: pointer; transition: transform .2s; filter: grayscale(1); opacity: .4;
    }
    .review-star.active { filter: grayscale(0); opacity: 1; }
    .review-star:hover { transform: scale(1.2); }

    /* ── Enhancement v5: Refund Confirmation Card ── */
    .refund-card {
      background: linear-gradient(135deg, #fce4ec, #fff3e0); border-radius: 12px;
      padding: 14px; margin: 8px 0; border: 1px solid #ef9a9a;
    }
    .refund-card h4 { font-size: 14px; color: #c62828; margin-bottom: 8px; }
    .refund-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
    .refund-row .label { color: #666; }
    .refund-row .value { font-weight: 600; }
    .refund-amount { font-size: 18px; color: #2e7d32; font-weight: 700; text-align: center; margin: 10px 0; }

    /* ── Enhancement v5: Bulk Pricing Table ── */
    .bulk-pricing-card {
      background: linear-gradient(135deg, #e3f2fd, #e8eaf6); border-radius: 12px;
      padding: 14px; margin: 8px 0;
    }
    .bulk-pricing-card h4 { font-size: 13px; color: #1565c0; margin-bottom: 10px; }
    .bulk-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .bulk-table th {
      background: rgba(21,101,192,.1); padding: 6px 8px; text-align: left;
      font-weight: 600; color: #1565c0; border-bottom: 1px solid #bbdefb;
    }
    .bulk-table td { padding: 5px 8px; border-bottom: 1px solid #e3f2fd; }
    .bulk-table tr:hover td { background: rgba(21,101,192,.04); }
    .bulk-highlight { background: #e8f5e9 !important; font-weight: 600; }
  </style>
</head>
<body>

<!-- Widget Bubble -->
<button id="widget-bubble" onclick="toggleWidget()">
  <span>💬</span>
  <div class="unread-badge" id="unread-badge">0</div>
</button>

<!-- Chat Container -->
<div id="chat-container">
  <!-- Header -->
  <div id="chat-header">
    <div class="header-logo">DK</div>
    <div class="header-info">
      <h1>Dentalkart Support</h1>
      <div class="status" id="header-status">AI Assistant</div>
    </div>
    <div class="header-actions">
      <button class="header-btn" id="btn-theme" data-tooltip="Themes" onclick="toggleThemePicker()">🎨</button>
      <button class="header-btn" id="btn-history" data-tooltip="History" onclick="toggleHistory()">📋</button>
      <button class="header-btn" id="btn-sound" data-tooltip="Sound" onclick="toggleSound()">🔔</button>
      <button class="header-btn" id="btn-cart" data-tooltip="Cart" onclick="toggleCartPanel()" style="display:none">🛒<span class="cart-badge" id="cart-badge">0</span></button>
      <button class="header-btn" id="btn-expand" data-tooltip="Expand" onclick="toggleExpand()">⛶</button>
      <button class="header-btn" id="btn-end" data-tooltip="End Chat" onclick="endChat()" style="display:none">⏹️</button>
      <button class="header-btn" id="btn-new" data-tooltip="New Chat" onclick="startNewChat()" style="display:none">➕</button>
      <button class="header-btn" id="btn-download" data-tooltip="Download" onclick="downloadTranscript()" style="display:none">💾</button>
      <button class="header-btn" id="btn-minimize" data-tooltip="Minimize" onclick="toggleWidget()">➖</button>
    </div>
    <!-- Theme Picker -->
    <div id="theme-picker">
      <div class="theme-grid" id="theme-grid"></div>
    </div>
  </div>

  <!-- Pre-Chat Form -->
  <div id="prechat-overlay">
    <div class="prechat-card">
      <h2>Welcome to Dentalkart! 👋</h2>
      <p>Please share your details to start chatting</p>
      <input class="prechat-field" id="pc-name" type="text" placeholder="Your Name *" required />
      <input class="prechat-field" id="pc-email" type="email" placeholder="Email Address *" required />
      <input class="prechat-field" id="pc-phone" type="tel" placeholder="Phone Number (optional)" />
      <button class="prechat-submit" id="pc-submit" onclick="submitPreChat()">Start Chat</button>
    </div>
  </div>

  <!-- Chat Area -->
  <div id="chat-area">
    <div id="chat-messages"></div>
    <div id="upload-preview"></div>
    <div id="input-bar">
      <button class="attach-btn" onclick="document.getElementById('file-input').click()" title="Attach file">📎</button>
      <input type="file" id="file-input" multiple accept="image/*,video/*,.pdf" style="display:none" onchange="handleFileSelect(event)" />
      <input id="msg-input" type="text" placeholder="Type a message..." autocomplete="off" />
      <button class="send-btn" id="send-btn" onclick="sendMessage()">➤</button>
    </div>
  </div>

  <!-- CSAT Overlay -->
  <div id="csat-overlay">
    <div class="csat-card">
      <h3>Rate Your Experience</h3>
      <p>How was your chat with us today?</p>
      <div class="csat-stars" id="csat-stars"></div>
      <textarea class="csat-textarea" id="csat-feedback" placeholder="Any additional feedback? (optional)"></textarea>
      <div class="csat-actions">
        <button class="csat-skip" onclick="skipCSAT()">Skip</button>
        <button class="csat-submit" id="csat-submit-btn" onclick="submitCSAT()" disabled>Submit</button>
      </div>
    </div>
  </div>

  <!-- History Panel -->
  <div id="history-panel">
    <div class="history-header">
      <button class="history-back" onclick="closeHistory()">←</button>
      <h2>Chat History</h2>
    </div>
    <div class="history-list" id="history-list"></div>
  </div>

  <!-- Transcript View -->
  <div id="transcript-view">
    <div class="transcript-header">
      <button class="history-back" onclick="closeTranscript()">←</button>
      <h2 id="transcript-title">Transcript</h2>
    </div>
    <div class="transcript-messages" id="transcript-messages"></div>
  </div>

  <!-- Cart Panel -->
  <div id="cart-panel">
    <div class="cart-header">
      <button class="history-back" onclick="closeCartPanel()">←</button>
      <h2>🛒 Shopping Cart</h2>
    </div>
    <div class="cart-list" id="cart-list"></div>
    <div class="cart-footer" id="cart-footer" style="display:none">
      <div class="cart-summary-row"><span>Items</span><span id="cart-item-count">0</span></div>
      <div class="cart-summary-row"><span>Savings</span><span class="savings" id="cart-savings">₹0</span></div>
      <div id="cart-coupon-savings" style="display:none" class="cart-summary-row"><span>Coupon Discount</span><span class="savings" id="cart-coupon-amt">-₹0</span></div>
      <div class="cart-summary-row total"><span>Subtotal</span><span id="cart-subtotal">₹0</span></div>
      <div id="cart-applied-coupons"></div>
      <div class="cart-coupon-row">
        <input class="cart-coupon-input" id="cart-coupon-code" placeholder="Coupon code" maxlength="20">
        <button class="cart-coupon-btn" onclick="applyCouponFromCart()">Apply</button>
      </div>
      <a class="cart-checkout-btn" href="https://www.dentalkart.com/checkout" target="_blank" rel="noopener">🛍️ Proceed to Checkout</a>
      <button class="cart-clear-btn" onclick="clearCartUI()">Clear Cart</button>
    </div>
  </div>

  <!-- Drop overlay -->
  <div id="drop-overlay"><div class="drop-text">Drop files here to upload</div></div>
</div>

<script>
// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let visitorId = localStorage.getItem('zobot_visitor_id') || '';
let visitorName = localStorage.getItem('zobot_visitor_name') || '';
let visitorEmail = localStorage.getItem('zobot_visitor_email') || '';
let convId = localStorage.getItem('zobot_active_conv') || '';
let chatActive = false;
let chatEnded = false;
let soundEnabled = localStorage.getItem('zobot_sound') !== 'false';
let isMinimized = false;
let unreadCount = 0;
let csatRating = 0;
let pendingFiles = [];
let currentTheme = localStorage.getItem('zobot_theme') || 'light';

const chatMessages = document.getElementById('chat-messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

// ══════════════════════════════════════════
// THEMES
// ══════════════════════════════════════════
const THEMES = [
  { id: 'light', icon: '☀️', label: 'Light' },
  { id: 'dark', icon: '🌙', label: 'Dark' },
  { id: 'diwali', icon: '🪔', label: 'Diwali', suggestStart: '10-15', suggestEnd: '11-15' },
  { id: 'newyear', icon: '🎉', label: 'New Year', suggestStart: '12-25', suggestEnd: '01-07' },
  { id: 'independence', icon: '🇮🇳', label: 'India Day', suggestStart: '08-10', suggestEnd: '08-20' },
  { id: 'republic', icon: '🏛️', label: 'Republic', suggestStart: '01-20', suggestEnd: '01-31' },
  { id: 'ramadan', icon: '🌙', label: 'Ramadan' },
  { id: 'doctors', icon: '🩺', label: 'Doctors', suggestStart: '07-01', suggestEnd: '07-03' },
  { id: 'christmas', icon: '🎄', label: 'Christmas', suggestStart: '12-20', suggestEnd: '12-26' },
  { id: 'halloween', icon: '🎃', label: 'Halloween', suggestStart: '10-25', suggestEnd: '11-01' },
  { id: 'easter', icon: '🐣', label: 'Easter' },
];

function initThemes() {
  const grid = document.getElementById('theme-grid');
  const now = new Date();
  const mmdd = String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  THEMES.forEach(t => {
    const opt = document.createElement('div');
    opt.className = 'theme-option' + (currentTheme === t.id ? ' active' : '');
    opt.setAttribute('data-theme-id', t.id);
    opt.onclick = () => setTheme(t.id);

    let suggested = false;
    if (t.suggestStart && t.suggestEnd) {
      if (t.suggestStart <= t.suggestEnd) {
        suggested = mmdd >= t.suggestStart && mmdd <= t.suggestEnd;
      } else {
        suggested = mmdd >= t.suggestStart || mmdd <= t.suggestEnd;
      }
    }

    opt.innerHTML = '<span style="font-size:22px">' + t.icon + '</span>' +
      '<span class="theme-label">' + t.label + '</span>' +
      (suggested ? '<span class="suggested-badge" style="display:block">NOW</span>' : '');
    grid.appendChild(opt);
  });

  setTheme(currentTheme);
}

function setTheme(id) {
  currentTheme = id;
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('zobot_theme', id);
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-theme-id') === id);
  });
}

function toggleThemePicker() {
  document.getElementById('theme-picker').classList.toggle('open');
}

// Close theme picker on outside click
document.addEventListener('click', (e) => {
  const picker = document.getElementById('theme-picker');
  const btn = document.getElementById('btn-theme');
  if (picker.classList.contains('open') && !picker.contains(e.target) && e.target !== btn) {
    picker.classList.remove('open');
  }
});

// ══════════════════════════════════════════
// SOUND
// ══════════════════════════════════════════
function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('zobot_sound', soundEnabled);
  document.getElementById('btn-sound').textContent = soundEnabled ? '🔔' : '🔕';
}

function playNotificationSound() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 800; osc.type = 'sine';
    gain.gain.value = 0.1;
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

// ══════════════════════════════════════════
// WIDGET MODE
// ══════════════════════════════════════════
function toggleWidget() {
  isMinimized = !isMinimized;
  document.getElementById('chat-container').style.display = isMinimized ? 'none' : 'flex';
  document.getElementById('widget-bubble').style.display = isMinimized ? 'flex' : 'none';
  if (!isMinimized) { unreadCount = 0; updateUnreadBadge(); }
}

function updateUnreadBadge() {
  const badge = document.getElementById('unread-badge');
  if (unreadCount > 0) {
    badge.style.display = 'flex';
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
  } else {
    badge.style.display = 'none';
  }
}

// ══════════════════════════════════════════
// PRE-CHAT FORM
// ══════════════════════════════════════════
function submitPreChat() {
  const name = document.getElementById('pc-name').value.trim();
  const email = document.getElementById('pc-email').value.trim();
  const phone = document.getElementById('pc-phone').value.trim();
  if (!name || !email) return alert('Name and email are required');

  visitorId = 'v-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  visitorName = name; visitorEmail = email;
  localStorage.setItem('zobot_visitor_id', visitorId);
  localStorage.setItem('zobot_visitor_name', visitorName);
  localStorage.setItem('zobot_visitor_email', visitorEmail);

  startChatSession();
}

function startChatSession() {
  convId = 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2,6);
  localStorage.setItem('zobot_active_conv', convId);
  chatActive = true; chatEnded = false;

  document.getElementById('prechat-overlay').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';
  document.getElementById('btn-end').style.display = 'flex';
  document.getElementById('btn-cart').style.display = 'flex';
  document.getElementById('btn-new').style.display = 'none';
  document.getElementById('btn-download').style.display = 'none';
  document.getElementById('header-status').textContent = 'Online';
  updateCartBadge();

  chatMessages.innerHTML = '';
  addSystemMsg('Chat started');

  // Auto-greeting
  setTimeout(() => {
    const greeting = 'Hello' + (visitorName ? ' ' + visitorName : '') + '! Welcome to Dentalkart Support. How can I help you today? 😊';
    addBotMsg(greeting);
    playNotificationSound();
  }, 500);

  msgInput.focus();
}

// ══════════════════════════════════════════
// SESSION RECONNECTION
// ══════════════════════════════════════════
async function tryReconnect() {
  if (!visitorId || !convId) return false;
  try {
    const res = await fetch('/chat/session/' + encodeURIComponent(convId));
    if (!res.ok) return false;
    const data = await res.json();
    if (data.active && data.turns && data.turns.length > 0) {
      document.getElementById('prechat-overlay').style.display = 'none';
      document.getElementById('chat-area').style.display = 'flex';
      document.getElementById('btn-end').style.display = 'flex';
      document.getElementById('header-status').textContent = 'Reconnected';
      chatActive = true; chatEnded = false;
      chatMessages.innerHTML = '';
      addSystemMsg('Session restored');
      data.turns.forEach(t => {
        if (t.role === 'user') addUserMsg(t.content, t.timestamp);
        else if (t.role === 'assistant') addBotMsg(t.content, t.timestamp);
        else addSystemMsg(t.content);
      });
      msgInput.focus();
      return true;
    }
    return false;
  } catch(e) { return false; }
}

// ══════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════
function escapeHtml(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function addUserMsg(text, ts) {
  const d = document.createElement('div');
  d.className = 'msg user'; d.textContent = text;
  chatMessages.appendChild(d);
  addTimestamp(ts || Date.now(), 'user-time');
  scrollToBottom();
}

function addBotMsg(text, ts) {
  const d = document.createElement('div');
  d.className = 'msg bot';
  let html = escapeHtml(text);
  html = html.replace(/\\n/g, '<br>');
  html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<b>$1</b>');
  // Convert markdown links [text](url) to clickable links
  html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#1a73e8;text-decoration:underline">$1</a>');
  // Convert bare URLs to clickable links (only those not already inside an href)
  html = html.replace(/(?<!href=&quot;)(https?:\\/\\/[^\\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#1a73e8;text-decoration:underline">$1</a>');
  d.innerHTML = html;
  chatMessages.appendChild(d);
  addTimestamp(ts || Date.now(), 'bot-time');
  scrollToBottom();
}

function addSystemMsg(text) {
  const d = document.createElement('div');
  d.className = 'msg system'; d.textContent = text;
  chatMessages.appendChild(d); scrollToBottom();
}

function addTimestamp(ts, cls) {
  const d = document.createElement('div');
  d.className = 'msg-time ' + cls;
  d.textContent = formatTime(ts);
  chatMessages.appendChild(d);
}

function addMeta(info) {
  const d = document.createElement('div');
  d.className = 'meta'; d.innerHTML = info;
  chatMessages.appendChild(d); scrollToBottom();
}

function scrollToBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

function showTyping() {
  const d = document.createElement('div');
  d.className = 'typing'; d.id = 'typing-indicator';
  d.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(d); scrollToBottom();
}

function hideTyping() { const el = document.getElementById('typing-indicator'); if (el) el.remove(); }

// ══════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text && pendingFiles.length === 0) return;
  if (!chatActive) return;

  msgInput.value = '';
  if (text) addUserMsg(text);
  sendBtn.disabled = true;
  showTyping();

  try {
    // Upload files first if any
    let attachmentContext = '';
    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('conversation_id', convId);
          const upRes = await fetch('/chat/upload', { method: 'POST', body: formData });
          if (upRes.ok) {
            const upData = await upRes.json();
            attachmentContext += ' [Attached: ' + file.name + ']';
          }
        } catch(e) {}
      }
      clearUploadPreview();
    }

    const res = await fetch('/test/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: (text + attachmentContext).trim(),
        conversation_id: convId,
        visitor_id: visitorId,
        visitor_name: visitorName,
        visitor_email: visitorEmail,
        channel: 'web',
      }),
    });

    hideTyping();
    const data = await res.json();

    let hasRichResults = false;
    if (data.toolResults && data.toolResults.length > 0) {
      hasRichResults = data.toolResults.some(tr =>
        (tr.tool === 'lookup_customer_orders' && tr.success && tr.data && tr.data.found && tr.data.orders) ||
        (tr.tool === 'search_products' && tr.success && tr.data && tr.data.found && tr.data.products) ||
        (tr.tool === 'get_shipment_details' && tr.success && tr.data && tr.data.found && tr.data.shipments) ||
        (tr.tool === 'start_ar_demo' && tr.success && tr.data && tr.data.sessionStarted)
      );
    }

    if (!hasRichResults && data.botMessage) {
      addBotMsg(data.botMessage);
      playNotificationSound();
      if (isMinimized) { unreadCount++; updateUnreadBadge(); }
    } else if (data.botMessage) {
      playNotificationSound();
      if (isMinimized) { unreadCount++; updateUnreadBadge(); }
    }

    if (data.toolResults) {
      data.toolResults.forEach(tr => {
        if (tr.tool === 'lookup_customer_orders' && tr.success && tr.data && tr.data.found) renderOrderTable(tr.data);
        if (tr.tool === 'search_products' && tr.success && tr.data && tr.data.found) renderProductCards(tr.data);
        if (tr.tool === 'get_shipment_details' && tr.success && tr.data && tr.data.found) renderShipmentDetails(tr.data);
        if (tr.tool === 'view_cart' && tr.success && tr.data && !tr.data.empty) renderCartTable(tr.data);
        if (tr.tool === 'add_to_cart' && tr.success && tr.data && tr.data.cartSummary) {
          // Update local cart badge from server-side cart state
          const cs = tr.data.cartSummary;
          updateCartBadge();
        }
        if (tr.tool === 'remove_from_cart' && tr.success && tr.data && tr.data.cartSummary) {
          updateCartBadge();
        }
        if (tr.tool === 'start_ar_demo' && tr.success && tr.data && tr.data.sessionStarted) {
          renderARSessionCard(tr.data);
        }
        // Enhancement v5: New tool result handlers
        if (tr.tool === 'recommend_products' && tr.success && tr.data && tr.data.recommendations) {
          renderRecommendationCarousel(tr.data);
        }
        if (tr.tool === 'collect_product_review' && tr.success && tr.data && tr.data.collectingReview) {
          renderReviewWidget(tr.data);
        }
        if (tr.tool === 'initiate_refund' && tr.success && tr.data && tr.data.refundPreview) {
          renderRefundCard(tr.data);
        }
        if (tr.tool === 'get_bulk_pricing' && tr.success && tr.data && tr.data.tiers) {
          renderBulkPricingTable(tr.data);
        }
        if (tr.tool === 'check_coupon' && tr.success && tr.data && tr.data.availableCoupons) {
          renderAvailableCoupons(tr.data);
        }
      });
    }

    // Meta
    const parts = [];
    if (data.intent) parts.push('<span class="label">Intent:</span> ' + data.intent);
    if (data.state) parts.push('<span class="label">State:</span> ' + data.state.previous + ' → ' + data.state.current);
    if (data.toolCalls && data.toolCalls.length > 0) parts.push('<span class="label">Tools:</span> ' + data.toolCalls.map(t => t.name).join(', '));
    if (data.shouldEscalate) parts.push('<span class="label">Escalated:</span> ' + (data.escalationReason || 'Yes'));
    if (parts.length) addMeta(parts.join(' &nbsp;|&nbsp; '));

  } catch (err) {
    hideTyping();
    addSystemMsg('Network error: ' + err.message);
  }

  sendBtn.disabled = false;
  msgInput.focus();
}

msgInput && msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !sendBtn.disabled && chatActive) sendMessage();
});

// ══════════════════════════════════════════
// END CHAT
// ══════════════════════════════════════════
async function endChat() {
  if (!chatActive || chatEnded) return;
  try {
    await fetch('/chat/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: convId, visitor_id: visitorId, ended_by: 'user' }),
    });
  } catch(e) {}

  chatActive = false; chatEnded = true;
  localStorage.removeItem('zobot_active_conv');
  addSystemMsg('Chat ended. Thank you for contacting Dentalkart!');
  document.getElementById('btn-end').style.display = 'none';
  document.getElementById('btn-new').style.display = 'flex';
  document.getElementById('btn-download').style.display = 'flex';
  document.getElementById('header-status').textContent = 'Chat Ended';
  msgInput.disabled = true;
  sendBtn.disabled = true;

  // Show CSAT
  setTimeout(() => showCSAT(), 600);
}

// ══════════════════════════════════════════
// NEW CHAT
// ══════════════════════════════════════════
function startNewChat() {
  chatMessages.innerHTML = '';
  msgInput.disabled = false;
  sendBtn.disabled = false;
  document.getElementById('btn-download').style.display = 'none';
  startChatSession();
}

// ══════════════════════════════════════════
// CSAT
// ══════════════════════════════════════════
function showCSAT() {
  csatRating = 0;
  const overlay = document.getElementById('csat-overlay');
  overlay.style.display = 'flex';
  const starsEl = document.getElementById('csat-stars');
  starsEl.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'csat-star'; star.textContent = '★';
    star.onclick = () => selectCSATRating(i);
    starsEl.appendChild(star);
  }
  document.getElementById('csat-feedback').value = '';
  document.getElementById('csat-submit-btn').disabled = true;
}

function selectCSATRating(rating) {
  csatRating = rating;
  document.querySelectorAll('.csat-star').forEach((s, i) => {
    s.classList.toggle('active', i < rating);
  });
  document.getElementById('csat-submit-btn').disabled = false;
}

async function submitCSAT() {
  if (!csatRating) return;
  const feedback = document.getElementById('csat-feedback').value.trim();
  try {
    await fetch('/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: convId, visitor_id: visitorId, rating: csatRating, feedback }),
    });
  } catch(e) {}
  document.getElementById('csat-overlay').style.display = 'none';
  addSystemMsg('Thank you for your feedback! (Rating: ' + '★'.repeat(csatRating) + ')');
}

function skipCSAT() {
  document.getElementById('csat-overlay').style.display = 'none';
}

// ══════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════
async function toggleHistory() {
  const panel = document.getElementById('history-panel');
  if (panel.style.display === 'flex') { closeHistory(); return; }
  panel.style.display = 'flex';

  const list = document.getElementById('history-list');
  list.innerHTML = '<div class="history-empty">Loading...</div>';

  try {
    const res = await fetch('/chat/history/' + encodeURIComponent(visitorId));
    const data = await res.json();
    list.innerHTML = '';
    if (!data.sessions || data.sessions.length === 0) {
      list.innerHTML = '<div class="history-empty">No previous chats found</div>';
      return;
    }
    data.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.onclick = () => viewTranscript(s.conversationId, s.subject);
      const stateCls = s.state === 'RESOLVED' ? 'resolved' : s.state === 'ESCALATED' ? 'escalated' : 'active';
      const dateStr = new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const csatStr = s.csatRating ? '★'.repeat(s.csatRating) : '';
      item.innerHTML =
        '<div class="hi-top"><span class="hi-subject">' + escapeHtml(s.subject || 'Chat') + '</span><span class="hi-date">' + dateStr + '</span></div>' +
        '<div class="hi-bottom"><span class="hi-state-badge ' + stateCls + '">' + s.state + '</span><span class="hi-turns">' + s.turnCount + ' messages</span>' +
        (csatStr ? '<span class="hi-csat">' + csatStr + '</span>' : '') + '</div>';
      list.appendChild(item);
    });
  } catch(e) {
    list.innerHTML = '<div class="history-empty">Failed to load history</div>';
  }
}

function closeHistory() { document.getElementById('history-panel').style.display = 'none'; }

async function viewTranscript(cid, subject) {
  document.getElementById('history-panel').style.display = 'none';
  const tv = document.getElementById('transcript-view');
  tv.style.display = 'flex';
  document.getElementById('transcript-title').textContent = subject || 'Transcript';
  const msgs = document.getElementById('transcript-messages');
  msgs.innerHTML = '<div class="history-empty">Loading...</div>';

  try {
    const res = await fetch('/chat/transcript/' + encodeURIComponent(cid));
    const data = await res.json();
    msgs.innerHTML = '';
    if (!data.turns || data.turns.length === 0) {
      msgs.innerHTML = '<div class="history-empty">' + (data.note || 'No messages found') + '</div>';
      return;
    }
    data.turns.forEach(t => {
      const d = document.createElement('div');
      if (t.role === 'user') { d.className = 'msg user'; d.textContent = t.content; }
      else if (t.role === 'assistant') {
        d.className = 'msg bot';
        let html = escapeHtml(t.content); html = html.replace(/\\n/g, '<br>'); html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<b>$1</b>');
        d.innerHTML = html;
      } else { d.className = 'msg system'; d.textContent = t.content; }
      msgs.appendChild(d);
      const time = document.createElement('div');
      time.className = 'msg-time ' + (t.role === 'user' ? 'user-time' : 'bot-time');
      time.textContent = formatTime(t.timestamp);
      msgs.appendChild(time);
    });
  } catch(e) { msgs.innerHTML = '<div class="history-empty">Failed to load transcript</div>'; }
}

function closeTranscript() {
  document.getElementById('transcript-view').style.display = 'none';
  toggleHistory();
}

// ══════════════════════════════════════════
// DOWNLOAD TRANSCRIPT
// ══════════════════════════════════════════
function downloadTranscript() {
  const msgs = chatMessages.querySelectorAll('.msg');
  let text = 'Dentalkart Chat Transcript\\n';
  text += 'Date: ' + new Date().toLocaleString() + '\\n';
  text += 'Visitor: ' + visitorName + ' (' + visitorEmail + ')\\n';
  text += '='.repeat(50) + '\\n\\n';
  msgs.forEach(m => {
    if (m.classList.contains('user')) text += 'You: ' + m.textContent + '\\n\\n';
    else if (m.classList.contains('bot')) text += 'Agent: ' + m.textContent + '\\n\\n';
    else if (m.classList.contains('system')) text += '--- ' + m.textContent + ' ---\\n\\n';
  });
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'dentalkart-chat-' + convId + '.txt';
  a.click(); URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════
function handleFileSelect(e) {
  const files = Array.from(e.target.files).slice(0, 5);
  pendingFiles = files;
  showUploadPreview();
  e.target.value = '';
}

function showUploadPreview() {
  const preview = document.getElementById('upload-preview');
  preview.style.display = 'flex';
  preview.innerHTML = '';
  pendingFiles.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'upload-file-info';
    if (f.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'upload-thumb';
      img.src = URL.createObjectURL(f);
      div.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.textContent = '📄 ' + f.name;
      span.style.fontSize = '12px';
      div.appendChild(span);
    }
    const removeBtn = document.createElement('button');
    removeBtn.className = 'upload-remove'; removeBtn.textContent = '✕';
    removeBtn.onclick = () => { pendingFiles.splice(i, 1); showUploadPreview(); if (!pendingFiles.length) clearUploadPreview(); };
    div.appendChild(removeBtn);
    preview.appendChild(div);
  });
}

function clearUploadPreview() {
  pendingFiles = [];
  const preview = document.getElementById('upload-preview');
  preview.style.display = 'none'; preview.innerHTML = '';
}

// Drag & Drop
const container = document.getElementById('chat-container');
const dropOverlay = document.getElementById('drop-overlay');
container.addEventListener('dragover', e => { e.preventDefault(); dropOverlay.style.display = 'flex'; });
container.addEventListener('dragleave', e => { if (!container.contains(e.relatedTarget)) dropOverlay.style.display = 'none'; });
container.addEventListener('drop', e => {
  e.preventDefault(); dropOverlay.style.display = 'none';
  const files = Array.from(e.dataTransfer.files).slice(0, 5);
  if (files.length) { pendingFiles = files; showUploadPreview(); }
});

// ══════════════════════════════════════════
// ORDER TABLE / PRODUCT / SHIPMENT RENDERERS
// (preserved from original with theme variable support)
// ══════════════════════════════════════════
function getStatusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('deliver')) return 'status-delivered';
  if (s.includes('ship')) return 'status-shipped';
  if (s.includes('pack')) return 'status-packed';
  if (s.includes('cancel')) return 'status-cancelled';
  if (s.includes('return')) return 'status-returned';
  if (s.includes('rto')) return 'status-rto';
  if (s.includes('process') || s.includes('confirm')) return 'status-processing';
  return 'status-default';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split(' ')[0];
  if (!parts) return dateStr;
  const [dd, mm, yyyy] = parts.split('/');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mi = parseInt(mm, 10) - 1;
  if (mi >= 0 && mi < 12 && dd && yyyy) return dd + ' ' + months[mi] + ' ' + yyyy;
  return parts;
}

let _orderPageState = null;

function renderOrderTable(orderData) {
  if (!orderData || !orderData.orders || orderData.orders.length === 0) return;
  const allOrders = orderData.orders.slice();
  allOrders.sort((a, b) => {
    const pa = (a.orderDate||'').split(' ')[0]||''; const pb = (b.orderDate||'').split(' ')[0]||'';
    const da = pa.split('/'); const db = pb.split('/');
    return (new Date(db[2]+'-'+db[1]+'-'+db[0]).getTime()||0) - (new Date(da[2]+'-'+da[1]+'-'+da[0]).getTime()||0);
  });
  _orderPageState = { orders: allOrders, displayed: 0, tbody: null, wrapper: null, btnBox: null };
  const wrapper = document.createElement('div'); wrapper.className = 'order-table-wrapper';
  _orderPageState.wrapper = wrapper;
  const hdr = document.createElement('div'); hdr.className = 'order-table-header';
  hdr.textContent = (orderData.customerName ? 'Orders for ' + orderData.customerName : 'Orders') + ' (' + allOrders.length + ' total)';
  wrapper.appendChild(hdr);
  const table = document.createElement('table'); table.className = 'order-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<colgroup><col style="width:24px"><col style="width:22%"><col style="width:18%"><col style="width:16%"><col style="width:18%"><col style="width:14%"><col style="width:12%"></colgroup><tr><th>#</th><th>Order</th><th>Date</th><th>Status</th><th>Amount</th><th>Pay</th><th>Qty</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody'); _orderPageState.tbody = tbody;
  table.appendChild(tbody); wrapper.appendChild(table);
  appendOrderRows(2);
  if (allOrders.length > 2) { const btnBox = document.createElement('div'); _orderPageState.btnBox = btnBox; wrapper.appendChild(btnBox); updateShowMoreBtn(); }
  chatMessages.appendChild(wrapper); scrollToBottom();
}

function getOrderActionButtons(orderNo, status) {
  const s = (status || '').toLowerCase();
  let btns = '';

  // Always show Details
  btns += '<button class="order-action-btn details" onclick="event.stopPropagation(); triggerAction(\\'Show shipment details for order '+escapeHtml(orderNo)+'\\')">📋 Details</button>';

  if (s.includes('deliver') && !s.includes('not')) {
    // Delivered
    btns += '<button class="order-action-btn return" onclick="event.stopPropagation(); triggerAction(\\'I want to return order '+escapeHtml(orderNo)+'\\')">🔄 Return</button>';
    btns += '<button class="order-action-btn invoice" onclick="event.stopPropagation(); triggerAction(\\'Download invoice for order '+escapeHtml(orderNo)+'\\')">📄 Invoice</button>';
  } else if (s.includes('ship') || s.includes('pack') || s.includes('transit')) {
    // Shipped / Packed / In Transit
    btns += '<button class="order-action-btn track" onclick="event.stopPropagation(); triggerAction(\\'Track order '+escapeHtml(orderNo)+'\\')">📦 Track</button>';
    btns += '<button class="order-action-btn cancel" onclick="event.stopPropagation(); triggerAction(\\'Cancel order '+escapeHtml(orderNo)+'\\')">❌ Cancel</button>';
  } else if (s.includes('confirm') || s.includes('process') || s.includes('pending')) {
    // Processing / Confirmed / Pending
    btns += '<button class="order-action-btn track" onclick="event.stopPropagation(); triggerAction(\\'Track order '+escapeHtml(orderNo)+'\\')">📦 Track</button>';
    btns += '<button class="order-action-btn cancel" onclick="event.stopPropagation(); triggerAction(\\'Cancel order '+escapeHtml(orderNo)+'\\')">❌ Cancel</button>';
  } else if (s.includes('cancel') || s.includes('return') || s.includes('rto')) {
    // Cancelled / Returned / RTO
    btns += '<button class="order-action-btn reorder" onclick="event.stopPropagation(); triggerAction(\\'Reorder items from order '+escapeHtml(orderNo)+'\\')">🔁 Reorder</button>';
  }

  return '<div class="order-action-btns">' + btns + '</div>';
}

function appendOrderRows(count) {
  const st = _orderPageState; if (!st) return;
  const start = st.displayed; const end = Math.min(start + count, st.orders.length);
  for (let i = start; i < end; i++) {
    const order = st.orders[i]; const tr = document.createElement('tr');
    const extOrderNo = order.externalOrderNo || order.orderNo || '';
    tr.title = 'Click to view details for ' + extOrderNo;
    tr.addEventListener('click', ((no) => () => { if (sendBtn.disabled || !chatActive) return; msgInput.value = 'Show shipment details for order ' + no; sendMessage(); })(extOrderNo));
    const statusCls = getStatusClass(order.status);
    // Show item count (compact) — full names visible on shipment details after click
    const totalQty = (order.items || []).reduce((s, it) => s + parseFloat(it.qty||'1'), 0);
    const itemsHtml = totalQty > 0
      ? '<span class="item-count-badge">' + totalQty + '</span>'
      : '-';
    tr.innerHTML = '<td>'+(i+1)+'</td><td><b>'+escapeHtml(extOrderNo||'-')+'</b></td><td>'+formatDate(order.orderDate)+'</td>' +
      '<td><span class="status-badge '+statusCls+'">'+escapeHtml(order.status||'-')+'</span></td>' +
      '<td style="white-space:nowrap">₹'+parseFloat(order.totalAmount||0).toFixed(2)+'</td>' +
      '<td>'+escapeHtml(order.paymentMethod||'-')+'</td><td class="items-cell">'+itemsHtml+'</td>';
    st.tbody.appendChild(tr);
  }
  st.displayed = end;
}

function updateShowMoreBtn() {
  const st = _orderPageState; if (!st || !st.btnBox) return;
  st.btnBox.innerHTML = '';
  const remaining = st.orders.length - st.displayed;
  if (remaining <= 0) return;
  const btn = document.createElement('button'); btn.className = 'show-more-btn';
  btn.textContent = 'Show More Orders (' + remaining + ' remaining)';
  btn.addEventListener('click', () => { appendOrderRows(5); updateShowMoreBtn(); scrollToBottom(); });
  st.btnBox.appendChild(btn);
}

function renderProductCards(productData) {
  if (!productData || !productData.products || productData.products.length === 0) return;
  const hdr = document.createElement('div'); hdr.className = 'product-grid-header';
  hdr.textContent = productData.resultCount + ' Product(s) Found for "' + escapeHtml(productData.query || '') + '"';
  chatMessages.appendChild(hdr);
  const grid = document.createElement('div'); grid.className = 'product-grid';
  productData.products.forEach(product => {
    const card = document.createElement('div'); card.className = 'product-card';
    let imgHtml = product.imageUrl ? '<img class="product-card-img" src="'+escapeHtml(product.imageUrl)+'" alt="'+escapeHtml(product.name||'')+'" onerror="this.outerHTML=\\'<div class=product-card-img-placeholder>🦷</div>\\';" />' : '<div class="product-card-img-placeholder">🦷</div>';
    const sp = parseFloat(product.sellingPrice || product.price || 0);
    const op = parseFloat(product.price || 0);
    const hasDiscount = product.discount && product.discount.value > 0;
    let priceHtml = '<span class="selling">₹'+sp.toFixed(2)+'</span>';
    if (hasDiscount && op > sp) { priceHtml += '<span class="original">₹'+op.toFixed(2)+'</span><span class="discount-label">'+escapeHtml(product.discount.label||(Math.round(product.discount.value)+'% Off'))+'</span>'; }
    const stockClass = product.inStock ? 'in-stock' : 'out-of-stock';
    const stockText = product.stockAlert || (product.inStock ? 'In Stock' : 'Out of Stock');
    let ratingHtml = '';
    if (product.ratingCount > 0) { const r = product.averageRating?(product.averageRating/20).toFixed(1):'0'; ratingHtml = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px"><span style="color:#ffc107">★</span> '+r+'/5 ('+product.ratingCount+')</div>'; }
    let linkHtml = product.productUrl ? '<a class="product-card-link" href="'+escapeHtml(product.productUrl)+'" target="_blank" rel="noopener">View ↗</a>' : '';
    // Add to Cart button
    const cartBtnClass = product.inStock ? 'product-card-cart-btn' : 'product-card-cart-btn out-of-stock-btn';
    const cartBtnText = product.inStock ? '🛒 Add to Cart' : 'Out of Stock';
    const cartBtnDisabled = product.inStock ? '' : ' disabled';
    // AR Demo button
    const arBtnHtml = '<button class="product-card-ar-btn" data-product-name="'+escapeHtml(product.name||'')+'" data-product-id="'+escapeHtml(String(product.productId||''))+'">📱 AR Demo</button>';
    const actionsHtml = '<div class="product-card-actions">' + linkHtml +
      '<button class="'+cartBtnClass+'"'+cartBtnDisabled+' data-product-id="'+escapeHtml(String(product.productId||''))+'" data-product=\\''+escapeHtml(JSON.stringify({
        productId: product.productId, name: product.name, sku: product.sku,
        price: op, sellingPrice: sp, imageUrl: product.imageUrl,
        productUrl: product.productUrl, inStock: product.inStock,
        discount: product.discount
      }))+'\\'>'+cartBtnText+'</button>' + arBtnHtml + '</div>';
    card.innerHTML = imgHtml + '<div class="product-card-body"><div class="product-card-name" title="'+escapeHtml(product.name||'')+'">'+escapeHtml(product.name||'-')+'</div><div class="product-card-price">'+priceHtml+'</div><div class="product-card-stock '+stockClass+'">'+escapeHtml(stockText)+'</div>'+ratingHtml+actionsHtml+'</div>';
    // Attach cart click handler
    const cartBtn = card.querySelector('.product-card-cart-btn');
    if (cartBtn && product.inStock) {
      cartBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleAddToCart(this, product);
      });
    }
    // Attach AR demo click handler
    const arBtn = card.querySelector('.product-card-ar-btn');
    if (arBtn) {
      arBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pName = this.getAttribute('data-product-name') || 'Product';
        const pId = this.getAttribute('data-product-id') || '';
        triggerAction('Start AR demo for product: ' + pName);
      });
    }
    grid.appendChild(card);
  });
  chatMessages.appendChild(grid); scrollToBottom();
}

function renderARSessionCard(arData) {
  if (!arData || !arData.customerJoinUrl) return;
  const card = document.createElement('div'); card.className = 'ar-session-card';
  const demoTypeLabels = {
    product_demo: '🔬 Product Demo',
    troubleshooting: '🔧 Troubleshooting',
    installation_guide: '📋 Installation',
    visual_inspection: '🔍 Inspection'
  };
  const typeLabel = demoTypeLabels[arData.demoType] || '🔬 AR Demo';
  card.innerHTML =
    '<h4>📱 ' + escapeHtml(arData.sessionTitle || 'AR Session') +
    ' <span class="ar-type-badge">' + escapeHtml(typeLabel) + '</span></h4>' +
    '<div class="ar-steps">' +
      '<div class="ar-step"><span class="ar-step-num">1</span> Open link on phone</div>' +
      '<div class="ar-step"><span class="ar-step-num">2</span> Allow camera</div>' +
      '<div class="ar-step"><span class="ar-step-num">3</span> Follow AR guide</div>' +
    '</div>' +
    '<div class="ar-instructions">' + escapeHtml(arData.instructions || '') + '</div>' +
    '<a class="ar-join-btn" href="' + escapeHtml(arData.customerJoinUrl) + '" target="_blank" rel="noopener">' +
      '📱 Join AR Session' +
    '</a>' +
    (arData.alreadyActive ? '<div style="font-size:11px;color:#ff6f00;margin-top:8px">⚠ Session already active — use the same link</div>' : '');
  chatMessages.appendChild(card); scrollToBottom();
}

// ── Enhancement v5: Recommendation Carousel ──
function renderRecommendationCarousel(data) {
  if (!data.recommendations || data.recommendations.length === 0) return;
  const wrap = document.createElement('div'); wrap.className = 'reco-carousel';
  wrap.innerHTML = '<h4>💡 Recommended For You</h4>';
  const grid = document.createElement('div'); grid.className = 'reco-grid';
  data.recommendations.forEach(function(r) {
    const card = document.createElement('div'); card.className = 'reco-card';
    const p = r.product;
    card.innerHTML =
      '<div class="name">' + escapeHtml(p.name) + '</div>' +
      '<div class="price">₹' + (p.sellingPrice || p.price) + (p.savings ? ' <span style="font-size:10px;color:#4caf50">' + p.savings + '</span>' : '') + '</div>' +
      (p.category ? '<div class="reason">' + escapeHtml(p.category) + '</div>' : '') +
      '<div class="reason">' + escapeHtml(r.reason) + '</div>' +
      '<button class="reco-add-btn" data-name="' + escapeHtml(p.name) + '">🛒 Add to Cart</button>';
    card.querySelector('.reco-add-btn').addEventListener('click', function() {
      triggerAction('Add ' + p.name + ' to my cart');
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  chatMessages.appendChild(wrap); scrollToBottom();
}

// ── Enhancement v5: Review Star Widget ──
function renderReviewWidget(data) {
  const wrap = document.createElement('div'); wrap.className = 'review-widget';
  wrap.innerHTML =
    '<h4>⭐ Rate ' + escapeHtml(data.productName || 'this product') + '</h4>' +
    '<div class="review-stars">' +
    [1,2,3,4,5].map(function(n) { return '<span class="review-star" data-rating="' + n + '">⭐</span>'; }).join('') +
    '</div>' +
    '<div style="font-size:11px;color:#666">Tap a star to rate</div>';
  wrap.querySelectorAll('.review-star').forEach(function(star) {
    star.addEventListener('click', function() {
      var rating = star.dataset.rating;
      wrap.querySelectorAll('.review-star').forEach(function(s, i) { s.classList.toggle('active', i < rating); });
      triggerAction('I rate ' + (data.productName || 'the product') + ' ' + rating + ' stars');
    });
  });
  chatMessages.appendChild(wrap); scrollToBottom();
}

// ── Enhancement v5: Refund Confirmation Card ──
function renderRefundCard(data) {
  if (!data.refundPreview) return;
  var rp = data.refundPreview;
  var card = document.createElement('div'); card.className = 'refund-card';
  card.innerHTML =
    '<h4>🔄 Refund Preview — Order ' + escapeHtml(rp.orderNo) + '</h4>' +
    '<div class="refund-row"><span class="label">Type</span><span class="value">' + escapeHtml(rp.refundType) + '</span></div>' +
    '<div class="refund-row"><span class="label">Refund Mode</span><span class="value">' + escapeHtml(rp.refundMode) + '</span></div>' +
    '<div class="refund-row"><span class="label">Timeline</span><span class="value">' + rp.estimatedDays + ' business days</span></div>' +
    '<div class="refund-amount">₹' + rp.refundAmount.toFixed(2) + '</div>' +
    (rp.items ? '<div style="font-size:11px;color:#666">' + rp.items.map(function(i) { return escapeHtml(i.name) + ' (₹' + i.price + ')'; }).join(', ') + '</div>' : '');
  chatMessages.appendChild(card); scrollToBottom();
}

// ── Enhancement v5: Bulk Pricing Table ──
function renderBulkPricingTable(data) {
  if (!data.tiers || data.tiers.length === 0) return;
  var wrap = document.createElement('div'); wrap.className = 'bulk-pricing-card';
  wrap.innerHTML = '<h4>📦 Bulk Pricing — ' + escapeHtml(data.productName) + '</h4>';
  var table = '<table class="bulk-table"><thead><tr><th>Tier</th><th>Qty</th><th>Price/Unit</th><th>Discount</th></tr></thead><tbody>';
  data.tiers.forEach(function(t) {
    var isApplied = data.appliedTier && data.appliedTier.label === t.label;
    table += '<tr' + (isApplied ? ' class="bulk-highlight"' : '') + '>' +
      '<td>' + escapeHtml(t.label) + '</td>' +
      '<td>' + t.minQty + (t.maxQty !== '50+' ? '-' + t.maxQty : '+') + '</td>' +
      '<td>' + t.pricePerUnit + '</td>' +
      '<td>' + t.discountPercent + '</td></tr>';
  });
  table += '</tbody></table>';
  wrap.innerHTML += table;
  if (data.totalCost) {
    wrap.innerHTML += '<div style="margin-top:10px;font-size:13px;text-align:center;font-weight:600">Total: ₹' + data.totalCost.toFixed(2) + ' <span style="color:#4caf50">(Save ₹' + (data.totalSavings || 0).toFixed(2) + ')</span></div>';
  }
  if (data.moqNote) {
    wrap.innerHTML += '<div style="margin-top:6px;font-size:10px;color:#666;text-align:center">' + escapeHtml(data.moqNote) + '</div>';
  }
  chatMessages.appendChild(wrap); scrollToBottom();
}

// ── Enhancement v5: Available Coupons List ──
function renderAvailableCoupons(data) {
  if (!data.availableCoupons || data.availableCoupons.length === 0) return;
  var wrap = document.createElement('div'); wrap.className = 'reco-carousel';
  wrap.innerHTML = '<h4>🏷️ Available Coupons</h4>';
  var grid = document.createElement('div'); grid.className = 'reco-grid';
  data.availableCoupons.forEach(function(c) {
    var card = document.createElement('div'); card.className = 'reco-card';
    card.innerHTML =
      '<div class="name" style="color:#e65100;font-family:monospace">' + escapeHtml(c.code) + '</div>' +
      '<div class="reason">' + escapeHtml(c.description) + '</div>' +
      (c.minOrderValue ? '<div style="font-size:10px;color:#999">Min order: ₹' + c.minOrderValue + '</div>' : '') +
      '<button class="reco-add-btn" style="background:#e65100">Apply Code</button>';
    card.querySelector('.reco-add-btn').addEventListener('click', function() {
      triggerAction('Apply coupon code ' + c.code);
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  chatMessages.appendChild(wrap); scrollToBottom();
}

function renderCartTable(cartData) {
  if (!cartData || cartData.empty) return;
  const wrapper = document.createElement('div'); wrapper.className = 'cart-table-wrapper';
  const hdr = document.createElement('div'); hdr.className = 'cart-table-header';
  hdr.textContent = '🛒 Your Cart (' + cartData.cartSummary.totalItems + ' items)';
  wrapper.appendChild(hdr);
  const table = document.createElement('table'); table.className = 'cart-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  cartData.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>'+escapeHtml(item.name||'-')+'</td>' +
      '<td>'+item.quantity+'</td>' +
      '<td>₹'+parseFloat(item.sellingPrice||0).toFixed(2)+'</td>' +
      '<td style="white-space:nowrap;font-weight:600">₹'+parseFloat(item.lineTotal||0).toFixed(2)+'</td>';
    tbody.appendChild(tr);
  });
  // Total row
  const totalTr = document.createElement('tr'); totalTr.className = 'cart-total-row';
  totalTr.innerHTML = '<td colspan="3" style="text-align:right;font-weight:700">Subtotal</td><td style="white-space:nowrap;font-weight:700">₹'+cartData.cartSummary.subtotal.toFixed(2)+'</td>';
  tbody.appendChild(totalTr);
  if (cartData.cartSummary.totalSavings > 0) {
    const saveTr = document.createElement('tr');
    saveTr.innerHTML = '<td colspan="3" style="text-align:right;color:#2e7d32;font-weight:600">You Save</td><td style="color:#2e7d32;font-weight:600;white-space:nowrap">₹'+cartData.cartSummary.totalSavings.toFixed(2)+'</td>';
    tbody.appendChild(saveTr);
  }
  table.appendChild(tbody); wrapper.appendChild(table);
  chatMessages.appendChild(wrapper); scrollToBottom();
}

function getShipmentStatus(shipment) {
  const s = (shipment.status || '').toLowerCase();
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('return') || s.includes('rto')) return 'returned';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('ship') || s.includes('transit')) return 'shipped';
  if (s.includes('pack')) return 'packed';
  return 'processing';
}

function renderShipmentDetails(shipData) {
  if (!shipData || !shipData.shipments || shipData.shipments.length === 0) return;
  const orderNo = shipData.orderNo || '';
  shipData.shipments.forEach((shipment, idx) => {
    const wrapper = document.createElement('div'); wrapper.className = 'shipment-wrapper';
    const hdr = document.createElement('div'); hdr.className = 'shipment-header';
    hdr.textContent = (shipData.shipmentCount > 1 ? 'Shipment '+(idx+1)+' of '+shipData.shipmentCount : 'Shipment Details') + ' — Order ' + escapeHtml(orderNo);
    wrapper.appendChild(hdr);
    const card = document.createElement('div'); card.className = 'shipment-card';
    const statusCls = getStatusClass(shipment.status);
    let html = '<div class="shipment-info-row">';
    html += '<div class="shipment-info-item"><span class="si-label">AWB</span><span class="si-value">'+escapeHtml(shipment.trackingNumber||'-')+'</span></div>';
    html += '<div class="shipment-info-item"><span class="si-label">Carrier</span><span class="si-value">'+escapeHtml(shipment.carrierName||'-')+'</span></div>';
    html += '<div class="shipment-info-item"><span class="si-label">Status</span><span class="si-value"><span class="status-badge '+statusCls+'">'+escapeHtml(shipment.status||'-')+'</span></span></div>';
    if (shipment.invoiceNo) html += '<div class="shipment-info-item"><span class="si-label">Invoice</span><span class="si-value">'+escapeHtml(shipment.invoiceNo)+'</span></div>';
    html += '</div><div class="shipment-info-row">';
    if (shipment.packDate) html += '<div class="shipment-info-item"><span class="si-label">Packed</span><span class="si-value">'+formatDate(shipment.packDate)+'</span></div>';
    if (shipment.shipDate) html += '<div class="shipment-info-item"><span class="si-label">Shipped</span><span class="si-value">'+formatDate(shipment.shipDate)+'</span></div>';
    if (shipment.deliveredDate) html += '<div class="shipment-info-item"><span class="si-label">Delivered</span><span class="si-value">'+formatDate(shipment.deliveredDate)+'</span></div>';
    html += '</div>';
    if (shipment.items && shipment.items.length > 0) {
      html += '<table class="shipment-items-table"><thead><tr><th>Item</th><th>SKU</th><th>Price</th><th>Status</th></tr></thead><tbody>';
      shipment.items.forEach(item => { const ic = getStatusClass(item.status||''); html += '<tr><td>'+escapeHtml(item.name||'-')+'</td><td style="font-size:11px;color:var(--text-muted)">'+escapeHtml(item.sku||'-')+'</td><td style="white-space:nowrap">₹'+parseFloat(item.price||0).toFixed(2)+'</td><td><span class="status-badge '+ic+'">'+escapeHtml(item.status||'-')+'</span></td></tr>'; });
      html += '</tbody></table>';
    }

    // ── Dynamic Action Buttons Based on Status ──
    const shipStatus = getShipmentStatus(shipment);
    html += '<div class="shipment-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">';

    if (shipStatus === 'delivered') {
      // Delivered: Return + Download Invoice
      html += '<button class="shipment-track-btn" onclick="triggerAction(\\'I want to return order '+escapeHtml(orderNo)+'\\')">🔄 Return</button>';
      if (shipment.invoiceNo) {
        html += '<button class="shipment-track-btn" style="background:var(--primary)" onclick="triggerAction(\\'Download invoice '+escapeHtml(shipment.invoiceNo)+' for order '+escapeHtml(orderNo)+'\\')">📄 Download Invoice</button>';
      }
    } else if (shipStatus === 'shipped' || shipStatus === 'packed') {
      // In-transit / Packed: Track + Cancel
      if (shipment.trackingNumber) {
        html += '<a class="shipment-track-btn" href="https://dentalkart.clickpost.ai/?waybill='+encodeURIComponent(String(shipment.trackingNumber))+'" target="_blank" rel="noopener">📦 Track</a>';
      }
      html += '<button class="shipment-track-btn" style="background:#c62828" onclick="triggerAction(\\'Cancel order '+escapeHtml(orderNo)+'\\')">❌ Cancel</button>';
    } else if (shipStatus === 'processing') {
      // Processing / Confirmed: Track (if AWB) + Cancel
      if (shipment.trackingNumber) {
        html += '<a class="shipment-track-btn" href="https://dentalkart.clickpost.ai/?waybill='+encodeURIComponent(String(shipment.trackingNumber))+'" target="_blank" rel="noopener">📦 Track</a>';
      }
      html += '<button class="shipment-track-btn" style="background:#c62828" onclick="triggerAction(\\'Cancel order '+escapeHtml(orderNo)+'\\')">❌ Cancel</button>';
    } else if (shipStatus === 'returned' || shipStatus === 'cancelled') {
      // Returned / Cancelled: Reorder
      html += '<button class="shipment-track-btn" style="background:#2e7d32" onclick="triggerAction(\\'Reorder items from order '+escapeHtml(orderNo)+'\\')">🔁 Reorder</button>';
    }

    html += '</div>';
    card.innerHTML = html; wrapper.appendChild(card);
    chatMessages.appendChild(wrapper);
  });
  scrollToBottom();
}

/** Trigger a chat action by injecting a message from the user */
function triggerAction(message) {
  if (!chatActive || sendBtn.disabled) return;
  msgInput.value = message;
  sendMessage();
}

// ══════════════════════════════════════════
// EXPAND / COLLAPSE WINDOW
// ══════════════════════════════════════════
let isExpanded = false;

function toggleExpand() {
  isExpanded = !isExpanded;
  const container = document.getElementById('chat-container');
  const btn = document.getElementById('btn-expand');
  if (isExpanded) {
    container.classList.add('expanded');
    btn.textContent = '⊟';
    btn.setAttribute('data-tooltip', 'Collapse');
  } else {
    container.classList.remove('expanded');
    btn.textContent = '⛶';
    btn.setAttribute('data-tooltip', 'Expand');
  }
  scrollToBottom();
}

// ══════════════════════════════════════════
// IN-CHAT CART
// ══════════════════════════════════════════
let cartItems = JSON.parse(localStorage.getItem('zobot_cart') || '[]');
let cartCount = cartItems.length;

function saveCartLocal() {
  localStorage.setItem('zobot_cart', JSON.stringify(cartItems));
  updateCartBadge();
}

function updateCartBadge() {
  cartCount = cartItems.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const badge = document.getElementById('cart-badge');
  const cartBtn = document.getElementById('btn-cart');
  if (cartCount > 0) {
    badge.textContent = cartCount > 99 ? '99+' : String(cartCount);
    badge.classList.add('visible');
    cartBtn.style.display = 'flex';
  } else {
    badge.classList.remove('visible');
    // Still show cart button if chat is active
    cartBtn.style.display = chatActive ? 'flex' : 'none';
  }
}

function addToCartLocal(product) {
  const existing = cartItems.find(i => String(i.productId) === String(product.productId));
  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cartItems.push({ ...product, quantity: 1, addedAt: Date.now() });
  }
  saveCartLocal();
}

function removeFromCartLocal(productId) {
  cartItems = cartItems.filter(i => String(i.productId) !== String(productId));
  saveCartLocal();
  renderCartPanel();
}

function updateCartQtyLocal(productId, delta) {
  const item = cartItems.find(i => String(i.productId) === String(productId));
  if (!item) return;
  item.quantity = Math.max(1, (item.quantity || 1) + delta);
  saveCartLocal();
  renderCartPanel();
}

function clearCartLocal() {
  cartItems = [];
  saveCartLocal();
  renderCartPanel();
}

function toggleCartPanel() {
  const panel = document.getElementById('cart-panel');
  if (panel.style.display === 'flex') { closeCartPanel(); return; }
  panel.style.display = 'flex';
  renderCartPanel();
}

function closeCartPanel() { document.getElementById('cart-panel').style.display = 'none'; }

function renderCartPanel() {
  const list = document.getElementById('cart-list');
  const footer = document.getElementById('cart-footer');

  if (cartItems.length === 0) {
    list.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><div class="cart-empty-text">Your cart is empty.<br>Search for products to add them!</div></div>';
    footer.style.display = 'none';
    return;
  }

  let subtotal = 0;
  let savings = 0;
  let totalQty = 0;

  list.innerHTML = '';
  cartItems.forEach(item => {
    const qty = item.quantity || 1;
    const sp = parseFloat(item.sellingPrice || item.price || 0);
    const op = parseFloat(item.price || sp);
    const lineTotal = sp * qty;
    subtotal += lineTotal;
    if (op > sp) savings += (op - sp) * qty;
    totalQty += qty;

    const div = document.createElement('div');
    div.className = 'cart-item';
    const imgHtml = item.imageUrl
      ? '<img class="cart-item-img" src="'+escapeHtml(item.imageUrl)+'" onerror="this.outerHTML=\\'<div class=cart-item-img-placeholder>🦷</div>\\';" />'
      : '<div class="cart-item-img-placeholder">🦷</div>';
    div.innerHTML = imgHtml +
      '<div class="cart-item-info">' +
        '<div class="cart-item-name" title="'+escapeHtml(item.name||'')+'">'+escapeHtml(item.name||'-')+'</div>' +
        '<div class="cart-item-price">₹'+sp.toFixed(2)+'</div>' +
        '<div class="cart-item-qty">' +
          '<button class="cart-qty-btn" onclick="updateCartQtyLocal(\\''+escapeHtml(String(item.productId))+'\\', -1)">−</button>' +
          '<span class="cart-qty-num">'+qty+'</span>' +
          '<button class="cart-qty-btn" onclick="updateCartQtyLocal(\\''+escapeHtml(String(item.productId))+'\\', 1)">+</button>' +
        '</div>' +
      '</div>' +
      '<button class="cart-item-remove" onclick="removeFromCartLocal(\\''+escapeHtml(String(item.productId))+'\\')">✕</button>';
    list.appendChild(div);
  });

  document.getElementById('cart-item-count').textContent = totalQty + ' item' + (totalQty !== 1 ? 's' : '');
  document.getElementById('cart-savings').textContent = '₹' + savings.toFixed(2);
  document.getElementById('cart-subtotal').textContent = '₹' + subtotal.toFixed(2);
  footer.style.display = 'block';
}

function clearCartUI() {
  if (confirm('Clear all items from your cart?')) {
    clearCartLocal();
    // Also tell the bot to clear server-side cart
    if (chatActive) {
      msgInput.value = 'Clear my cart';
      sendMessage();
    }
  }
}

// Enhancement v5: Apply coupon from cart panel
function applyCouponFromCart() {
  var code = document.getElementById('cart-coupon-code').value.trim();
  if (!code) return;
  document.getElementById('cart-coupon-code').value = '';
  triggerAction('Apply coupon code ' + code);
}

// Handle "Add to Cart" button click from product cards
function handleAddToCart(btn, product) {
  if (!product.inStock) return;

  // Add to local cart immediately for instant feedback
  addToCartLocal(product);

  // Visual feedback on button
  btn.textContent = '✓ Added';
  btn.classList.add('added');
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = '🛒 Add to Cart';
    btn.classList.remove('added');
    btn.disabled = false;
  }, 1500);

  // Send add-to-cart message to bot (triggers the tool)
  const oldInput = msgInput.value;
  msgInput.value = 'Add "' + product.name + '" (ID: ' + product.productId + ') to my cart';
  sendMessage();
  msgInput.value = oldInput;
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(async function init() {
  initThemes();
  document.getElementById('btn-sound').textContent = soundEnabled ? '🔔' : '🔕';
  updateCartBadge();

  // Check for return visitor
  if (visitorId && visitorName) {
    document.getElementById('pc-name').value = visitorName;
    document.getElementById('pc-email').value = visitorEmail;

    // Try reconnecting to active session
    const reconnected = await tryReconnect();
    if (reconnected) return;
  }

  // Show pre-chat form
  document.getElementById('prechat-overlay').style.display = 'flex';
})();
</script>
</body>
</html>`;

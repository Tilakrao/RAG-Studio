/**
 * RAG Studio Logger
 * - Toast notifications (success / error / warning / info)
 * - In-memory activity ring buffer (last 200 entries)
 * - Live log panel that polls GET /api/logs/json
 */
class Logger {
  constructor() {
    this._toastContainer = null;
    this._buffer = [];        // {ts, level, msg}
    this._panelOpen = false;
    this._pollTimer = null;
    this._init();
  }

  _init() {
    // Toast container
    const tc = document.createElement('div');
    tc.id = 'toastContainer';
    tc.style.cssText = `
      position:fixed;top:16px;right:16px;z-index:9999;
      display:flex;flex-direction:column;gap:8px;
      pointer-events:none;
    `;
    document.body.appendChild(tc);
    this._toastContainer = tc;

    // Log panel toggle button (in sidebar footer)
    const footer = document.querySelector('.sidebar-footer');
    if (footer) {
      const btn = document.createElement('button');
      btn.id = 'logPanelToggle';
      btn.title = 'Activity Log';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
        Logs
        <span id="logErrorDot" style="display:none;width:6px;height:6px;background:#EF4444;border-radius:50%;margin-left:2px"></span>
      `;
      btn.style.cssText = `
        display:flex;align-items:center;gap:6px;background:none;border:1px solid var(--border);
        color:var(--text-2);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;
        margin-top:8px;width:100%;transition:all 0.15s;
      `;
      btn.onmouseenter = () => { btn.style.background='var(--surface2)'; btn.style.color='var(--text)'; };
      btn.onmouseleave = () => { btn.style.background='none'; btn.style.color='var(--text-2)'; };
      btn.onclick = () => this.togglePanel();
      footer.appendChild(btn);
    }

    // Log panel overlay
    const panel = document.createElement('div');
    panel.id = 'logPanel';
    panel.style.cssText = `
      position:fixed;bottom:0;left:var(--sidebar-w);right:0;
      height:260px;background:var(--surface);border-top:1px solid var(--border);
      z-index:200;display:none;flex-direction:column;
      transition:left 0.25s;
    `;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;font-weight:600;color:var(--text)">Activity Log</span>
          <select id="logLevelFilter" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text-2);padding:2px 6px;font-size:11px;outline:none">
            <option value="ALL">ALL</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button id="logRefreshBtn" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text-2);padding:2px 8px;cursor:pointer;font-size:11px" onclick="logger.fetchServerLogs()">↻ Refresh</button>
          <button id="logClearBtn" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text-2);padding:2px 8px;cursor:pointer;font-size:11px" onclick="logger._clearLocal()">Clear local</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span id="logTabClient" class="log-tab active" onclick="logger._switchTab('client')">Browser</span>
          <span id="logTabServer" class="log-tab" onclick="logger._switchTab('server')">Server</span>
          <button onclick="logger.togglePanel()" style="background:none;border:none;color:var(--text-2);cursor:pointer;font-size:18px;line-height:1">&times;</button>
        </div>
      </div>
      <div id="logBody" style="flex:1;overflow-y:auto;padding:8px 16px;font-family:monospace;font-size:11px;line-height:1.7;background:var(--bg)"></div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;
    this._currentTab = 'client';

    document.getElementById('logLevelFilter').addEventListener('change', () => {
      if (this._currentTab === 'client') this._renderLocal();
      else this.fetchServerLogs();
    });

    // Update sidebar panel left offset when sidebar collapses
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      new MutationObserver(() => {
        panel.style.left = sidebar.classList.contains('collapsed') ? '56px' : 'var(--sidebar-w)';
      }).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    // Inject log tab CSS
    const style = document.createElement('style');
    style.textContent = `
      .log-tab { font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;cursor:pointer;color:var(--text-2); }
      .log-tab.active { background:var(--accent-dim);color:var(--accent-light); }
      #logBody .log-line { white-space:pre-wrap;word-break:break-all;border-bottom:1px solid rgba(255,255,255,0.03);padding:1px 0; }
      #logBody .log-line.ERROR { color:#EF4444; }
      #logBody .log-line.WARNING { color:#F59E0B; }
      #logBody .log-line.INFO { color:#94A3B8; }
      #logBody .log-line.DEBUG { color:#4B5563; }
      /* Toast styles */
      .toast { pointer-events:all; display:flex;align-items:flex-start;gap:10px;
        padding:12px 16px;border-radius:10px;min-width:280px;max-width:420px;
        box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid;
        animation:toastIn 0.25s ease;position:relative;overflow:hidden;
        background:var(--surface2); }
      @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:none} }
      .toast.hiding { animation:toastOut 0.2s ease forwards; }
      @keyframes toastOut { to{opacity:0;transform:translateX(20px)} }
      .toast-icon { font-size:16px;flex-shrink:0;margin-top:1px; }
      .toast-body { flex:1; }
      .toast-title { font-weight:600;font-size:13px;margin-bottom:2px; }
      .toast-msg { font-size:12px;opacity:0.85;line-height:1.5; }
      .toast-close { background:none;border:none;cursor:pointer;opacity:0.5;font-size:16px;padding:0;color:inherit;flex-shrink:0; }
      .toast-close:hover { opacity:1; }
      .toast-progress { position:absolute;bottom:0;left:0;height:3px;border-radius:0 0 10px 10px; animation:toastProgress var(--dur,4s) linear forwards; }
      @keyframes toastProgress { from{width:100%} to{width:0%} }
      .toast.success { border-color:rgba(16,185,129,0.4); }
      .toast.success .toast-progress { background:var(--success); }
      .toast.error { border-color:rgba(239,68,68,0.4); }
      .toast.error .toast-progress { background:var(--danger); }
      .toast.warning { border-color:rgba(245,158,11,0.4); }
      .toast.warning .toast-progress { background:var(--warning); }
      .toast.info { border-color:rgba(124,58,237,0.4); }
      .toast.info .toast-progress { background:var(--accent); }
    `;
    document.head.appendChild(style);
  }

  // ─── TOAST ────────────────────────────────────────────────────────
  _toast(level, title, msg, duration = 4000) {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = `toast ${level}`;
    t.innerHTML = `
      <span class="toast-icon">${icons[level] || 'ℹ'}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${this._esc(String(msg))}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
      <div class="toast-progress" style="--dur:${duration}ms"></div>
    `;
    this._toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 250); }, duration);
    return t;
  }

  success(title, msg, dur) { this._log('INFO', title + (msg ? ': ' + msg : '')); return this._toast('success', title, msg, dur); }
  error(title, msg, dur = 6000) {
    this._log('ERROR', title + (msg ? ': ' + msg : ''));
    const dot = document.getElementById('logErrorDot');
    if (dot) dot.style.display = '';
    return this._toast('error', title, msg, dur);
  }
  warn(title, msg, dur) { this._log('WARNING', title + (msg ? ': ' + msg : '')); return this._toast('warning', title, msg, dur); }
  info(title, msg, dur = 3000) { this._log('INFO', title + (msg ? ': ' + msg : '')); return this._toast('info', title, msg, dur); }

  // ─── LOCAL BUFFER ─────────────────────────────────────────────────
  _log(level, msg) {
    const ts = new Date().toLocaleTimeString();
    this._buffer.push({ ts, level, msg });
    if (this._buffer.length > 200) this._buffer.shift();
    if (this._panelOpen && this._currentTab === 'client') this._renderLocal();
  }

  _clearLocal() { this._buffer = []; this._renderLocal(); }

  _renderLocal() {
    const body = document.getElementById('logBody');
    if (!body) return;
    const filter = document.getElementById('logLevelFilter')?.value || 'ALL';
    const lines = this._buffer.filter(r => filter === 'ALL' || r.level === filter);
    body.innerHTML = lines.length
      ? lines.map(r => `<div class="log-line ${r.level}">${r.ts} [${r.level.padEnd(7)}] ${this._esc(r.msg)}</div>`).join('')
      : '<div style="color:var(--text-3);padding:8px">No entries.</div>';
    body.scrollTop = body.scrollHeight;
  }

  // ─── SERVER LOGS ──────────────────────────────────────────────────
  async fetchServerLogs() {
    const body = document.getElementById('logBody');
    if (!body) return;
    const filter = document.getElementById('logLevelFilter')?.value || 'ALL';
    body.innerHTML = '<div style="color:var(--text-3)">Loading...</div>';
    try {
      const res = await fetch(`/api/logs/json?lines=200&level=${filter}`);
      const data = await res.json();
      if (!data.length) { body.innerHTML = '<div style="color:var(--text-3)">No log entries.</div>'; return; }
      body.innerHTML = data.map(r => {
        const cls = r.level === 'ERROR' ? 'ERROR' : r.level === 'WARNING' ? 'WARNING' : 'INFO';
        return `<div class="log-line ${cls}">${r.ts} [${r.level.padEnd(7)}] ${r.name}: ${this._esc(r.msg)}</div>`;
      }).join('');
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      body.innerHTML = `<div class="log-line ERROR">Failed to fetch server logs: ${e.message}</div>`;
    }
  }

  // ─── PANEL ────────────────────────────────────────────────────────
  togglePanel() {
    this._panelOpen = !this._panelOpen;
    this._panel.style.display = this._panelOpen ? 'flex' : 'none';
    document.querySelector('.content-area').style.paddingBottom = this._panelOpen ? '276px' : '';
    if (this._panelOpen) {
      const dot = document.getElementById('logErrorDot');
      if (dot) dot.style.display = 'none';
      this._renderLocal();
    }
  }

  _switchTab(tab) {
    this._currentTab = tab;
    document.getElementById('logTabClient').classList.toggle('active', tab === 'client');
    document.getElementById('logTabServer').classList.toggle('active', tab === 'server');
    if (tab === 'client') this._renderLocal();
    else this.fetchServerLogs();
  }

  _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
}

const logger = new Logger();

/**
 * SCADA Industrial UI Controller & High-Performance Canvas Chart Engine
 * Handles modals, drawers, time-series canvas graphs, micro-interactions, rover toasts, and keyboard hotkeys.
 * Zero initial graph clutter: graphs appear strictly on user click.
 */
class UIController {
  constructor() {
    this.activeGraphMetric = null;
    this.graphAnimId = null;
    this.graphTimeWindow = 60000; // 60s default
    this.graphCanvas = null;
    this.graphCtx = null;
    this.toastTimer = null;
  }

  init() {
    this._initModals();
    this._initGraphDrawer();
    this._initTimelineFilters();
    this._initKeyboardShortcuts();
    this._initConnectButton();
  }

  /**
   * Direct Connect Button Handler (Simple state toggle without technical dialogs)
   */
  _initConnectButton() {
    const btn = document.getElementById('connect-hw-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      try {
        btn.innerHTML = `${window.renderIcon('refreshCw', 14)} <span>Connecting...</span>`;
        await window.HardwareManager.toggleConnect();
      } catch (err) {
        console.warn('Connect toggle result:', err.message);
      } finally {
        this.updateConnectButtonUI();
      }
    });

    this.updateConnectButtonUI();
  }

  updateConnectButtonUI() {
    const btn = document.getElementById('connect-hw-btn');
    if (!btn) return;

    const status = window.HardwareManager.status;
    if (status === 'CONNECTED') {
      btn.className = 'scada-btn btn-connected';
      btn.innerHTML = `${window.renderIcon('checkCircle', 14)} <span>CONNECTED (Click to Disconnect)</span>`;
    } else if (status === 'CONNECTING') {
      btn.className = 'scada-btn btn-amber';
      btn.innerHTML = `${window.renderIcon('refreshCw', 14)} <span>CONNECTING...</span>`;
    } else {
      btn.className = 'scada-btn btn-amber';
      btn.innerHTML = `${window.renderIcon('radio', 14)} <span>Connect Device</span> <span class="kbd-hint">C</span>`;
    }
  }

  /**
   * Open high-performance Canvas time-series chart drawer
   */
  openGraph(metricKey) {
    this.activeGraphMetric = metricKey;
    const modal = document.getElementById('graph-modal');
    const title = document.getElementById('graph-metric-title');
    const thresholdDesc = document.getElementById('graph-threshold-desc');
    
    const titles = {
      gas: 'Toxic & Combustible Gas Waveform (CH₄ / CO / CO₂)',
      co: 'Carbon Monoxide (CO) Stream',
      co2: 'CO₂ Atmospheric Concentration',
      temp: 'Ambient Temperature Profile',
      humidity: 'Relative Humidity History',
      water: 'Water Level Depth History',
      obstacle: 'Obstacle Clearance Proximity',
      rover: 'Rover Status: Linear Speed & Tilt Angle History',
      rover_status: 'Rover Status: Linear Speed & Tilt Angle History'
    };

    if (title) title.innerText = titles[metricKey] || metricKey.toUpperCase();
    
    if (metricKey === 'rover' || metricKey === 'rover_status') {
      const spdThresh = window.AnalyticsEngine?.thresholds.speed;
      const tiltThresh = window.AnalyticsEngine?.thresholds.tilt;
      if (thresholdDesc) {
        thresholdDesc.innerHTML = `
          <span>Speed Limit: Warn &gt; ${spdThresh?.warning || 1.0} m/s | Crit &gt; ${spdThresh?.critical || 1.8} m/s</span> &bull; 
          <span>Tilt Limit: Warn &gt; ${tiltThresh?.warning || 20}° | Crit &gt; ${tiltThresh?.critical || 35}°</span>
        `;
      }
    } else {
      const thresh = window.AnalyticsEngine?.thresholds[metricKey];
      if (thresholdDesc && thresh) {
        thresholdDesc.innerHTML = `Reference Limits: <span class="tag-warn">WARN &gt; ${thresh.warning} ${thresh.unit || ''}</span> <span class="tag-crit">CRIT &gt; ${thresh.critical} ${thresh.unit || ''}</span>`;
      }
    }

    if (modal) {
      modal.classList.add('active');
    }

    this._startGraphRenderLoop();
    if (window.TacticalAudio) window.TacticalAudio.playClick();
  }

  closeGraph() {
    const modal = document.getElementById('graph-modal');
    if (modal) modal.classList.remove('active');
    if (this.graphAnimId) {
      cancelAnimationFrame(this.graphAnimId);
      this.graphAnimId = null;
    }
    this.activeGraphMetric = null;
    if (window.TacticalAudio) window.TacticalAudio.playClick();
  }

  _initGraphDrawer() {
    this.graphCanvas = document.getElementById('time-series-canvas');
    if (this.graphCanvas) {
      this.graphCtx = this.graphCanvas.getContext('2d');
    }

    const closeBtn = document.getElementById('close-graph-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeGraph());

    const timeBtns = document.querySelectorAll('.time-scale-btn');
    timeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        timeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.graphTimeWindow = parseInt(btn.getAttribute('data-window'), 10) || 60000;
      });
    });
  }

  _startGraphRenderLoop() {
    const render = () => {
      if (!this.activeGraphMetric || !this.graphCanvas) return;
      this._renderTimeSeriesChart();
      this.graphAnimId = requestAnimationFrame(render);
    };
    if (this.graphAnimId) cancelAnimationFrame(this.graphAnimId);
    this.graphAnimId = requestAnimationFrame(render);
  }

  _renderTimeSeriesChart() {
    const canvas = this.graphCanvas;
    const ctx = this.graphCtx;
    const metric = this.activeGraphMetric;
    const w = canvas.width;
    const h = canvas.height;

    // Background CAD fill
    ctx.fillStyle = '#080c12';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e2838';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const now = Date.now();
    const startTime = now - this.graphTimeWindow;

    // DUAL-SERIES ROVER IMU GRAPH
    if (metric === 'rover' || metric === 'rover_status') {
      const speedHist = (window.Telemetry?.history.speed || []).filter(p => p.t >= startTime);
      const tiltHist = (window.Telemetry?.history.tilt || []).filter(p => p.t >= startTime);

      if (speedHist.length < 2 && tiltHist.length < 2) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AWAITING LOGGED IMU SPEED & TILT SENSOR DATA...', w / 2, h / 2);
        ctx.textAlign = 'left';
        return;
      }

      const padTop = 35;
      const padBottom = 35;
      const chartH = h - padTop - padBottom;
      const getX = (time) => ((time - startTime) / this.graphTimeWindow) * (w - 100) + 60;

      // Draw Speed (Amber, 0 to 2.5 m/s)
      const maxSpeed = 2.5;
      const getSpeedY = (val) => padTop + chartH - (Math.min(maxSpeed, Math.max(0, val)) / maxSpeed) * chartH;

      if (speedHist.length > 1) {
        ctx.beginPath();
        speedHist.forEach((p, idx) => {
          const x = getX(p.t);
          const y = getSpeedY(p.v);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw Tilt (Cyan, 0 to 45 deg)
      const maxTilt = 45;
      const getTiltY = (val) => padTop + chartH - (Math.min(maxTilt, Math.max(0, Math.abs(val))) / maxTilt) * chartH;

      if (tiltHist.length > 1) {
        ctx.beginPath();
        tiltHist.forEach((p, idx) => {
          const x = getX(p.t);
          const y = getTiltY(p.v);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Legend
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('— Linear Speed (m/s)', 70, 22);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('— Tilt Angle (°)', 270, 22);

      // Y-axis ticks
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(`2.5 m/s`, 10, padTop + 5);
      ctx.fillText(`0.0 m/s`, 10, h - padBottom);
      ctx.fillText(`45°`, w - 35, padTop + 5);
      ctx.fillText(`0°`, w - 30, h - padBottom);
      return;
    }

    // SINGLE SERIES STANDARD GRAPH
    const history = (window.Telemetry?.history[metric] || []).filter(p => p.t >= startTime);
    const thresh = window.AnalyticsEngine?.thresholds[metric];

    if (history.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AWAITING LOGGED HARDWARE TELEMETRY PACKETS...', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    let minY = Math.min(...history.map(p => p.v));
    let maxY = Math.max(...history.map(p => p.v));
    if (thresh) {
      maxY = Math.max(maxY, thresh.critical * 1.15);
      minY = Math.min(minY, 0);
    }
    if (maxY === minY) maxY += 10;
    const rangeY = maxY - minY;

    const padTop = 30;
    const padBottom = 30;
    const chartH = h - padTop - padBottom;

    const getY = (val) => padTop + chartH - ((val - minY) / rangeY) * chartH;
    const getX = (time) => ((time - startTime) / this.graphTimeWindow) * (w - 80) + 60;

    // Draw Threshold reference lines
    if (thresh) {
      const critY = getY(thresh.critical);
      if (critY >= padTop && critY <= h - padBottom) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(60, critY); ctx.lineTo(w - 20, critY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f87171';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillText(`CRIT (${thresh.critical})`, w - 100, critY - 4);
      }

      const warnY = getY(thresh.warning);
      if (warnY >= padTop && warnY <= h - padBottom) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(60, warnY); ctx.lineTo(w - 20, warnY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillText(`WARN (${thresh.warning})`, w - 100, warnY - 4);
      }
    }

    // Draw Telemetry Waveform Line & Gradient Area
    ctx.beginPath();
    history.forEach((p, idx) => {
      const x = getX(p.t);
      const y = getY(p.v);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (history.length > 1) {
      const firstX = getX(history[0].t);
      const lastX = getX(history[history.length - 1].t);
      const bottomY = getY(minY);

      ctx.lineTo(lastX, bottomY);
      ctx.lineTo(firstX, bottomY);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
      grad.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    const lastPoint = history[history.length - 1];
    const lx = getX(lastPoint.t);
    const ly = getY(lastPoint.v);
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`${Math.round(maxY)}`, 8, padTop + 5);
    ctx.fillText(`${Math.round(minY)}`, 8, h - padBottom);
  }

  /**
   * Modal Management
   */
  _initModals() {
    // Thresholds Modal
    const threshBtn = document.getElementById('thresholds-config-btn');
    const threshModal = document.getElementById('thresholds-modal');
    const closeThresh = document.getElementById('close-thresholds-btn');
    if (threshBtn && threshModal) {
      threshBtn.addEventListener('click', () => threshModal.classList.add('active'));
    }
    if (closeThresh && threshModal) {
      closeThresh.addEventListener('click', () => threshModal.classList.remove('active'));
    }

    // "Why this score?" Breakdown Modal
    const whyScoreBtn = document.getElementById('why-score-btn');
    const whyScoreModal = document.getElementById('readiness-modal');
    const closeWhy = document.getElementById('close-readiness-btn');
    if (whyScoreBtn && whyScoreModal) {
      whyScoreBtn.addEventListener('click', () => whyScoreModal.classList.add('active'));
    }
    if (closeWhy && whyScoreModal) {
      closeWhy.addEventListener('click', () => whyScoreModal.classList.remove('active'));
    }

    // Hazard Matrix Info Modal
    const hazInfoBtn = document.getElementById('hazard-info-btn');
    const hazInfoModal = document.getElementById('hazard-info-modal');
    const closeHaz = document.getElementById('close-hazard-info-btn');
    if (hazInfoBtn && hazInfoModal) {
      hazInfoBtn.addEventListener('click', () => hazInfoModal.classList.add('active'));
    }
    if (closeHaz && hazInfoModal) {
      closeHaz.addEventListener('click', () => hazInfoModal.classList.remove('active'));
    }

    // Close on backdrop click
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
      });
    });
  }

  /**
   * Rover Warning Toast in Bottom-Right Corner
   */
  showRoverWarningToast(message) {
    let toast = document.getElementById('rover-warning-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rover-warning-toast';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `
      ${window.renderIcon('alertTriangle', 18)}
      <span>${message}</span>
    `;
    toast.classList.add('active');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.hideRoverWarningToast();
    }, 6000);
  }

  hideRoverWarningToast() {
    const toast = document.getElementById('rover-warning-toast');
    if (toast) toast.classList.remove('active');
  }

  /**
   * Timeline Filters & Actions
   */
  _initTimelineFilters() {
    const filterBtns = document.querySelectorAll('.timeline-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.getAttribute('data-filter');
        this.renderTimeline(cat);
      });
    });

    const exportBtn = document.getElementById('export-json-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => window.Telemetry.exportEventsJSON());
    }

    const clearBtn = document.getElementById('clear-timeline-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear local system event timeline?')) {
          window.Telemetry.clearEvents();
          this.renderTimeline();
        }
      });
    }
  }

  renderTimeline(category = 'ALL') {
    const container = document.getElementById('event-timeline-list');
    if (!container) return;

    const events = window.Telemetry.getFilteredEvents(category);

    if (events.length === 0) {
      container.innerHTML = `
        <div class="timeline-empty-state">
          ${window.renderIcon('checkCircle', 20)}
          <span>No ${category === 'ALL' ? 'operational' : category.toLowerCase()} events logged yet.</span>
        </div>
      `;
      return;
    }

    let html = '';
    events.slice(0, 40).forEach(evt => {
      const timeStr = new Date(evt.timestamp).toTimeString().substring(0, 8);
      const sevClass = evt.severity.toLowerCase();

      html += `
        <div class="timeline-entry sev-${sevClass}">
          <div class="entry-meta">
            <span class="entry-time">[${timeStr}]</span>
          </div>
          <div class="entry-body">
            <span class="status-tag tag-${sevClass === 'critical' ? 'crit' : (sevClass === 'warning' ? 'warn' : (sevClass === 'success' ? 'safe' : 'muted'))}">
              ${evt.category}
            </span>
            <span class="entry-msg">${evt.message}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Keyboard Shortcuts
   */
  _initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      const key = e.key.toUpperCase();
      if (key === '1') {
        document.getElementById('tab-live-btn')?.click();
      } else if (key === '2') {
        document.getElementById('tab-sim-btn')?.click();
      } else if (key === 'C') {
        document.getElementById('connect-hw-btn')?.click();
      } else if (key === 'T') {
        document.getElementById('thresholds-config-btn')?.click();
      } else if (key === 'G') {
        this.openGraph(this.activeGraphMetric || 'gas');
      } else if (key === 'M') {
        document.getElementById('audio-mute-btn')?.click();
      } else if (key === 'ESCAPE') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        this.closeGraph();
      }
    });
  }
}

window.UI = new UIController();

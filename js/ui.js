/**
 * SCADA Industrial UI Controller & High-Performance Canvas Chart Engine
 * Handles modals, drawers, time-series canvas graphs, micro-interactions, and keyboard hotkeys.
 */
class UIController {
  constructor() {
    this.activeGraphMetric = null;
    this.graphAnimId = null;
    this.graphTimeWindow = 60000; // 60s default
    this.graphCanvas = null;
    this.graphCtx = null;
  }

  init() {
    this._initModals();
    this._initGraphDrawer();
    this._initTimelineFilters();
    this._initKeyboardShortcuts();
    this._initTooltips();
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
      gas: 'Toxic & Flammable Gas Telemetry (CH₄ / LPG / Smoke)',
      co: 'Carbon Monoxide (CO) Concentration Stream',
      co2: 'Carbon Dioxide (CO₂) Atmospheric Level',
      temp: 'Subterranean Ambient Temperature',
      humidity: 'Relative Atmospheric Humidity',
      water: 'Adit Flood & Inundation Depth',
      obstacle: 'Forward Ultrasonic Obstacle Clearance'
    };

    if (title) title.innerText = titles[metricKey] || metricKey.toUpperCase();
    
    const thresh = window.AnalyticsEngine?.thresholds[metricKey];
    if (thresholdDesc && thresh) {
      thresholdDesc.innerHTML = `Reference Thresholds: <span class="tag-warn">WARN: > ${thresh.warning} ${thresh.unit || ''}</span> <span class="tag-crit">CRIT: > ${thresh.critical} ${thresh.unit || ''}</span>`;
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
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e2632';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const history = window.Telemetry?.history[metric] || [];
    const thresh = window.AnalyticsEngine?.thresholds[metric];
    const stats = window.Telemetry?.getMetricStats(metric, this.graphTimeWindow);

    // Update stat readouts in UI
    const statMin = document.getElementById('graph-stat-min');
    const statMax = document.getElementById('graph-stat-max');
    const statAvg = document.getElementById('graph-stat-avg');
    const statTrend = document.getElementById('graph-stat-trend');
    if (statMin) statMin.innerText = `${stats.min}`;
    if (statMax) statMax.innerText = `${stats.max}`;
    if (statAvg) statAvg.innerText = `${stats.avg}`;
    if (statTrend) statTrend.innerText = stats.trend;

    if (history.length < 2) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AWAITING LOGGED TELEMETRY PACKETS...', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const now = Date.now();
    const startTime = now - this.graphTimeWindow;
    const visiblePoints = history.filter(p => p.t >= startTime);

    if (visiblePoints.length === 0) return;

    // Calculate Y-scale bounds
    let minY = Math.min(...visiblePoints.map(p => p.v));
    let maxY = Math.max(...visiblePoints.map(p => p.v));
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
    const getX = (time) => ((time - startTime) / this.graphTimeWindow) * (w - 70) + 50;

    // Draw Threshold reference lines
    if (thresh) {
      // Critical line
      const critY = getY(thresh.critical);
      if (critY >= padTop && critY <= h - padBottom) {
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(50, critY); ctx.lineTo(w - 20, critY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f87171';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`CRIT (${thresh.critical})`, w - 100, critY - 4);
      }

      // Warning line
      const warnY = getY(thresh.warning);
      if (warnY >= padTop && warnY <= h - padBottom) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(50, warnY); ctx.lineTo(w - 20, warnY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`WARN (${thresh.warning})`, w - 100, warnY - 4);
      }
    }

    // Draw Telemetry Line & Gradient Area
    ctx.beginPath();
    visiblePoints.forEach((p, idx) => {
      const x = getX(p.t);
      const y = getY(p.v);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Fill under curve
    if (visiblePoints.length > 1) {
      const firstX = getX(visiblePoints[0].t);
      const lastX = getX(visiblePoints[visiblePoints.length - 1].t);
      const bottomY = getY(minY);

      ctx.lineTo(lastX, bottomY);
      ctx.lineTo(firstX, bottomY);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
      grad.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Draw active point glowing dot at end
    const lastPoint = visiblePoints[visiblePoints.length - 1];
    const lx = getX(lastPoint.t);
    const ly = getY(lastPoint.v);
    ctx.beginPath();
    ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${Math.round(maxY)}`, 8, padTop + 5);
    ctx.fillText(`${Math.round(minY)}`, 8, h - padBottom);
  }

  /**
   * Modal Management
   */
  _initModals() {
    // Hardware Connection Modal
    const hwBtn = document.getElementById('connect-hw-btn');
    const hwModal = document.getElementById('hw-modal');
    const closeHw = document.getElementById('close-hw-btn');
    if (hwBtn && hwModal) {
      hwBtn.addEventListener('click', () => hwModal.classList.add('active'));
    }
    if (closeHw && hwModal) {
      closeHw.addEventListener('click', () => hwModal.classList.remove('active'));
    }

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
    const infoHazardBtn = document.getElementById('hazard-info-btn');
    const hazardModal = document.getElementById('hazard-info-modal');
    const closeHazard = document.getElementById('close-hazard-info-btn');
    if (infoHazardBtn && hazardModal) {
      infoHazardBtn.addEventListener('click', () => hazardModal.classList.add('active'));
    }
    if (closeHazard && hazardModal) {
      closeHazard.addEventListener('click', () => hazardModal.classList.remove('active'));
    }

    // Raw Terminal Drawer Toggle
    const termToggleBtn = document.getElementById('toggle-terminal-btn');
    const termDrawer = document.getElementById('serial-terminal-drawer');
    if (termToggleBtn && termDrawer) {
      termToggleBtn.addEventListener('click', () => {
        termDrawer.classList.toggle('collapsed');
      });
    }

    // Audio Mute Button
    const audioBtn = document.getElementById('audio-mute-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const isMuted = window.TacticalAudio?.toggleMute();
        this._updateAudioBtnUI(audioBtn, isMuted);
      });
      this._updateAudioBtnUI(audioBtn, window.TacticalAudio?.isMuted);
    }
  }

  _updateAudioBtnUI(btn, isMuted) {
    if (!btn) return;
    if (isMuted) {
      btn.innerHTML = `${window.renderIcon('volumeX', 14)} <span class="hotkey-label">Muted</span>`;
      btn.classList.add('muted');
    } else {
      btn.innerHTML = `${window.renderIcon('volume2', 14)} <span class="hotkey-label">Audio ON</span>`;
      btn.classList.remove('muted');
    }
  }

  _initTimelineFilters() {
    const filterBtns = document.querySelectorAll('.timeline-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        this.renderTimeline(filter === 'ALL' ? null : filter);
      });
    });

    const clearBtn = document.getElementById('clear-timeline-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear local event timeline log?')) {
          window.Telemetry?.clearEvents();
          this.renderTimeline();
        }
      });
    }

    const exportBtn = document.getElementById('export-json-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = window.Telemetry?.exportJSON();
        this._downloadFile(`mine_rescue_mission_log_${Date.now()}.json`, json, 'application/json');
      });
    }
  }

  _downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  renderTimeline(filterType = null) {
    const container = document.getElementById('event-timeline-list');
    if (!container) return;

    const events = window.Telemetry?.getEvents(filterType) || [];
    if (events.length === 0) {
      container.innerHTML = `
        <div class="timeline-empty-state">
          ${window.renderIcon('terminal', 18)}
          <span>No event records matching current filter.</span>
        </div>
      `;
      return;
    }

    let html = '';
    events.slice(0, 100).forEach(evt => {
      const timeStr = new Date(evt.timestamp).toTimeString().substring(0, 8);
      const sevClass = `sev-${evt.severity.toLowerCase()}`;
      
      let iconName = 'activity';
      if (evt.type === 'HAZARD') iconName = 'alertTriangle';
      else if (evt.type === 'PERSON_DETECTION') iconName = 'user';
      else if (evt.type === 'HARDWARE') iconName = 'cpu';
      else if (evt.type === 'SYSTEM') iconName = 'shieldCheck';

      html += `
        <div class="timeline-entry ${sevClass}">
          <div class="entry-stripe"></div>
          <div class="entry-meta">
            <span class="entry-time">${timeStr}</span>
            <span class="entry-tag tag-${evt.severity.toLowerCase()}">${evt.type}</span>
          </div>
          <div class="entry-body">
            <span class="entry-icon">${window.renderIcon(iconName, 14)}</span>
            <span class="entry-msg">${evt.message}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  _initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === '1') {
        document.getElementById('tab-live-btn')?.click();
      } else if (e.key === '2') {
        document.getElementById('tab-sim-btn')?.click();
      } else if (e.key === 'c' || e.key === 'C') {
        document.getElementById('connect-hw-btn')?.click();
      } else if (e.key === 'g' || e.key === 'G') {
        if (this.activeGraphMetric) this.closeGraph();
        else this.openGraph('gas');
      } else if (e.key === 'm' || e.key === 'M') {
        document.getElementById('audio-mute-btn')?.click();
      } else if (e.key === 'd' || e.key === 'D') {
        document.getElementById('demo-mode-toggle')?.click();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        this.closeGraph();
      }
    });
  }

  _initTooltips() {
    // Custom non-intrusive tooltip handlers if needed
  }
}

window.UI = new UIController();

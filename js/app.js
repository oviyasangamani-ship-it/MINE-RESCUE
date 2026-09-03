/**
 * Application Bootstrap & Telemetry Orchestrator (v4)
 * Coordinates Hardware, Vision, Analytics, IMU Rover Status, UI, and Simulator.
 */
class AppOrchestrator {
  constructor() {
    this.activeTab = 'live'; // 'live' | 'simulator'
    this.startTime = Date.now();
    this.lastPacketPulseTime = 0;
    this.lastRoverWarnTime = 0;
  }

  async init() {
    console.log('[Mining Rescue Rover] Initializing Tactical SCADA Console...');

    // 1. Initialize UI & Audio
    window.UI.init();

    // 2. Initialize Video Subsystem (ESP32-CAM default standby)
    const videoElem = document.getElementById('camera-video-elem');
    const canvasElem = document.getElementById('camera-canvas-elem');
    if (videoElem && canvasElem) {
      await window.VisionSystem.init(videoElem, canvasElem);
    }

    // 3. Initialize Simulator on Page 2
    const simContainer = document.getElementById('simulator-map-container');
    if (simContainer) {
      window.RescueSimulator.init(simContainer);
    }

    // 4. Setup Event Listeners & Hardware Subscriptions
    this._bindHardwareEvents();
    this._bindTelemetryUpdates();
    this._bindNavigationTabs();
    this._bindVideoControls();
    this._bindThresholdForm();
    this._bindSimulatorControls();

    // 5. Start Clocks & Heartbeat Loop
    this._startClocks();

    // 6. Initial State Render (Ground Truth: Disconnected)
    window.Telemetry.setAwaitingConnection();
    this._renderLiveDashboard(window.Telemetry.current);
    window.UI.renderTimeline();

    window.Telemetry.logEvent('SYSTEM', 'Mining Rescue Rover Subsystem Online (Ground-Truth SCADA Mode)', 'INFO');
  }

  /**
   * Hardware Stream Subscriptions
   */
  _bindHardwareEvents() {
    window.HardwareManager.onData((parsedData, rawLine) => {
      this.lastPacketPulseTime = Date.now();
      window.Telemetry.update(parsedData);
      this._pulseTelemetryScanline();
    });

    window.HardwareManager.onStatusChange((newStatus, prevStatus) => {
      this._updateHardwareStatusBadge(newStatus);
      window.UI.updateConnectButtonUI();

      if (newStatus === 'DISCONNECTED') {
        window.Telemetry.setAwaitingConnection();
        window.Telemetry.logEvent('HARDWARE', 'Rover communication link disconnected.', 'WARNING');
      } else if (newStatus === 'CONNECTED') {
        window.Telemetry.logEvent('HARDWARE', 'Rover communication link established.', 'SUCCESS');
      } else if (newStatus === 'STALE') {
        window.Telemetry.logEvent('HARDWARE', 'Warning: Telemetry packet stream is stale (>3.5s latency).', 'WARNING');
      }
    });
  }

  /**
   * Telemetry Store Updates
   */
  _bindTelemetryUpdates() {
    window.Telemetry.subscribe((telemetry, history) => {
      this._renderLiveDashboard(telemetry);
    });

    window.Telemetry.onEvent(() => {
      window.UI.renderTimeline();
    });
  }

  /**
   * Render Page 1 (Live Rescue Monitor)
   */
  _renderLiveDashboard(telemetry) {
    const hwStatus = window.HardwareManager.status;
    const isDisconnected = (hwStatus === 'DISCONNECTED');

    // 1. Evaluate Multi-Criteria Hazard Assessment
    const hazard = window.AnalyticsEngine.evaluateHazards(telemetry, hwStatus);
    this._renderHazardAssessment(hazard);

    // 2. Evaluate Rescue Operational Readiness
    const personInView = window.VisionSystem.personDetected;
    const camActive = window.VisionSystem.isStreaming;
    const readiness = window.AnalyticsEngine.calculateReadiness(telemetry, hwStatus, personInView, camActive);
    this._renderReadinessScore(readiness);

    // 3. Render 6 Consolidated Sensor Readout Cards
    this._renderSensorCards(telemetry, isDisconnected);
  }

  /**
   * Render 6 Consolidated Sensor Cards
   */
  _renderSensorCards(t, isDisconnected) {
    // 1. Toxic Gases Consolidated Card
    const gasValElem = document.getElementById('val-gas');
    const gasBadgeElem = document.getElementById('badge-gas');
    const gasCardElem = document.getElementById('card-gas');
    const gasCoSubElem = document.getElementById('sub-val-co');
    const gasCo2SubElem = document.getElementById('sub-val-co2');

    if (isDisconnected || t.gas === null || t.gas === undefined) {
      if (gasValElem) { gasValElem.innerText = '—'; gasValElem.className = 'sensor-val muted'; }
      if (gasBadgeElem) { gasBadgeElem.className = 'status-tag tag-muted'; gasBadgeElem.innerText = 'Not connected'; }
      if (gasCardElem) gasCardElem.className = 'sensor-card card-gas state-muted';
      if (gasCoSubElem) gasCoSubElem.innerText = '—';
      if (gasCo2SubElem) gasCo2SubElem.innerText = '—';
    } else {
      if (gasValElem) { gasValElem.innerText = `${t.gas} ppm`; gasValElem.className = 'sensor-val active'; }
      if (gasCoSubElem) gasCoSubElem.innerText = `${t.co} ppm`;
      if (gasCo2SubElem) gasCo2SubElem.innerText = `${t.co2} ppm`;

      const gasStatus = window.AnalyticsEngine.getConsolidatedGasStatus(t.gas, t.co, t.co2);
      if (gasBadgeElem) {
        gasBadgeElem.className = `status-tag tag-${gasStatus.status.toLowerCase()}`;
        gasBadgeElem.innerText = gasStatus.label;
      }
      if (gasCardElem) {
        gasCardElem.className = `sensor-card card-gas state-${gasStatus.status.toLowerCase()}`;
      }

      if (gasStatus.status === 'CRITICAL') {
        window.TacticalAudio?.playCriticalAlarm();
      }
    }

    // 2. Temperature, Humidity, Water Level, Obstacle Cards
    const standardCards = [
      { key: 'temp', val: t.temp !== null ? t.temp.toFixed(1) : null, unit: '°C', cardClass: 'card-temp' },
      { key: 'humidity', val: t.humidity !== null ? t.humidity.toFixed(0) : null, unit: '%RH', cardClass: 'card-hum' },
      { key: 'water', val: t.water, unit: 'mm', cardClass: 'card-water' },
      { key: 'obstacle', val: t.obstacle, unit: 'cm', cardClass: 'card-obst' }
    ];

    standardCards.forEach(c => {
      const valElem = document.getElementById(`val-${c.key}`);
      const badgeElem = document.getElementById(`badge-${c.key}`);
      const cardElem = document.getElementById(`card-${c.key}`);

      if (!valElem || !badgeElem) return;

      if (isDisconnected || c.val === null || c.val === undefined) {
        valElem.innerText = '—';
        valElem.className = 'sensor-val muted';
        badgeElem.className = 'status-tag tag-muted';
        badgeElem.innerText = 'Not connected';
        if (cardElem) cardElem.className = `sensor-card ${c.cardClass} state-muted`;
      } else {
        valElem.innerText = `${c.val} ${c.unit}`;
        valElem.className = 'sensor-val active';
        
        const status = window.AnalyticsEngine.getMetricStatus(c.key, parseFloat(c.val));
        badgeElem.className = `status-tag tag-${status.status.toLowerCase()}`;
        badgeElem.innerText = status.label;

        if (cardElem) {
          cardElem.className = `sensor-card ${c.cardClass} state-${status.status.toLowerCase()}`;
        }
      }
    });

    // 3. Rover Status Card (IMU Speed & Tilt Monitoring)
    this._renderRoverStatusCard(t, isDisconnected);
  }

  /**
   * Render Rover Status Card with IMU Speed, Tilt, and Bottom-Right Warning
   */
  _renderRoverStatusCard(t, isDisconnected) {
    const badgeElem = document.getElementById('badge-rover_status');
    const cardElem = document.getElementById('card-rover_status');
    const speedValElem = document.getElementById('rover-val-speed');
    const tiltValElem = document.getElementById('rover-val-tilt');
    const warnIconElem = document.getElementById('rover-card-warn-icon');

    if (isDisconnected || t.speed === null || t.speed === undefined) {
      if (speedValElem) { speedValElem.innerText = '—'; speedValElem.className = 'metric-val muted'; }
      if (tiltValElem) { tiltValElem.innerText = '—'; tiltValElem.className = 'metric-val muted'; }
      if (badgeElem) { badgeElem.className = 'status-tag tag-muted'; badgeElem.innerText = 'Not connected'; }
      if (cardElem) cardElem.className = 'sensor-card card-rover state-muted';
      if (warnIconElem) warnIconElem.classList.remove('active');
      window.UI.hideRoverWarningToast();
      return;
    }

    const speedStr = `${parseFloat(t.speed).toFixed(2)} m/s`;
    const tiltStr = `${Math.abs(parseFloat(t.tilt)).toFixed(1)}°`;

    if (speedValElem) { speedValElem.innerText = speedStr; speedValElem.className = 'metric-val'; }
    if (tiltValElem) { tiltValElem.innerText = tiltStr; tiltValElem.className = 'metric-val'; }

    // Evaluate IMU threshold conditions
    const imuStatus = window.AnalyticsEngine.evaluateRoverIMU(t.speed, t.tilt);

    if (imuStatus.hasWarning) {
      if (badgeElem) {
        badgeElem.className = `status-tag tag-${imuStatus.status.toLowerCase()}`;
        badgeElem.innerText = imuStatus.warningType === 'BOTH' ? 'CRITICAL IMU' : `${imuStatus.warningType} WARN`;
      }
      if (cardElem) {
        cardElem.className = `sensor-card card-rover state-${imuStatus.status.toLowerCase()}`;
      }

      // Show small yellow warning icon in bottom-right of Rover Status card
      if (warnIconElem) warnIconElem.classList.add('active');

      // Show popup toast in bottom-right of webpage
      window.UI.showRoverWarningToast(imuStatus.message);

      // Rate-limited timeline log (once every 10s per condition)
      const now = Date.now();
      if (now - this.lastRoverWarnTime > 10000) {
        window.Telemetry.logEvent('ROVER', imuStatus.message, imuStatus.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING');
        this.lastRoverWarnTime = now;
      }
    } else {
      if (badgeElem) {
        badgeElem.className = 'status-tag tag-safe';
        badgeElem.innerText = 'NORMAL';
      }
      if (cardElem) {
        cardElem.className = 'sensor-card card-rover state-safe';
      }
      if (warnIconElem) warnIconElem.classList.remove('active');
      window.UI.hideRoverWarningToast();
    }
  }

  /**
   * Render Consolidated Hazard Assessment
   */
  _renderHazardAssessment(hazard) {
    const hazardList = document.getElementById('active-hazards-list');
    const actionText = document.getElementById('hazard-recommended-action');
    const container = document.getElementById('hazard-assessment-panel');

    if (actionText) {
      actionText.innerText = hazard.primaryAction;
    }

    if (container) {
      container.className = `tactical-panel panel-earth panel-hazard hazard-${hazard.level.toLowerCase()}`;
    }

    if (hazardList) {
      if (hazard.activeHazards.length === 0) {
        hazardList.innerHTML = `
          <div class="no-hazards-notice">
            ${window.renderIcon('checkCircle', 18, 'text-safe')}
            <span>${hazard.isDisconnected ? 'Connect rover hardware to evaluate live atmospheric hazards.' : 'Atmospheric conditions nominal across all safety parameters.'}</span>
          </div>
        `;
      } else {
        let html = '';
        hazard.activeHazards.forEach(h => {
          html += `
            <div class="hazard-item-chip chip-${h.severity.toLowerCase()}">
              <span class="chip-icon">${window.renderIcon('alertTriangle', 16)}</span>
              <div class="chip-content">
                <strong>${h.title}</strong>
                <span>${h.description}</span>
              </div>
            </div>
          `;
        });
        hazardList.innerHTML = html;
      }
    }
  }

  /**
   * Render Rescue Operational Readiness Panel
   */
  _renderReadinessScore(readiness) {
    const scoreVal = document.getElementById('readiness-score-val');
    const scoreStatus = document.getElementById('readiness-status-badge');
    const scoreBar = document.getElementById('readiness-progress-fill');

    if (scoreVal) {
      scoreVal.innerText = readiness.score !== null ? `${readiness.score}%` : '— %';
    }

    if (scoreStatus) {
      scoreStatus.className = `status-tag tag-${readiness.status.toLowerCase().replace(/[^a-z]/g, '')}`;
      scoreStatus.innerText = readiness.status;
    }

    if (scoreBar) {
      scoreBar.style.width = readiness.score !== null ? `${readiness.score}%` : '0%';
      if (readiness.score === null) scoreBar.style.backgroundColor = 'var(--status-muted)';
      else if (readiness.score < 45) scoreBar.style.backgroundColor = 'var(--status-critical)';
      else if (readiness.score < 75) scoreBar.style.backgroundColor = 'var(--status-warning)';
      else scoreBar.style.backgroundColor = 'var(--status-safe)';
    }

    // Populate "Why this score?" breakdown modal
    const breakdownList = document.getElementById('readiness-factors-list');
    if (breakdownList && readiness.factors) {
      let html = '';
      readiness.factors.forEach(f => {
        html += `
          <div class="factor-row factor-${f.status.toLowerCase()}">
            <div class="factor-header">
              <span class="factor-name">${f.name}</span>
              <span class="factor-penalty">${f.penalty}</span>
            </div>
            <div class="factor-detail">
              <span class="factor-weight">Weight: ${f.weight}</span>
              <span class="factor-msg">${f.detail}</span>
            </div>
          </div>
        `;
      });
      breakdownList.innerHTML = html;
    }
  }

  /**
   * Navigation Tabs (Page 1 vs Page 2)
   */
  _bindNavigationTabs() {
    const liveBtn = document.getElementById('tab-live-btn');
    const simBtn = document.getElementById('tab-sim-btn');
    const liveView = document.getElementById('view-live-monitor');
    const simView = document.getElementById('view-simulator');

    if (liveBtn && simBtn && liveView && simView) {
      liveBtn.addEventListener('click', () => {
        liveBtn.classList.add('active');
        simBtn.classList.remove('active');
        liveView.classList.remove('hidden');
        simView.classList.add('hidden');
        this.activeTab = 'live';
        window.TacticalAudio?.playClick();
      });

      simBtn.addEventListener('click', () => {
        simBtn.classList.add('active');
        liveBtn.classList.remove('active');
        simView.classList.remove('hidden');
        liveView.classList.add('hidden');
        this.activeTab = 'simulator';
        window.TacticalAudio?.playClick();
      });
    }
  }

  /**
   * Single Video Panel Controls: ROVER CAM vs PC CAM Switcher
   */
  _bindVideoControls() {
    const srcSelect = document.getElementById('camera-source-select');
    const urlInput = document.getElementById('esp32-cam-url-input');
    const snapBtn = document.getElementById('camera-snapshot-btn');

    if (srcSelect) {
      srcSelect.addEventListener('change', () => {
        const source = srcSelect.value;
        const url = urlInput ? urlInput.value.trim() : null;
        window.VisionSystem.setSource(source, url);
        window.TacticalAudio?.playClick();
      });
    }

    if (snapBtn) {
      snapBtn.addEventListener('click', () => {
        window.VisionSystem.takeSnapshot();
        window.TacticalAudio?.playClick();
      });
    }
  }

  /**
   * Thresholds Settings Form & View Graph Triggers
   */
  _bindThresholdForm() {
    const form = document.getElementById('thresholds-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const updated = {
          gas: { warning: parseFloat(document.getElementById('th-gas-warn').value), critical: parseFloat(document.getElementById('th-gas-crit').value), unit: 'ppm' },
          co: { warning: parseFloat(document.getElementById('th-co-warn').value), critical: parseFloat(document.getElementById('th-co-crit').value), unit: 'ppm' },
          co2: { warning: parseFloat(document.getElementById('th-co2-warn').value), critical: parseFloat(document.getElementById('th-co2-crit').value), unit: 'ppm' },
          temp: { warning: parseFloat(document.getElementById('th-temp-warn').value), critical: parseFloat(document.getElementById('th-temp-crit').value), unit: '°C' },
          humidity: { warning: parseFloat(document.getElementById('th-hum-warn').value), critical: parseFloat(document.getElementById('th-hum-crit').value), unit: '%RH' },
          water: { warning: parseFloat(document.getElementById('th-water-warn').value), critical: parseFloat(document.getElementById('th-water-crit').value), unit: 'mm' },
          obstacle: { warning: parseFloat(document.getElementById('th-obst-warn').value), critical: parseFloat(document.getElementById('th-obst-crit').value), unit: 'cm' }
        };

        window.AnalyticsEngine.saveThresholds(updated);
        document.getElementById('thresholds-modal')?.classList.remove('active');
        this._renderLiveDashboard(window.Telemetry.current);
        window.Telemetry.logEvent('SYSTEM', 'Reference safety thresholds reconfigured.', 'INFO');
      });
    }

    // Attach "View Graph" triggers to all cards including Rover Status
    document.querySelectorAll('.btn-view-graph').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const metric = btn.getAttribute('data-metric');
        window.UI.openGraph(metric);
      });
    });

    // Also clicking any sensor card body opens its graph
    document.querySelectorAll('.sensor-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Ignore if clicked on button directly
        const graphBtn = card.querySelector('.btn-view-graph');
        if (graphBtn) {
          const metric = graphBtn.getAttribute('data-metric');
          if (metric) window.UI.openGraph(metric);
        }
      });
    });
  }

  /**
   * Page 2 Simulator Controls
   */
  _bindSimulatorControls() {
    document.querySelectorAll('.sim-scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sim-scenario-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sc = btn.getAttribute('data-scenario');
        window.RescueSimulator.setScenario(sc);
        window.TacticalAudio?.playClick();
      });
    });

    const sliders = ['gas', 'co', 'temp', 'humidity', 'water', 'obstacle'];
    sliders.forEach(s => {
      const slider = document.getElementById(`sim-slider-${s}`);
      const readout = document.getElementById(`sim-val-${s}`);
      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          if (readout) readout.innerText = val;
          window.RescueSimulator.updateSlider(s, val);
        });
      }
    });

    window.RescueSimulator.subscribe((params, rover, events) => {
      this._renderSimulatedTelemetry(params);
      this._renderSimulatedTimeline(events);
    });
  }

  _renderSimulatedTelemetry(params) {
    const hazard = window.AnalyticsEngine.evaluateHazards(params, 'CONNECTED');
    const readiness = window.AnalyticsEngine.calculateReadiness(params, 'CONNECTED', params.personDetected, true);

    const scoreElem = document.getElementById('sim-readiness-val');
    const hazardElem = document.getElementById('sim-hazard-val');
    const actionElem = document.getElementById('sim-action-val');

    if (scoreElem) scoreElem.innerText = `${readiness.score}%`;
    if (hazardElem) {
      hazardElem.innerText = hazard.levelLabel;
      hazardElem.className = `status-tag tag-${hazard.level.toLowerCase()}`;
    }
    if (actionElem) actionElem.innerText = hazard.primaryAction;
  }

  _renderSimulatedTimeline(events) {
    const container = document.getElementById('sim-event-list');
    if (!container) return;

    let html = '';
    events.slice(0, 30).forEach(evt => {
      const timeStr = new Date(evt.timestamp).toTimeString().substring(0, 8);
      html += `
        <div class="timeline-entry sev-${evt.severity.toLowerCase()}">
          <span class="entry-time">[${timeStr}]</span>
          <span class="status-tag tag-warn">SIMULATED</span>
          <span class="entry-msg">${evt.message}</span>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  /**
   * Clocks & Watchdog Timers
   */
  _startClocks() {
    setInterval(() => {
      const now = new Date();
      const clockElem = document.getElementById('system-clock-time');
      if (clockElem) {
        clockElem.innerText = now.toTimeString().substring(0, 8);
      }

      const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
      const hrs = Math.floor(uptimeSec / 3600).toString().padStart(2, '0');
      const mins = Math.floor((uptimeSec % 3600) / 60).toString().padStart(2, '0');
      const secs = (uptimeSec % 60).toString().padStart(2, '0');
      const uptimeElem = document.getElementById('system-uptime-val');
      if (uptimeElem) uptimeElem.innerText = `${hrs}:${mins}:${secs}`;

      const lastRxElem = document.getElementById('last-packet-age');
      if (lastRxElem) {
        if (!window.HardwareManager.stats.lastPacketTimestamp) {
          lastRxElem.innerText = 'NO DATA';
        } else {
          const ageSec = ((Date.now() - window.HardwareManager.stats.lastPacketTimestamp) / 1000).toFixed(1);
          lastRxElem.innerText = `${ageSec}s ago`;
        }
      }
    }, 500);
  }

  _pulseTelemetryScanline() {
    const pulseElem = document.getElementById('telemetry-heartbeat-pip');
    if (pulseElem) {
      pulseElem.classList.add('pulse');
      setTimeout(() => pulseElem.classList.remove('pulse'), 180);
    }
  }

  _updateHardwareStatusBadge(status) {
    const badge = document.getElementById('hw-status-badge');
    if (!badge) return;

    if (status === 'CONNECTED') {
      badge.className = 'status-tag tag-safe';
      badge.innerText = 'CONNECTED';
    } else if (status === 'STALE') {
      badge.className = 'status-tag tag-warn';
      badge.innerText = 'STALE';
    } else if (status === 'CONNECTING') {
      badge.className = 'status-tag tag-warn';
      badge.innerText = 'CONNECTING...';
    } else {
      badge.className = 'status-tag tag-muted';
      badge.innerText = 'NOT CONNECTED';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.App = new AppOrchestrator();
  window.App.init();
});

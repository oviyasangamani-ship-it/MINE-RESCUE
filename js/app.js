/**
 * Application Bootstrap & Telemetry Orchestrator
 * Integrates Hardware, Vision, Analytics, UI, Audio, and Simulator.
 */
class AppOrchestrator {
  constructor() {
    this.activeTab = 'live'; // 'live' | 'simulator'
    this.isDemoMode = false;
    this.demoInterval = null;
    this.startTime = Date.now();
    this.lastPacketPulseTime = 0;
  }

  async init() {
    console.log('[Mining Rescue Rover] Initializing Tactical SCADA Console...');

    // 1. Initialize UI & Audio
    window.UI.init();

    // 2. Initialize Video Subsystem
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
    this._bindDemoModeToggle();
    this._bindVideoControls();
    this._bindHardwareModalActions();
    this._bindThresholdForm();
    this._bindSimulatorControls();

    // 5. Start Clocks & Heartbeat Loop
    this._startClocks();

    // 6. Initial State Render (Ground Truth: Disconnected)
    window.Telemetry.setAwaitingConnection();
    this._renderLiveDashboard(window.Telemetry.current);
    window.UI.renderTimeline();

    // Log startup
    window.Telemetry.logEvent('SYSTEM', 'Mining Rescue Rover Tactical Subsystem Online (SCADA Ground-Truth Mode)', 'INFO');
  }

  /**
   * Hardware Stream Subscriptions
   */
  _bindHardwareEvents() {
    // Data stream
    window.HardwareManager.onData((parsedData, rawLine) => {
      this.lastPacketPulseTime = Date.now();
      window.Telemetry.update(parsedData);
      this._pulseTelemetryScanline();
      
      // Update terminal drawer
      this._updateTerminalLog();
    });

    // Hardware status changes
    window.HardwareManager.onStatusChange((newStatus, prevStatus) => {
      this._updateHardwareStatusBadge(newStatus);
      if (newStatus === 'DISCONNECTED') {
        if (!this.isDemoMode) {
          window.Telemetry.setAwaitingConnection();
        }
        window.Telemetry.logEvent('HARDWARE', 'Rover telemetry link disconnected.', 'WARNING');
      } else if (newStatus === 'CONNECTED') {
        window.Telemetry.logEvent('HARDWARE', `Rover communication link established (${window.HardwareManager.mode.toUpperCase()}).`, 'SUCCESS');
      } else if (newStatus === 'STALE') {
        window.Telemetry.logEvent('HARDWARE', 'Warning: Rover telemetry packet stream is stale (>3.5s latency).', 'WARNING');
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
    const hwStatus = this.isDemoMode ? 'CONNECTED' : window.HardwareManager.status;
    const isDisconnected = (hwStatus === 'DISCONNECTED');

    // 1. Evaluate Multi-Criteria Hazard Assessment
    const hazard = window.AnalyticsEngine.evaluateHazards(telemetry, hwStatus);
    this._renderHazardAssessment(hazard);

    // 2. Evaluate Rescue Operational Readiness
    const personInView = window.VisionSystem.personDetected;
    const camActive = window.VisionSystem.isStreaming;
    const readiness = window.AnalyticsEngine.calculateReadiness(telemetry, hwStatus, personInView, camActive);
    this._renderReadinessScore(readiness);

    // 3. Render 8 Sensor Readout Cards
    this._renderSensorCards(telemetry, isDisconnected);

    // 4. Update Decision Support Panel
    const decision = window.AnalyticsEngine.generateDecisionSupport(telemetry, hazard, readiness, hwStatus, camActive, personInView);
    this._renderDecisionSupport(decision);
  }

  /**
   * Render 8 Sensor Cards
   */
  _renderSensorCards(t, isDisconnected) {
    const cards = [
      { key: 'gas', val: t.gas, unit: 'ppm / %', name: 'Toxic & Flammable Gas', icon: 'flame', desc: 'CH₄, LPG, Hydrocarbons & Combustible Gaseous Index' },
      { key: 'co', val: t.co, unit: 'ppm', name: 'Carbon Monoxide (CO)', icon: 'wind', desc: 'Toxic Combustible Byproduct (MSHA Lethal Threshold: >100ppm)' },
      { key: 'co2', val: t.co2, unit: 'ppm', name: 'Carbon Dioxide (CO₂)', icon: 'activity', desc: 'Asphyxiant Atmospheric Displacement Indicator' },
      { key: 'temp', val: t.temp !== null ? t.temp.toFixed(1) : null, unit: '°C', name: 'Ambient Temperature', icon: 'thermometer', desc: 'Subterranean Thermal Envelope & Fire Sentry' },
      { key: 'humidity', val: t.humidity !== null ? t.humidity.toFixed(0) : null, unit: '%RH', name: 'Relative Humidity', icon: 'droplets', desc: 'Adit Moisture & Condensation Level' },
      { key: 'water', val: t.water, unit: 'mm', name: 'Water / Flood Level', icon: 'droplets', desc: 'Sump Inundation & Floor Clearance Depth' },
      { key: 'obstacle', val: t.obstacle, unit: 'cm', name: 'Obstacle Distance', icon: 'compass', desc: 'Forward Ultrasonic LiDAR Clearance' },
      { key: 'rover_status', val: t.rover_status, unit: '', name: 'Rover Operational State', icon: 'navigation', desc: 'Mobility Sentry & Traction Inclinometer', isStatusString: true }
    ];

    cards.forEach(c => {
      const valElem = document.getElementById(`val-${c.key}`);
      const badgeElem = document.getElementById(`badge-${c.key}`);
      const cardElem = document.getElementById(`card-${c.key}`);
      const threshElem = document.getElementById(`thresh-${c.key}`);

      if (!valElem || !badgeElem) return;

      const thresh = window.AnalyticsEngine.thresholds[c.key];
      if (threshElem && thresh) {
        threshElem.innerText = `Ref: Warn >${thresh.warning} | Crit >${thresh.critical} ${thresh.unit || ''}`;
      }

      if (isDisconnected || c.val === null || c.val === undefined) {
        valElem.innerText = '—';
        valElem.className = 'sensor-val muted';
        badgeElem.className = 'status-tag tag-muted';
        badgeElem.innerText = 'AWAITING DATA';
        if (cardElem) cardElem.className = 'sensor-card state-muted';
      } else {
        if (c.isStatusString) {
          valElem.innerText = c.val.toString().toUpperCase();
          valElem.className = 'sensor-val normal';
          badgeElem.className = 'status-tag tag-safe';
          badgeElem.innerText = 'ACTIVE';
          if (cardElem) cardElem.className = 'sensor-card state-safe';
        } else {
          valElem.innerText = `${c.val} ${c.unit}`;
          valElem.className = 'sensor-val active';
          
          const status = window.AnalyticsEngine.getMetricStatus(c.key, parseFloat(c.val));
          badgeElem.className = `status-tag tag-${status.status.toLowerCase()}`;
          badgeElem.innerText = status.label;

          if (cardElem) {
            cardElem.className = `sensor-card state-${status.status.toLowerCase()}`;
          }

          // Trigger audio if critical
          if (status.status === 'CRITICAL' && (c.key === 'gas' || c.key === 'co')) {
            window.TacticalAudio?.playCriticalAlarm();
          }
        }
      }
    });
  }

  /**
   * Render Consolidated Hazard Assessment
   */
  _renderHazardAssessment(hazard) {
    const statusPill = document.getElementById('hazard-status-pill');
    const hazardList = document.getElementById('active-hazards-list');
    const actionText = document.getElementById('hazard-recommended-action');
    const container = document.getElementById('hazard-assessment-panel');

    if (statusPill) {
      statusPill.className = `hazard-pill-badge pill-${hazard.level.toLowerCase()}`;
      statusPill.innerText = hazard.levelLabel;
    }

    if (actionText) {
      actionText.innerText = hazard.primaryAction;
    }

    if (container) {
      container.className = `tactical-panel panel-hazard hazard-${hazard.level.toLowerCase()}`;
    }

    if (hazardList) {
      if (hazard.activeHazards.length === 0) {
        hazardList.innerHTML = `
          <div class="no-hazards-notice">
            ${window.renderIcon('checkCircle', 16, 'text-safe')}
            <span>${hazard.isDisconnected ? 'Awaiting rover connection for hazard assessment' : 'No active threshold breaches detected in operational sector.'}</span>
          </div>
        `;
      } else {
        let html = '';
        hazard.activeHazards.forEach(h => {
          html += `
            <div class="hazard-item-chip chip-${h.severity.toLowerCase()}">
              <span class="chip-icon">${window.renderIcon('alertTriangle', 14)}</span>
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
    const container = document.getElementById('readiness-panel');

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
   * Render Decision Support Panel
   */
  _renderDecisionSupport(d) {
    const sitElem = document.getElementById('ds-situation');
    const envElem = document.getElementById('ds-environmental');
    const commElem = document.getElementById('ds-communication');
    const camElem = document.getElementById('ds-camera');
    const actElem = document.getElementById('ds-action');

    if (sitElem) sitElem.innerText = d.situation;
    if (envElem) envElem.innerText = d.environmental;
    if (commElem) commElem.innerText = d.communication;
    if (camElem) camElem.innerText = d.camera;
    if (actElem) actElem.innerText = d.action;
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
   * Explicit Demo Bench Test Mode Toggle
   */
  _bindDemoModeToggle() {
    const toggle = document.getElementById('demo-mode-toggle');
    const banner = document.getElementById('demo-mode-banner');

    if (toggle) {
      toggle.addEventListener('change', (e) => {
        this.isDemoMode = toggle.checked;
        if (banner) {
          banner.style.display = this.isDemoMode ? 'flex' : 'none';
        }

        if (this.isDemoMode) {
          this._startDemoDataGenerator();
          window.Telemetry.logEvent('SYSTEM', 'BENCH TEST DEMO MODE ACTIVATED (Simulated Live Hardware Telemetry Stream)', 'WARNING');
        } else {
          this._stopDemoDataGenerator();
          window.Telemetry.setAwaitingConnection();
          window.Telemetry.logEvent('SYSTEM', 'Demo mode deactivated. Reverted to strict hardware ground truth.', 'INFO');
        }
      });
    }
  }

  _startDemoDataGenerator() {
    let tGas = 80;
    let tCo = 12;
    let tCo2 = 480;
    let tTemp = 24.2;
    let tHum = 58;
    let tWater = 0;
    let tDist = 110;

    this.demoInterval = setInterval(() => {
      // Gentle realistic drift
      tGas = Math.max(40, Math.min(650, tGas + (Math.sin(Date.now() / 4000) * 15)));
      tCo = Math.max(2, Math.min(120, tCo + (Math.cos(Date.now() / 5000) * 3)));
      tCo2 = Math.max(400, Math.min(1800, tCo2 + (Math.sin(Date.now() / 7000) * 20)));
      tTemp = Math.max(20, Math.min(45, tTemp + (Math.sin(Date.now() / 10000) * 0.2)));
      tHum = Math.max(40, Math.min(95, tHum + (Math.cos(Date.now() / 8000) * 0.5)));
      tDist = Math.max(10, Math.min(180, tDist + (Math.sin(Date.now() / 3000) * 8)));

      const sample = {
        gas: Math.round(tGas),
        co: Math.round(tCo),
        co2: Math.round(tCo2),
        temp: Math.round(tTemp * 10) / 10,
        humidity: Math.round(tHum),
        water: tWater,
        obstacle: Math.round(tDist),
        rover_status: 'EXPLORING',
        timestamp: Date.now()
      };

      window.Telemetry.update(sample);
      this.lastPacketPulseTime = Date.now();
      this._pulseTelemetryScanline();
    }, 600);
  }

  _stopDemoDataGenerator() {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
  }

  /**
   * Video Controls & Source Switcher
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
   * Hardware Connection Modal Handlers
   */
  _bindHardwareModalActions() {
    const connectSerialBtn = document.getElementById('btn-connect-serial');
    const connectWsBtn = document.getElementById('btn-connect-ws');
    const disconnectBtn = document.getElementById('btn-disconnect-hw');
    const baudSelect = document.getElementById('hw-baud-select');
    const wsInput = document.getElementById('hw-ws-url');

    if (connectSerialBtn) {
      connectSerialBtn.addEventListener('click', async () => {
        try {
          const baud = baudSelect ? baudSelect.value : 115200;
          await window.HardwareManager.connectSerial(baud);
          document.getElementById('hw-modal')?.classList.remove('active');
        } catch (err) {
          alert(`Serial Connect Failed: ${err.message}`);
        }
      });
    }

    if (connectWsBtn) {
      connectWsBtn.addEventListener('click', () => {
        try {
          const url = wsInput ? wsInput.value.trim() : 'ws://192.168.4.1:81';
          window.HardwareManager.connectWebSocket(url);
          document.getElementById('hw-modal')?.classList.remove('active');
        } catch (err) {
          alert(`WebSocket Connect Failed: ${err.message}`);
        }
      });
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', async () => {
        await window.HardwareManager.disconnect();
      });
    }

    // Parser Tester in Modal
    const parseTestBtn = document.getElementById('test-parser-btn');
    const parseTestInput = document.getElementById('test-parser-input');
    const parseTestOutput = document.getElementById('test-parser-output');
    if (parseTestBtn && parseTestInput && parseTestOutput) {
      parseTestBtn.addEventListener('click', () => {
        const line = parseTestInput.value.trim();
        const res = window.HardwareManager.parseSensorLine(line);
        parseTestOutput.innerText = JSON.stringify(res, null, 2);
      });
    }
  }

  /**
   * Thresholds Settings Form
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

    // Attach "View Graph" triggers on all cards
    document.querySelectorAll('.btn-view-graph').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const metric = btn.getAttribute('data-metric');
        window.UI.openGraph(metric);
      });
    });
  }

  /**
   * Page 2 Simulator Controls & Telemetry Sink
   */
  _bindSimulatorControls() {
    // Scenario buttons
    document.querySelectorAll('.sim-scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sim-scenario-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sc = btn.getAttribute('data-scenario');
        window.RescueSimulator.setScenario(sc);
        window.TacticalAudio?.playClick();
      });
    });

    // Sliders
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

    // Simulator telemetry update listener
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
        <div class="sim-log-entry sev-${evt.severity.toLowerCase()}">
          <span class="entry-time">[${timeStr}]</span>
          <span class="entry-tag">SIM</span>
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
      // 1. Clock
      const now = new Date();
      const clockElem = document.getElementById('system-clock-time');
      if (clockElem) {
        clockElem.innerText = now.toTimeString().substring(0, 8) + ' UTC' + (now.getTimezoneOffset() > 0 ? '-' : '+') + Math.abs(now.getTimezoneOffset() / 60);
      }

      // 2. Uptime
      const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
      const hrs = Math.floor(uptimeSec / 3600).toString().padStart(2, '0');
      const mins = Math.floor((uptimeSec % 3600) / 60).toString().padStart(2, '0');
      const secs = (uptimeSec % 60).toString().padStart(2, '0');
      const uptimeElem = document.getElementById('system-uptime-val');
      if (uptimeElem) uptimeElem.innerText = `${hrs}:${mins}:${secs}`;

      // 3. Last packet age
      const lastRxElem = document.getElementById('last-packet-age');
      if (lastRxElem) {
        if (this.isDemoMode) {
          lastRxElem.innerText = 'BENCH (0.6s)';
        } else if (!window.HardwareManager.stats.lastPacketTimestamp) {
          lastRxElem.innerText = 'NO PACKETS';
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

    if (this.isDemoMode) {
      badge.className = 'status-tag tag-warn';
      badge.innerText = 'DEMO BENCH';
      return;
    }

    if (status === 'CONNECTED') {
      badge.className = 'status-tag tag-safe';
      badge.innerText = `CONNECTED (${window.HardwareManager.mode.toUpperCase()})`;
    } else if (status === 'STALE') {
      badge.className = 'status-tag tag-warn';
      badge.innerText = 'TELEMETRY STALE';
    } else if (status === 'CONNECTING') {
      badge.className = 'status-tag tag-warn';
      badge.innerText = 'CONNECTING...';
    } else {
      badge.className = 'status-tag tag-muted';
      badge.innerText = 'DISCONNECTED';
    }
  }

  _updateTerminalLog() {
    const term = document.getElementById('raw-terminal-content');
    if (!term) return;
    const logs = window.HardwareManager.getRawLogs();
    term.innerText = logs.slice(-25).join('\n');
    term.scrollTop = term.scrollHeight;
  }
}

// Bootstrap on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.App = new AppOrchestrator();
  window.App.init();
});

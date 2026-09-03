/**
 * Underground Mine Rescue Simulator Engine
 * 2D SVG Mine Map, Autonomous/Manual Rover Pathfinding, Crisis Scenario Matrix, and Simulated Telemetry.
 */
class MineRescueSimulator {
  constructor() {
    this.container = null;
    this.svg = null;
    
    // Waypoints grid in the mine
    this.waypoints = [
      { id: 'portal', name: 'Mine Portal Entrance', x: 80, y: 120, type: 'safe', gas: 45, co: 2, temp: 21.0, hum: 45, water: 0 },
      { id: 'junc_1', name: 'Main Haulage Junction Alpha', x: 220, y: 120, type: 'safe', gas: 70, co: 5, temp: 23.5, hum: 52, water: 0 },
      { id: 'north_crosscut', name: 'North Ventilation Crosscut', x: 220, y: 40, type: 'vent', gas: 95, co: 8, temp: 22.0, hum: 58, water: 0 },
      { id: 'vent_shaft', name: 'Ventilation Borehole #2', x: 440, y: 40, type: 'vent', gas: 120, co: 12, temp: 24.0, hum: 60, water: 0 },
      { id: 'stope_4b', name: 'Extraction Stope 4B', x: 440, y: 120, type: 'gas_zone', gas: 620, co: 85, temp: 34.0, hum: 78, water: 5 },
      { id: 'ramp_sub3', name: 'Sub-Level 3 Incline Ramp', x: 220, y: 240, type: 'passage', gas: 140, co: 18, temp: 26.5, hum: 65, water: 12 },
      { id: 'collapsed_adit', name: 'Collapsed West Adit', x: 80, y: 240, type: 'collapsed', gas: 380, co: 45, temp: 29.0, hum: 70, water: 8 },
      { id: 'sump_basin', name: 'Drainage Sump & Pumping Station', x: 220, y: 340, type: 'flooded', gas: 160, co: 20, temp: 25.0, hum: 92, water: 75 },
      { id: 'haulage_east', name: 'East Haulage Drift', x: 580, y: 120, type: 'passage', gas: 210, co: 25, temp: 28.0, hum: 62, water: 2 },
      { id: 'refuge_chamber', name: 'Emergency Refuge Bay Delta', x: 580, y: 240, type: 'refuge', gas: 110, co: 14, temp: 24.5, hum: 60, water: 0, hasWorker: true },
      { id: 'deep_drift', name: 'Sub-Level 4 Deep Drift', x: 440, y: 340, type: 'hazard', gas: 540, co: 72, temp: 42.0, hum: 88, water: 30 }
    ];

    // Edges (tunnels) connecting waypoints
    this.tunnels = [
      ['portal', 'junc_1'],
      ['junc_1', 'north_crosscut'],
      ['north_crosscut', 'vent_shaft'],
      ['vent_shaft', 'stope_4b'],
      ['junc_1', 'stope_4b'],
      ['junc_1', 'ramp_sub3'],
      ['ramp_sub3', 'collapsed_adit'],
      ['ramp_sub3', 'sump_basin'],
      ['stope_4b', 'haulage_east'],
      ['haulage_east', 'refuge_chamber'],
      ['ramp_sub3', 'refuge_chamber'],
      ['sump_basin', 'deep_drift'],
      ['refuge_chamber', 'deep_drift']
    ];

    // Rover simulation state
    this.rover = {
      x: 80,
      y: 120,
      currentWaypointId: 'portal',
      targetWaypointId: null,
      path: [],
      speed: 1.8,
      heading: 0,
      isMoving: false,
      mode: 'patrol' // 'manual' | 'patrol' | 'waypoint'
    };

    // Simulated sensor controls
    this.simParams = {
      scenario: 'normal',
      gas: 65,
      co: 8,
      co2: 450,
      temp: 23.5,
      humidity: 55,
      water: 0,
      obstacle: 120,
      battery: 94,
      signalLoss: 5,
      personDetected: false
    };

    // Simulation event timeline
    this.simEvents = [];
    this.subscribers = new Set();
    this.animationId = null;

    this.patrolIndex = 0;
    this.patrolOrder = ['portal', 'junc_1', 'north_crosscut', 'vent_shaft', 'stope_4b', 'haulage_east', 'refuge_chamber', 'deep_drift', 'sump_basin', 'ramp_sub3', 'junc_1', 'portal'];
  }

  init(containerElement) {
    this.container = containerElement;
    this.renderMap();
    this.startSimulationLoop();
    this.logSimEvent('SIMULATED', 'Mine rescue simulation sandbox initialized', 'INFO');
  }

  subscribe(cb) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  _notify() {
    this.subscribers.forEach(cb => {
      try { cb(this.simParams, this.rover, this.simEvents); } catch (e) {}
    });
  }

  logSimEvent(type, message, severity = 'INFO') {
    const evt = {
      id: 'sim_evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 3),
      timestamp: Date.now(),
      type: 'SIMULATED',
      message,
      severity
    };
    this.simEvents.unshift(evt);
    if (this.simEvents.length > 80) this.simEvents.pop();
    this._notify();
  }

  /**
   * Set Simulation Scenario Preset
   */
  setScenario(scenarioId) {
    this.simParams.scenario = scenarioId;

    switch (scenarioId) {
      case 'normal':
        this.simParams.gas = 55;
        this.simParams.co = 6;
        this.simParams.co2 = 420;
        this.simParams.temp = 22.8;
        this.simParams.humidity = 52;
        this.simParams.water = 0;
        this.simParams.obstacle = 140;
        this.simParams.personDetected = false;
        this.simParams.signalLoss = 2;
        this.logSimEvent('DRILL', 'Scenario: Baseline Safe Exploration loaded', 'SUCCESS');
        break;

      case 'gas_leak':
        this.simParams.gas = 680;
        this.simParams.co = 115;
        this.simParams.co2 = 2800;
        this.simParams.temp = 27.5;
        this.simParams.humidity = 68;
        this.simParams.water = 5;
        this.simParams.obstacle = 90;
        this.simParams.personDetected = false;
        this.simParams.signalLoss = 12;
        this.logSimEvent('DRILL', 'CRITICAL SCENARIO: Severe Methane & CO Inundation detected in Stope 4B', 'CRITICAL');
        break;

      case 'flooding':
        this.simParams.gas = 140;
        this.simParams.co = 18;
        this.simParams.co2 = 650;
        this.simParams.temp = 21.0;
        this.simParams.humidity = 96;
        this.simParams.water = 82;
        this.simParams.obstacle = 40;
        this.simParams.personDetected = false;
        this.simParams.signalLoss = 25;
        this.logSimEvent('DRILL', 'CRITICAL SCENARIO: Flash Flooding in Sump Basin (82mm water level)', 'CRITICAL');
        break;

      case 'thermal':
        this.simParams.gas = 420;
        this.simParams.co = 88;
        this.simParams.co2 = 1800;
        this.simParams.temp = 54.5;
        this.simParams.humidity = 88;
        this.simParams.water = 10;
        this.simParams.obstacle = 60;
        this.simParams.personDetected = false;
        this.simParams.signalLoss = 18;
        this.logSimEvent('DRILL', 'CRITICAL SCENARIO: Subsurface Thermal Fire Alert (54.5°C in Deep Drift)', 'CRITICAL');
        break;

      case 'collapse':
        this.simParams.gas = 280;
        this.simParams.co = 32;
        this.simParams.co2 = 850;
        this.simParams.temp = 25.0;
        this.simParams.humidity = 70;
        this.simParams.water = 15;
        this.simParams.obstacle = 8;
        this.simParams.personDetected = false;
        this.simParams.signalLoss = 70;
        this.logSimEvent('DRILL', 'CRITICAL SCENARIO: Structural Rockfall & Severe Comms Attenuation', 'CRITICAL');
        break;

      case 'multi_hazard':
        this.simParams.gas = 750;
        this.simParams.co = 130;
        this.simParams.co2 = 3100;
        this.simParams.temp = 52.0;
        this.simParams.humidity = 94;
        this.simParams.water = 70;
        this.simParams.obstacle = 12;
        this.simParams.personDetected = true;
        this.simParams.signalLoss = 45;
        this.logSimEvent('DRILL', 'CODE RED DRILL: Multi-Hazard Collapse + Gas + Flooding + Trapped Worker', 'CRITICAL');
        break;

      case 'worker_found':
        this.simParams.gas = 90;
        this.simParams.co = 12;
        this.simParams.co2 = 520;
        this.simParams.temp = 24.0;
        this.simParams.humidity = 58;
        this.simParams.water = 0;
        this.simParams.obstacle = 85;
        this.simParams.personDetected = true;
        this.simParams.signalLoss = 8;
        this.logSimEvent('DRILL', 'SURVIVOR LOCATED: Candidate worker identified in Refuge Bay Delta', 'SUCCESS');
        break;

      default:
        break;
    }

    this._notify();
  }

  updateSlider(paramKey, value) {
    this.simParams[paramKey] = value;
    this._notify();
  }

  /**
   * Render Top-Down 2D SVG Mine Map
   */
  renderMap() {
    if (!this.container) return;

    const width = 680;
    const height = 400;

    let svgHtml = `
      <svg id="mine-svg" viewBox="0 0 ${width} ${height}" class="mine-map-svg" width="100%" height="100%">
        <defs>
          <!-- Technical Grid Pattern -->
          <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="1"/>
          </pattern>
          
          <!-- Hazard Area Hatching -->
          <pattern id="gasHatch" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="12" stroke="rgba(245, 158, 11, 0.45)" stroke-width="3" />
          </pattern>
          <pattern id="floodHatch" width="12" height="12" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="12" stroke="rgba(2, 132, 199, 0.45)" stroke-width="3" />
          </pattern>
          <pattern id="collapseHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(220, 38, 38, 0.5)" stroke-width="3" />
          </pattern>
        </defs>

        <!-- Base Background & CAD Grid -->
        <rect width="${width}" height="${height}" fill="#101419" />
        <rect width="${width}" height="${height}" fill="url(#cadGrid)" />

        <!-- Outer Boundary Bedrock -->
        <path d="M 30,30 L 650,30 L 650,370 L 30,370 Z" fill="none" stroke="#1f2733" stroke-width="2" stroke-dasharray="6,4" />

        <!-- Hazard Zone Polygons -->
        <!-- 1. Stope 4B Gas Pocket -->
        <rect x="380" y="80" width="120" height="80" rx="4" fill="url(#gasHatch)" stroke="#f59e0b" stroke-width="1" opacity="0.85" />
        <text x="440" y="100" fill="#f59e0b" font-family="'JetBrains Mono', monospace" font-size="9" text-anchor="middle" font-weight="bold">GAS ACCUMULATION ZONE</text>

        <!-- 2. Sump Basin Flooding -->
        <rect x="160" y="300" width="120" height="75" rx="4" fill="url(#floodHatch)" stroke="#0284c7" stroke-width="1" opacity="0.85" />
        <text x="220" y="320" fill="#38bdf8" font-family="'JetBrains Mono', monospace" font-size="9" text-anchor="middle" font-weight="bold">SUMP / FLOOD BASIN</text>

        <!-- 3. West Collapsed Adit -->
        <rect x="40" y="200" width="90" height="75" rx="4" fill="url(#collapseHatch)" stroke="#dc2626" stroke-width="1" opacity="0.85" />
        <text x="85" y="220" fill="#f87171" font-family="'JetBrains Mono', monospace" font-size="8" text-anchor="middle" font-weight="bold">COLLAPSED ADIT</text>

        <!-- 4. Refuge Bay Safe Chamber -->
        <rect x="520" y="200" width="120" height="80" rx="4" fill="rgba(34, 197, 94, 0.12)" stroke="#22c55e" stroke-width="1.5" />
        <text x="580" y="220" fill="#4ade80" font-family="'JetBrains Mono', monospace" font-size="9" text-anchor="middle" font-weight="bold">REFUGE BAY DELTA</text>

        <!-- Tunnels Network (Lines) -->
        <g id="mine-tunnels">
    `;

    // Draw tunnel segments
    this.tunnels.forEach(([fromId, toId]) => {
      const from = this.waypoints.find(w => w.id === fromId);
      const to = this.waypoints.find(w => w.id === toId);
      if (from && to) {
        svgHtml += `
          <!-- Tunnel Outer Wall -->
          <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#222c38" stroke-width="26" stroke-linecap="round" />
          <!-- Tunnel Interior Floor -->
          <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#141a22" stroke-width="18" stroke-linecap="round" />
          <!-- Center Track Line -->
          <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#2a3646" stroke-width="2" stroke-dasharray="4,4" />
        `;
      }
    });

    svgHtml += `</g><g id="mine-waypoints">`;

    // Draw Waypoint Junction Nodes
    this.waypoints.forEach(wp => {
      let nodeColor = '#3b82f6';
      if (wp.type === 'safe') nodeColor = '#22c55e';
      if (wp.type === 'gas_zone') nodeColor = '#f59e0b';
      if (wp.type === 'flooded') nodeColor = '#0284c7';
      if (wp.type === 'collapsed') nodeColor = '#dc2626';
      if (wp.type === 'refuge') nodeColor = '#10b981';

      svgHtml += `
        <g class="waypoint-node" data-id="${wp.id}" style="cursor: pointer;">
          <circle cx="${wp.x}" cy="${wp.y}" r="9" fill="#131920" stroke="${nodeColor}" stroke-width="2" />
          <circle cx="${wp.x}" cy="${wp.y}" r="3.5" fill="${nodeColor}" />
          <text x="${wp.x}" y="${wp.y + 19}" fill="#9ca3af" font-family="'JetBrains Mono', monospace" font-size="8" text-anchor="middle">${wp.name.split(' ')[0]}</text>
        </g>
      `;

      // Trapped worker beacon
      if (wp.hasWorker) {
        svgHtml += `
          <g id="worker-beacon" transform="translate(${wp.x + 12}, ${wp.y - 12})">
            <circle cx="0" cy="0" r="10" fill="none" stroke="#22c55e" stroke-width="1.5" class="pulsing-beacon" />
            <circle cx="0" cy="0" r="4" fill="#22c55e" />
            <text x="14" y="3" fill="#4ade80" font-family="'JetBrains Mono', monospace" font-size="8" font-weight="bold">MINER BEACON</text>
          </g>
        `;
      }
    });

    // Rover Icon (Interactive)
    svgHtml += `
        </g>
        <!-- Animated Rover Mark -->
        <g id="rover-marker" transform="translate(${this.rover.x}, ${this.rover.y})">
          <circle cx="0" cy="0" r="14" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="2,2" class="rover-radar-ring" />
          <rect x="-8" y="-8" width="16" height="16" rx="2" fill="#d97706" stroke="#fbbf24" stroke-width="1.5" />
          <!-- Headlights -->
          <polygon points="8,-4 22,-10 22,10 8,4" fill="rgba(251, 191, 36, 0.25)" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
        </g>
      </svg>
    `;

    this.container.innerHTML = svgHtml;

    // Attach click handlers to waypoints for click-to-navigate
    const nodes = this.container.querySelectorAll('.waypoint-node');
    nodes.forEach(n => {
      n.addEventListener('click', (e) => {
        const id = n.getAttribute('data-id');
        this.navigateToWaypoint(id);
      });
    });
  }

  navigateToWaypoint(wpId) {
    const target = this.waypoints.find(w => w.id === wpId);
    if (!target) return;

    this.rover.mode = 'waypoint';
    this.rover.targetWaypointId = wpId;
    this.rover.isMoving = true;
    this.logSimEvent('SIMULATED', `Rover dispatch command sent to: ${target.name}`, 'INFO');
  }

  /**
   * Main simulation loop for rover physics and waypoint updates
   */
  startSimulationLoop() {
    const step = () => {
      this._updateRoverPosition();
      this.animationId = requestAnimationFrame(step);
    };
    this.animationId = requestAnimationFrame(step);
  }

  _updateRoverPosition() {
    const marker = document.getElementById('rover-marker');
    if (!marker) return;

    // In patrol mode, cycle waypoints
    if (this.rover.mode === 'patrol' && !this.rover.targetWaypointId) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolOrder.length;
      this.rover.targetWaypointId = this.patrolOrder[this.patrolIndex];
    }

    if (this.rover.targetWaypointId) {
      const target = this.waypoints.find(w => w.id === this.rover.targetWaypointId);
      if (target) {
        const dx = target.x - this.rover.x;
        const dy = target.y - this.rover.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 3) {
          this.rover.x = target.x;
          this.rover.y = target.y;
          this.rover.currentWaypointId = target.id;
          this.rover.targetWaypointId = null;

          // Ingest waypoint local atmospheric signature into simulated telemetry
          if (this.simParams.scenario === 'normal') {
            this.simParams.gas = target.gas;
            this.simParams.co = target.co;
            this.simParams.temp = target.temp;
            this.simParams.humidity = target.hum;
            this.simParams.water = target.water;
            this._notify();
          }
        } else {
          this.rover.x += (dx / dist) * this.rover.speed;
          this.rover.y += (dy / dist) * this.rover.speed;
          this.rover.heading = Math.atan2(dy, dx);
        }
      }
    }

    // Update marker transform
    marker.setAttribute('transform', `translate(${this.rover.x}, ${this.rover.y}) rotate(${(this.rover.heading * 180) / Math.PI})`);
  }
}

window.RescueSimulator = new MineRescueSimulator();

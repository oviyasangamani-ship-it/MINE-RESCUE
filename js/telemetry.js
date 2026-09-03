/**
 * Telemetry State & Rolling History Store
 * Maintains real-time sensor buffers, IMU speed & tilt metrics, event timelines, and local persistence.
 */
class TelemetryStore {
  constructor() {
    this.bufferSize = 1000;
    
    // Live sensor values (null when disconnected)
    this.current = {
      gas: null,          // Toxic & Combustible Gas (ppm)
      co: null,           // Carbon Monoxide (ppm)
      co2: null,          // Carbon Dioxide (ppm)
      temp: null,         // Temperature (°C)
      humidity: null,     // Humidity (%RH)
      water: null,        // Water level (mm)
      obstacle: null,     // Distance to obstacle (cm)
      speed: null,        // IMU Linear Speed (m/s)
      tilt: null,         // IMU Tilt Angle (degrees °)
      rover_status: null, // Rover mobility condition (NORMAL / WARNING / CRITICAL)
      timestamp: null
    };

    // Rolling history for each metric: Array of { t: timestamp, v: value }
    this.history = {
      gas: [],
      co: [],
      co2: [],
      temp: [],
      humidity: [],
      water: [],
      obstacle: [],
      speed: [],
      tilt: []
    };

    // System event timeline
    this.events = this._loadStoredEvents();
    this.subscribers = new Set();
    this.eventSubscribers = new Set();
  }

  _loadStoredEvents() {
    try {
      const raw = localStorage.getItem('mine_rescue_events');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  _saveEvents() {
    try {
      localStorage.setItem('mine_rescue_events', JSON.stringify(this.events.slice(0, 150)));
    } catch (e) {}
  }

  /**
   * Ingest fresh telemetry data point from hardware or simulator
   */
  update(data) {
    if (!data) return;

    const t = data.timestamp || Date.now();
    this.current = { ...this.current, ...data, timestamp: t };

    // Append to rolling history buffers
    const metrics = ['gas', 'co', 'co2', 'temp', 'humidity', 'water', 'obstacle', 'speed', 'tilt'];
    for (const m of metrics) {
      if (data[m] !== undefined && data[m] !== null && !isNaN(data[m])) {
        this.history[m].push({ t, v: parseFloat(data[m]) });
        if (this.history[m].length > this.bufferSize) {
          this.history[m].shift();
        }
      }
    }

    this._notify();
  }

  /**
   * Reset current values to disconnected state (ground-truth compliance)
   */
  setAwaitingConnection() {
    this.current = {
      gas: null,
      co: null,
      co2: null,
      temp: null,
      humidity: null,
      water: null,
      obstacle: null,
      speed: null,
      tilt: null,
      rover_status: null,
      timestamp: null
    };
    this._notify();
  }

  subscribe(cb) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  onEvent(cb) {
    this.eventSubscribers.add(cb);
    return () => this.eventSubscribers.delete(cb);
  }

  _notify() {
    for (const cb of this.subscribers) {
      try {
        cb(this.current, this.history);
      } catch (e) {
        console.error('[Telemetry] Error in subscriber callback:', e);
      }
    }
  }

  /**
   * Log an operational event with timestamp
   */
  logEvent(category, message, severity = 'INFO') {
    const entry = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      category: category.toUpperCase(), // 'HAZARD', 'PERSON_DETECTION', 'HARDWARE', 'SYSTEM', 'ROVER'
      message,
      severity: severity.toUpperCase()  // 'INFO', 'WARNING', 'CRITICAL', 'SUCCESS'
    };

    this.events.unshift(entry);
    if (this.events.length > 250) this.events.pop();
    this._saveEvents();

    for (const cb of this.eventSubscribers) {
      try {
        cb(entry, this.events);
      } catch (e) {
        console.error('[Telemetry] Error in event callback:', e);
      }
    }
  }

  getFilteredEvents(category = 'ALL') {
    if (category === 'ALL') return this.events;
    return this.events.filter(e => e.category === category);
  }

  clearEvents() {
    this.events = [];
    this._saveEvents();
    this.logEvent('SYSTEM', 'Local event history cleared by operator.', 'INFO');
  }

  exportEventsJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.events, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mine_rescue_log_${new Date().toISOString().slice(0,19)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}

window.Telemetry = new TelemetryStore();

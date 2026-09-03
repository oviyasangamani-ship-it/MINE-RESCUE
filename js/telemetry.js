/**
 * Telemetry State & Rolling History Store
 * Maintains real-time sensor buffers, event timelines, and local persistence.
 */
class TelemetryStore {
  constructor() {
    this.bufferSize = 1000;
    
    // Live sensor values (null when disconnected)
    this.current = {
      gas: null,        // Toxic & Flammable Gas (MQ-2 scope: ppm / %)
      co: null,         // Carbon Monoxide (MQ-7 scope: ppm)
      co2: null,        // Carbon Dioxide (ppm)
      temp: null,       // Temperature (°C)
      humidity: null,   // Humidity (%RH)
      water: null,      // Flood / Water level (mm or %)
      obstacle: null,   // Distance to obstacle (cm)
      rover_status: null, // Rover mobility state (MOVING / STATIONARY / TILT_ALERT)
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
      obstacle: []
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
   * Ingest fresh telemetry data point from hardware or demo mode
   */
  update(data) {
    if (!data) return;

    const t = data.timestamp || Date.now();
    this.current = { ...data, timestamp: t };

    // Append to rolling history buffers
    const metrics = ['gas', 'co', 'co2', 'temp', 'humidity', 'water', 'obstacle'];
    for (const m of metrics) {
      if (data[m] !== undefined && data[m] !== null && !isNaN(data[m])) {
        this.history[m].push({ t, v: data[m] });
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
    this.subscribers.forEach(cb => {
      try {
        cb(this.current, this.history);
      } catch (e) {
        console.error(e);
      }
    });
  }

  /**
   * Log an operational event to the persistent timeline
   */
  logEvent(type, message, severity = 'INFO', metadata = {}) {
    const event = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      type, // 'SYSTEM' | 'HARDWARE' | 'HAZARD' | 'PERSON_DETECTION' | 'READINESS' | 'DRILL'
      message,
      severity, // 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS'
      metadata
    };

    this.events.unshift(event);
    if (this.events.length > 500) {
      this.events.pop();
    }
    this._saveEvents();

    this.eventSubscribers.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error(e);
      }
    });

    return event;
  }

  getEvents(filterType = null, severity = null) {
    return this.events.filter(e => {
      if (filterType && e.type !== filterType) return false;
      if (severity && e.severity !== severity) return false;
      return true;
    });
  }

  clearEvents() {
    this.events = [];
    this._saveEvents();
    this.eventSubscribers.forEach(cb => {
      try { cb(null); } catch (e) {}
    });
  }

  /**
   * Compute min, max, average, and trend for a given metric
   */
  getMetricStats(metricKey, timeWindowMs = 60000) {
    const buffer = this.history[metricKey] || [];
    if (buffer.length === 0) return { min: 0, max: 0, avg: 0, count: 0, trend: 'FLAT' };

    const cutoff = Date.now() - timeWindowMs;
    const windowPoints = buffer.filter(p => p.t >= cutoff);
    const points = windowPoints.length > 0 ? windowPoints : buffer.slice(-30);

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    points.forEach(p => {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
      sum += p.v;
    });

    const avg = sum / points.length;
    
    // Trend analysis
    let trend = 'FLAT';
    if (points.length >= 4) {
      const firstHalf = points.slice(0, Math.floor(points.length / 2));
      const secondHalf = points.slice(Math.floor(points.length / 2));
      const avg1 = firstHalf.reduce((s, p) => s + p.v, 0) / firstHalf.length;
      const avg2 = secondHalf.reduce((s, p) => s + p.v, 0) / secondHalf.length;
      const diff = avg2 - avg1;
      if (diff > (avg1 * 0.05 + 1)) trend = 'RISING';
      else if (diff < -(avg1 * 0.05 + 1)) trend = 'FALLING';
    }

    return {
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      count: points.length,
      trend
    };
  }

  /**
   * Export mission data as JSON
   */
  exportJSON() {
    const data = {
      exportTime: new Date().toISOString(),
      events: this.events,
      historySummary: {
        gasCount: this.history.gas.length,
        coCount: this.history.co.length,
        tempCount: this.history.temp.length
      },
      history: this.history
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export events as CSV
   */
  exportEventsCSV() {
    const headers = ['Timestamp', 'ISO Time', 'Type', 'Severity', 'Message'];
    const rows = this.events.map(e => [
      e.timestamp,
      `"${new Date(e.timestamp).toISOString()}"`,
      `"${e.type}"`,
      `"${e.severity}"`,
      `"${e.message.replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

window.Telemetry = new TelemetryStore();

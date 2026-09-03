/**
 * Hardware Communication & Serial Telemetry Ingestion Layer
 * Reads directly from real Arduino / ESP32 hardware via Web Serial API or WebSocket.
 * Parses IMU linear speed & tilt along with atmospheric sensors.
 */
class HardwareConnectionManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.socket = null;
    this.status = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'STALE'
    this.mode = 'serial';         // 'serial' | 'websocket'
    this.baudRate = 115200;
    this.wsUrl = 'ws://192.168.4.1:81';

    // Watchdog timing
    this.staleTimeoutMs = 3500;
    this.disconnectTimeoutMs = 7000;
    this.stats = {
      packetsReceived: 0,
      lastPacketTimestamp: null,
      bytesReceived: 0,
      parseErrors: 0
    };

    this.dataListeners = new Set();
    this.statusListeners = new Set();
    this.rawLogBuffer = [];
    this.maxLogLines = 200;

    this._startWatchdog();
    this._bindSystemEvents();
  }

  _bindSystemEvents() {
    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', (e) => {
        console.log('[Hardware] USB Device Attached:', e.target);
      });
      navigator.serial.addEventListener('disconnect', (e) => {
        console.warn('[Hardware] USB Device Unplugged');
        this.disconnect();
      });
    }

    window.addEventListener('online', () => {
      if (this.mode === 'websocket' && this.status === 'DISCONNECTED') {
        this.connectWebSocket().catch(() => {});
      }
    });
  }

  _setStatus(newStatus) {
    if (this.status !== newStatus) {
      const prev = this.status;
      this.status = newStatus;
      console.log(`[Hardware] Status: ${prev} -> ${newStatus}`);
      this.statusListeners.forEach(cb => {
        try {
          cb(newStatus, prev);
        } catch (e) {
          console.error('[Hardware] Status listener error:', e);
        }
      });
    }
  }

  /**
   * Watchdog timer checking packet arrival latency
   */
  _startWatchdog() {
    setInterval(() => {
      if (this.status === 'CONNECTED' || this.status === 'STALE') {
        const now = Date.now();
        const elapsed = this.stats.lastPacketTimestamp ? (now - this.stats.lastPacketTimestamp) : 999999;
        
        if (elapsed > this.disconnectTimeoutMs) {
          this._setStatus('DISCONNECTED');
        } else if (elapsed > this.staleTimeoutMs) {
          this._setStatus('STALE');
        }
      }
    }, 500);
  }

  /**
   * Simplified direct toggle: Connect or Disconnect hardware
   */
  async toggleConnect() {
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING' || this.status === 'STALE') {
      await this.disconnect();
      return 'DISCONNECTED';
    }

    // Attempt direct Web Serial connection first
    if ('serial' in navigator) {
      try {
        await this.connectSerial();
        return 'CONNECTED';
      } catch (err) {
        console.warn('[Hardware] Serial connection cancelled/failed:', err.message);
        // Fallback to local Wi-Fi WebSocket if serial was cancelled
        try {
          this.connectWebSocket();
          return 'CONNECTING';
        } catch (wsErr) {
          this._setStatus('DISCONNECTED');
          throw err;
        }
      }
    } else {
      // Fallback for browsers without Web Serial: try local WebSocket
      this.connectWebSocket();
      return 'CONNECTING';
    }
  }

  /**
   * Connect via Web Serial API
   */
  async connectSerial(customBaud = null) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this browser. Use Chrome, Edge, or Brave.');
    }

    if (customBaud) this.baudRate = parseInt(customBaud, 10);
    this.mode = 'serial';
    this._setStatus('CONNECTING');

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });

      this._appendRawLog(`Serial port opened at ${this.baudRate} baud.`);
      this._setStatus('CONNECTED');
      this._readSerialStream();
    } catch (err) {
      this._setStatus('DISCONNECTED');
      this._appendRawLog(`Serial connection error: ${err.message}`);
      throw err;
    }
  }

  async _readSerialStream() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let buffer = '';

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.stats.bytesReceived += value.length;
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop(); // Retain incomplete line

          for (const line of lines) {
            const clean = line.trim();
            if (clean.length > 0) {
              this._handleIncomingLine(clean);
            }
          }
        }
      }
    } catch (err) {
      if (this.status !== 'DISCONNECTED') {
        console.error('[Hardware] Serial stream read error:', err);
        this._appendRawLog(`Stream read error: ${err.message}`);
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
      }
      this.disconnect();
    }
  }

  /**
   * Connect via WebSocket (ESP32 Wi-Fi Local Access Point)
   */
  connectWebSocket(url = null) {
    if (url) this.wsUrl = url;
    this.mode = 'websocket';
    this._setStatus('CONNECTING');
    this._appendRawLog(`Connecting to WebSocket: ${this.wsUrl}...`);

    try {
      if (this.socket) {
        this.socket.close();
      }

      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this._setStatus('CONNECTED');
        this._appendRawLog(`WebSocket connected to ${this.wsUrl}`);
      };

      this.socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          this.stats.bytesReceived += event.data.length;
          const lines = event.data.split(/\r?\n/);
          for (const line of lines) {
            const clean = line.trim();
            if (clean.length > 0) {
              this._handleIncomingLine(clean);
            }
          }
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[Hardware] WebSocket error:', err);
        this._appendRawLog(`WebSocket error encountered`);
      };

      this.socket.onclose = () => {
        if (this.status !== 'DISCONNECTED') {
          this._setStatus('DISCONNECTED');
          this._appendRawLog('WebSocket connection closed.');
        }
      };
    } catch (err) {
      this._setStatus('DISCONNECTED');
      this._appendRawLog(`WebSocket setup error: ${err.message}`);
      throw err;
    }
  }

  async disconnect() {
    const wasConnected = (this.status === 'CONNECTED' || this.status === 'CONNECTING');
    this._setStatus('DISCONNECTED');

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }

    if (wasConnected) {
      this._appendRawLog('Hardware disconnected.');
    }
  }

  /**
   * Ingest raw line and parse
   */
  _handleIncomingLine(line) {
    const now = Date.now();
    this.stats.lastPacketTimestamp = now;
    this.stats.packetsReceived++;
    if (this.status !== 'CONNECTED') {
      this._setStatus('CONNECTED');
    }

    this._appendRawLog(`[RX] ${line}`);

    const parsed = this.parseSensorLine(line);
    if (parsed) {
      this._notifyData(parsed, line);
    } else {
      this.stats.parseErrors++;
    }
  }

  /**
   * Parse sensor line according to standard formats
   * Format includes IMU speed (m/s) and tilt (deg)
   */
  parseSensorLine(line) {
    if (!line || typeof line !== 'string') return null;

    try {
      // 1. JSON Format Check
      if (line.startsWith('{') && line.endsWith('}')) {
        const obj = JSON.parse(line);
        return this._normalizeTelemetry(obj);
      }

      // 2. Key-Value Format: GAS:120,CO:15,TEMP:28.4,SPEED:0.4,TILT:5.2...
      if (line.includes(':') && line.includes(',')) {
        const pairs = line.split(',');
        const obj = {};
        for (const p of pairs) {
          const [k, v] = p.split(':').map(s => s.trim());
          if (k && v !== undefined) {
            const key = k.toLowerCase();
            const num = parseFloat(v);
            obj[key] = isNaN(num) ? v : num;
          }
        }
        return this._normalizeTelemetry(obj);
      }

      // 3. Comma-Separated Values (CSV standard)
      // Order: gas, co, co2, temp, humidity, water, obstacle, rover_status, speed, tilt
      if (line.includes(',')) {
        const parts = line.split(',').map(s => s.trim());
        return {
          gas: this._parseNum(parts[0], 0),
          co: this._parseNum(parts[1], 0),
          co2: this._parseNum(parts[2], 400),
          temp: this._parseNum(parts[3], 24.0),
          humidity: this._parseNum(parts[4], 50.0),
          water: this._parseNum(parts[5], 0),
          obstacle: this._parseNum(parts[6], 100),
          rover_status: parts[7] || 'NORMAL',
          speed: this._parseNum(parts[8], 0.0),
          tilt: this._parseNum(parts[9], 0.0),
          timestamp: Date.now()
        };
      }

      return null;
    } catch (err) {
      console.warn('[Hardware] Parse failed for line:', line, err);
      return null;
    }
  }

  _parseNum(val, fallback) {
    if (val === undefined || val === null || val === '') return fallback;
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
  }

  _normalizeTelemetry(raw) {
    return {
      gas: this._parseNum(raw.gas ?? raw.mq2 ?? raw.combustible, 0),
      co: this._parseNum(raw.co ?? raw.mq7 ?? raw.carbon_monoxide, 0),
      co2: this._parseNum(raw.co2 ?? raw.carbon_dioxide, 400),
      temp: this._parseNum(raw.temp ?? raw.temperature ?? raw.dht_temp, 24.0),
      humidity: this._parseNum(raw.humidity ?? raw.hum ?? raw.dht_hum, 50.0),
      water: this._parseNum(raw.water ?? raw.flood ?? raw.water_level, 0),
      obstacle: this._parseNum(raw.obstacle ?? raw.dist ?? raw.distance ?? raw.ultrasonic, 100),
      rover_status: raw.rover_status ?? raw.status ?? raw.state ?? 'NORMAL',
      speed: this._parseNum(raw.speed ?? raw.linear_speed ?? raw.spd ?? raw.velocity, 0.0),
      tilt: this._parseNum(raw.tilt ?? raw.tilt_angle ?? raw.pitch ?? raw.roll ?? raw.angle, 0.0),
      timestamp: Date.now()
    };
  }

  _appendRawLog(entry) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const formatted = `[${timestamp}] ${entry}`;
    this.rawLogBuffer.push(formatted);
    if (this.rawLogBuffer.length > this.maxLogLines) {
      this.rawLogBuffer.shift();
    }
  }

  getRawLogs() {
    return this.rawLogBuffer;
  }

  onData(cb) {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  _notifyData(parsed, raw) {
    this.dataListeners.forEach(cb => {
      try {
        cb(parsed, raw);
      } catch (e) {
        console.error('[Hardware] Error in data listener:', e);
      }
    });
  }
}

window.HardwareManager = new HardwareConnectionManager();

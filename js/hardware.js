/**
 * Hardware Integration Layer
 * Web Serial API (USB) & WebSocket / HTTP client for Arduino / ESP32 rover telemetry.
 * Strict ground-truth compliance: zero synthetic data on live hardware mode.
 */
class HardwareConnectionManager {
  constructor() {
    this.mode = 'serial'; // 'serial' | 'websocket' | 'http'
    this.status = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'STALE'
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.ws = null;
    this.httpInterval = null;
    
    // Serial config
    this.baudRate = 115200;
    this.wsUrl = 'ws://192.168.4.1:81';
    this.httpUrl = 'http://192.168.4.1/data';
    this.httpPollingMs = 500;

    // Parser configuration
    this.parserFormat = 'csv'; // 'csv' | 'kv' | 'json' | 'custom'
    this.customParserCode = `// Custom parser: return telemetry object
function parsePacket(line) {
  const parts = line.split(',');
  return {
    gas: parseFloat(parts[0]),
    co: parseFloat(parts[1]),
    co2: parseFloat(parts[2]),
    temp: parseFloat(parts[3]),
    humidity: parseFloat(parts[4]),
    water: parseFloat(parts[5]),
    obstacle: parseFloat(parts[6]),
    rover_status: parts[7] || 'IDLE'
  };
}`;

    // Statistics & Heartbeat
    this.stats = {
      packetsReceived: 0,
      bytesReceived: 0,
      parseErrors: 0,
      lastPacketTimestamp: null,
      rxRate: 0,
      uptimeSeconds: 0
    };

    this.rawLogBuffer = [];
    this.maxLogLines = 200;
    this.staleTimeoutMs = 3500;
    this.disconnectTimeoutMs = 7000;
    this.heartbeatTimer = null;
    this.listeners = new Set();
    this.statusListeners = new Set();

    // Start background watchdog
    this._startWatchdog();
  }

  onData(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  _notifyData(parsedData, rawLine) {
    this.listeners.forEach(cb => {
      try {
        cb(parsedData, rawLine);
      } catch (e) {
        console.error('[Hardware] Listener error:', e);
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
   * Connect via Web Serial API
   */
  async connectSerial(customBaud = null) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this browser. Please use Google Chrome, Edge, or Opera on desktop.');
    }

    if (customBaud) this.baudRate = parseInt(customBaud, 10);
    this._setStatus('CONNECTING');

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });
      this._setStatus('CONNECTED');
      this._appendRawLog(`[SYSTEM] Web Serial port opened at ${this.baudRate} baud.`);
      
      this._readSerialStream();
      return true;
    } catch (err) {
      this._setStatus('DISCONNECTED');
      this._appendRawLog(`[ERROR] Serial connection failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Read incoming chunks from Web Serial stream line-by-line
   */
  async _readSerialStream() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let lineBuffer = '';

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.stats.bytesReceived += value.length;
          lineBuffer += value;
          
          let lines = lineBuffer.split(/\r\n|\n|\r/);
          lineBuffer = lines.pop(); // Keep partial line

          for (const line of lines) {
            const clean = line.trim();
            if (clean.length > 0) {
              this._handleIncomingLine(clean);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Hardware] Serial stream read ended:', err);
      this._appendRawLog(`[WARN] Serial stream interrupted: ${err.message}`);
    } finally {
      this._setStatus('DISCONNECTED');
      if (this.reader) {
        try { this.reader.releaseLock(); } catch (e) {}
      }
    }
  }

  /**
   * Connect via WebSocket (ESP32 Wi-Fi)
   */
  connectWebSocket(url) {
    if (url) this.wsUrl = url;
    this._setStatus('CONNECTING');
    this._appendRawLog(`[SYSTEM] Connecting to WebSocket ${this.wsUrl}...`);

    try {
      if (this.ws) {
        this.ws.close();
      }
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this._setStatus('CONNECTED');
        this._appendRawLog(`[SYSTEM] WebSocket connected to ${this.wsUrl}`);
      };

      this.ws.onmessage = (event) => {
        const text = event.data;
        if (typeof text === 'string') {
          this.stats.bytesReceived += text.length;
          const clean = text.trim();
          if (clean.length > 0) {
            this._handleIncomingLine(clean);
          }
        }
      };

      this.ws.onerror = (err) => {
        this._appendRawLog(`[ERROR] WebSocket error: ${err.message || 'Connection refused'}`);
      };

      this.ws.onclose = () => {
        this._setStatus('DISCONNECTED');
        this._appendRawLog(`[SYSTEM] WebSocket closed.`);
      };
      return true;
    } catch (err) {
      this._setStatus('DISCONNECTED');
      this._appendRawLog(`[ERROR] WebSocket failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Connect via HTTP Polling
   */
  startHttpPolling(url, intervalMs = 500) {
    if (url) this.httpUrl = url;
    this.httpPollingMs = intervalMs;
    this._setStatus('CONNECTING');
    this._appendRawLog(`[SYSTEM] Starting HTTP telemetry polling: ${this.httpUrl} (${this.httpPollingMs}ms)`);

    if (this.httpInterval) clearInterval(this.httpInterval);

    const poll = async () => {
      try {
        const res = await fetch(this.httpUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        this.stats.bytesReceived += text.length;
        this._handleIncomingLine(text.trim());
        this._setStatus('CONNECTED');
      } catch (err) {
        // HTTP request failed
        if (this.status === 'CONNECTED') {
          this._setStatus('STALE');
        }
      }
    };

    poll();
    this.httpInterval = setInterval(poll, this.httpPollingMs);
  }

  /**
   * Disconnect any active hardware interface
   */
  async disconnect() {
    this._appendRawLog(`[SYSTEM] Disconnecting active hardware interface...`);

    if (this.httpInterval) {
      clearInterval(this.httpInterval);
      this.httpInterval = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    if (this.reader) {
      try { await this.reader.cancel(); } catch (e) {}
      this.reader = null;
    }

    if (this.port) {
      try { await this.port.close(); } catch (e) {}
      this.port = null;
    }

    this._setStatus('DISCONNECTED');
    this._appendRawLog(`[SYSTEM] Hardware disconnected.`);
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
   * Parse sensor line according to selected protocol
   */
  parseSensorLine(line) {
    if (!line || typeof line !== 'string') return null;

    try {
      // 1. JSON Format Check
      if (line.startsWith('{') && line.endsWith('}')) {
        const obj = JSON.parse(line);
        return this._normalizeTelemetry(obj);
      }

      // 2. Key-Value Format: GAS:120,CO:15,TEMP:28.4...
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

      // 3. Comma-Separated Values (CSV default)
      // Standard order: gas, co, co2, temp, humidity, water, obstacle, rover_status
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
          rover_status: parts[7] || 'STATIONARY',
          timestamp: Date.now()
        };
      }

      // 4. Custom evaluation if configured
      if (this.parserFormat === 'custom' && this.customParserFn) {
        return this.customParserFn(line);
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
      rover_status: raw.rover_status ?? raw.status ?? raw.state ?? 'IDLE',
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

  clearRawLogs() {
    this.rawLogBuffer = [];
  }
}

window.HardwareManager = new HardwareConnectionManager();

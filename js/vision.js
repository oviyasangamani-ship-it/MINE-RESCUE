/**
 * Tactical Vision Subsystem
 * Manages ESP32-CAM MJPEG stream, Laptop WebCam fallback, and client-side Person Detection.
 */
class TacticalVisionSystem {
  constructor() {
    this.source = 'none'; // 'none' | 'esp32' | 'webcam'
    this.streamUrl = 'http://192.168.4.1/stream';
    this.videoElement = null;
    this.canvasElement = null;
    this.ctx = null;
    this.detector = new VisionDetectorManager();
    
    this.isStreaming = false;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = Date.now();
    this.animFrameId = null;

    this.latestDetections = [];
    this.personDetected = false;
    this.lastPersonAlertTime = 0;
    this.snapshotHistory = [];
  }

  async init(videoElem, canvasElem) {
    this.videoElement = videoElem;
    this.canvasElement = canvasElem;
    this.ctx = canvasElem.getContext('2d');
    
    // Initialize detector engine
    await this.detector.initialize();

    // Render standby screen initially
    this.renderStandby();
  }

  setSource(newSource, customUrl = null) {
    if (customUrl) this.streamUrl = customUrl;
    this.stopStream();

    this.source = newSource;
    if (newSource === 'esp32') {
      this.startEsp32Stream();
    } else if (newSource === 'webcam') {
      this.startWebcamStream();
    } else {
      this.renderStandby();
    }
  }

  /**
   * Start ESP32-CAM MJPEG Stream
   */
  startEsp32Stream() {
    if (!this.videoElement) return;

    this.isStreaming = true;
    console.log(`[Vision] Connecting to ESP32-CAM stream: ${this.streamUrl}`);
    
    // For MJPEG streams, we can use an image or video/canvas pump
    this._mjpegImg = new Image();
    this._mjpegImg.crossOrigin = 'anonymous';
    this._mjpegImg.src = this.streamUrl;

    this._mjpegImg.onload = () => {
      this._startProcessingLoop();
    };

    this._mjpegImg.onerror = () => {
      console.warn('[Vision] ESP32-CAM stream unreachable. Verify IP and Wi-Fi.');
      this.renderNoSignal('ESP32-CAM UNREACHABLE — CHECK IP / WIFI');
    };
  }

  /**
   * Start Laptop WebCam via getUserMedia
   */
  async startWebcamStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access (getUserMedia) is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });

      this.videoElement.srcObject = stream;
      await this.videoElement.play();
      this.isStreaming = true;
      this._startProcessingLoop();

      if (window.Telemetry) {
        window.Telemetry.logEvent('SYSTEM', 'Tactical Laptop Camera Stream Activated', 'INFO');
      }
    } catch (err) {
      console.error('[Vision] WebCam access failed:', err);
      this.renderNoSignal(`WEBCAM DENIED: ${err.message}`);
    }
  }

  /**
   * Stop any active video stream
   */
  stopStream() {
    this.isStreaming = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = this.videoElement.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      this.videoElement.srcObject = null;
    }

    if (this._mjpegImg) {
      this._mjpegImg.src = '';
      this._mjpegImg = null;
    }

    this.latestDetections = [];
    this.personDetected = false;
  }

  /**
   * Continuous frame capture, rendering, and AI detection loop
   */
  _startProcessingLoop() {
    let lastInferenceTime = 0;

    const loop = async () => {
      if (!this.isStreaming) return;

      const now = Date.now();
      this.frameCount++;
      if (now - this.lastFpsUpdate >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      // Draw active source onto canvas
      const w = this.canvasElement.width;
      const h = this.canvasElement.height;

      if (this.source === 'webcam' && this.videoElement && this.videoElement.readyState >= 2) {
        this.ctx.drawImage(this.videoElement, 0, 0, w, h);
      } else if (this.source === 'esp32' && this._mjpegImg && this._mjpegImg.complete) {
        this.ctx.drawImage(this._mjpegImg, 0, 0, w, h);
      }

      // Run detection at ~8 FPS to keep UI buttery smooth
      if (now - lastInferenceTime > 120) {
        lastInferenceTime = now;
        const sourceElem = (this.source === 'webcam') ? this.videoElement : this._mjpegImg;
        if (sourceElem) {
          const detections = await this.detector.detect(sourceElem, this.canvasElement);
          this._processDetections(detections);
        }
      }

      // Render tactical HUD overlays, crosshairs, and bounding boxes
      this._renderTacticalOverlays();

      this.animFrameId = requestAnimationFrame(loop);
    };

    loop();
  }

  _processDetections(detections) {
    this.latestDetections = detections;
    const hadPerson = this.personDetected;
    this.personDetected = detections.some(d => d.class === 'person');

    const now = Date.now();
    if (this.personDetected && (!hadPerson || (now - this.lastPersonAlertTime > 8000))) {
      this.lastPersonAlertTime = now;
      
      // Trigger tactical audio chime
      if (window.TacticalAudio) {
        window.TacticalAudio.playPersonFound();
      }

      // Log event
      if (window.Telemetry) {
        const topScore = detections[0] ? detections[0].score : 85;
        window.Telemetry.logEvent(
          'PERSON_DETECTION',
          `Visual contact: Person detected — probably a worker (Confidence: ${topScore}%)`,
          'CRITICAL',
          { score: topScore, timestamp: now }
        );
      }
    }
  }

  /**
   * Draw high-contrast tactical HUD overlays on video canvas
   */
  _renderTacticalOverlays() {
    const ctx = this.ctx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    // 1. Draw Bounding Boxes for detected persons
    this.latestDetections.forEach(det => {
      const [bx, by, bw, bh] = det.bbox;
      // Scale if needed
      const scaleX = w / (this.videoElement?.videoWidth || 640);
      const scaleY = h / (this.videoElement?.videoHeight || 480);

      const x = bx * scaleX;
      const y = by * scaleY;
      const width = bw * scaleX;
      const height = bh * scaleY;

      // Outer tactical box
      ctx.strokeStyle = '#f59e0b'; // Amber / Orange tactical outline
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Corner brackets
      const cl = 12;
      ctx.strokeStyle = '#22c55e'; // Green corner lock
      ctx.lineWidth = 3;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(x + width - cl, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + cl);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(x, y + height - cl); ctx.lineTo(x, y + height); ctx.lineTo(x + cl, y + height);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(x + width - cl, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - cl);
      ctx.stroke();

      // Tag badge
      ctx.fillStyle = 'rgba(18, 22, 27, 0.9)';
      ctx.fillRect(x, y - 24, Math.max(220, width), 22);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y - 24, Math.max(220, width), 22);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(`TARGET: WORKER CANDIDATE [${det.score}%]`, x + 6, y - 9);
    });

    // 2. Tactical Watermark & HUD readouts
    ctx.fillStyle = 'rgba(16, 20, 24, 0.75)';
    ctx.fillRect(10, 10, 190, 48);
    ctx.strokeStyle = '#28313e';
    ctx.strokeRect(10, 10, 190, 48);

    ctx.fillStyle = '#34d399';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`STREAM: ${this.source.toUpperCase()}`, 18, 25);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`FPS: ${this.fps} | RES: ${w}x${h}`, 18, 38);
    ctx.fillText(`DETECTOR: ${this.detector.isOfflineMode ? 'EDGE TACTICAL' : 'COCO-SSD'}`, 18, 50);

    // 3. Center crosshair
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
    ctx.stroke();

    // 4. Scanline raster overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let sy = 0; sy < h; sy += 4) {
      ctx.fillRect(0, sy, w, 1);
    }
  }

  /**
   * Render authentic CRT / SCADA standby test pattern
   */
  renderStandby() {
    if (!this.ctx || !this.canvasElement) return;
    const ctx = this.ctx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    // Dark charcoal base
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1a222c';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Center crosshair & circle
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = '#283444';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 100, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 120, cy); ctx.lineTo(cx + 120, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 120); ctx.lineTo(cx, cy + 120); ctx.stroke();

    // Standby badge
    ctx.fillStyle = '#161c24';
    ctx.fillRect(cx - 140, cy - 25, 280, 50);
    ctx.strokeStyle = '#374151';
    ctx.strokeRect(cx - 140, cy - 25, 280, 50);

    ctx.fillStyle = '#e5a93c';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CAMERA FEED STANDBY', cx, cy - 5);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('SELECT ESP32-CAM OR WEBCAM SOURCE', cx, cy + 14);
    ctx.textAlign = 'left';
  }

  renderNoSignal(reason = 'NO SIGNAL') {
    if (!this.ctx || !this.canvasElement) return;
    const ctx = this.ctx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    ctx.fillStyle = '#0f1318';
    ctx.fillRect(0, 0, w, h);

    // SMPTE color bars simulation (desaturated industrial tone)
    const barWidth = w / 7;
    const colors = ['#3d4852', '#d97706', '#0284c7', '#16a34a', '#9333ea', '#dc2626', '#1e293b'];
    colors.forEach((c, idx) => {
      ctx.fillStyle = c;
      ctx.fillRect(idx * barWidth, 0, barWidth, h * 0.65);
    });

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    // Message box
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = 'rgba(15, 20, 25, 0.95)';
    ctx.fillRect(cx - 160, cy - 25, 320, 50);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 160, cy - 25, 320, 50);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO VIDEO SIGNAL', cx, cy - 5);
    ctx.fillStyle = '#d1d5db';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(reason, cx, cy + 14);
    ctx.textAlign = 'left';
  }

  /**
   * Capture snapshot frame
   */
  takeSnapshot() {
    if (!this.canvasElement) return null;
    const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.85);
    const snap = {
      id: 'snap_' + Date.now(),
      timestamp: Date.now(),
      dataUrl,
      personDetected: this.personDetected
    };
    this.snapshotHistory.unshift(snap);
    if (this.snapshotHistory.length > 20) this.snapshotHistory.pop();

    if (window.Telemetry) {
      window.Telemetry.logEvent('SYSTEM', 'Visual telemetry snapshot captured', 'SUCCESS', { snapId: snap.id });
    }
    return snap;
  }
}

window.VisionSystem = new TacticalVisionSystem();

/**
 * Tactical Sound Synthesizer (Web Audio API)
 * Fully offline, procedural audio synthesis for industrial alerts & micro-interactions.
 */
class TacticalAudioSystem {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('mine_audio_muted') === 'true';
    this.masterGain = null;
    this.lastBeepTime = 0;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.25, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('mine_audio_muted', this.isMuted.toString());
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.25, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  /**
   * Crisp UI click for SCADA switches & buttons
   */
  playClick() {
    if (this.isMuted) return;
    this._initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  /**
   * Telemetry packet tick (subtle radar pip)
   */
  playPacketTick() {
    if (this.isMuted) return;
    this._initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.015);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.015);
  }

  /**
   * Warning chime for elevated sensor parameters
   */
  playWarning() {
    if (this.isMuted) return;
    const now = Date.now();
    if (now - this.lastBeepTime < 1800) return; // Debounce
    this.lastBeepTime = now;

    this._initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
    osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.1); // E5

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  /**
   * Critical alarm: High hazard gas / emergency alert
   */
  playCriticalAlarm() {
    if (this.isMuted) return;
    const now = Date.now();
    if (now - this.lastBeepTime < 1200) return; // Debounce
    this.lastBeepTime = now;

    this._initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, t);
    osc.frequency.linearRampToValueAtTime(1400, t + 0.15);
    osc.frequency.linearRampToValueAtTime(950, t + 0.3);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(t + 0.4);
  }

  /**
   * Person detection chime (tactical sonar ping)
   */
  playPersonFound() {
    if (this.isMuted) return;
    this._initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      gain.gain.setValueAtTime(0.2, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.22);
    });
  }
}

window.TacticalAudio = new TacticalAudioSystem();

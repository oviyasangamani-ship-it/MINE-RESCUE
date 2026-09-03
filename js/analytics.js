/**
 * Industrial Hazard Assessment & Rescue Operational Readiness Engine
 * Multi-criteria decision support matrix for underground mining emergencies.
 */
class SafetyAnalyticsEngine {
  constructor() {
    this.thresholds = this._loadThresholds();
    this.prevHazardLevel = null;
    this.prevReadiness = null;
  }

  _loadThresholds() {
    const defaults = {
      gas: { warning: 250, critical: 500, unit: 'ppm / %' },
      co: { warning: 35, critical: 100, unit: 'ppm' },
      co2: { warning: 1000, critical: 2500, unit: 'ppm' },
      temp: { warning: 38.0, critical: 50.0, unit: '°C' },
      humidity: { warning: 85.0, critical: 95.0, unit: '%RH' },
      water: { warning: 25.0, critical: 65.0, unit: 'mm' },
      obstacle: { warning: 35.0, critical: 15.0, unit: 'cm' } // Low is critical
    };

    try {
      const stored = localStorage.getItem('mine_rescue_thresholds');
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch (e) {}

    return defaults;
  }

  saveThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    try {
      localStorage.setItem('mine_rescue_thresholds', JSON.stringify(this.thresholds));
    } catch (e) {}
  }

  /**
   * Determine safety status for an individual metric
   */
  getMetricStatus(metricKey, value) {
    if (value === null || value === undefined || isNaN(value)) {
      return { status: 'NO_DATA', label: 'Awaiting data', color: 'var(--status-muted)' };
    }

    const t = this.thresholds[metricKey];
    if (!t) return { status: 'SAFE', label: 'NORMAL', color: 'var(--status-safe)' };

    // Obstacle is inverted (lower distance = higher hazard)
    if (metricKey === 'obstacle') {
      if (value <= t.critical) return { status: 'CRITICAL', label: 'COLLISION RISK', color: 'var(--status-critical)' };
      if (value <= t.warning) return { status: 'WARNING', label: 'PROXIMITY CAUTION', color: 'var(--status-warning)' };
      return { status: 'SAFE', label: 'CLEAR', color: 'var(--status-safe)' };
    }

    if (value >= t.critical) return { status: 'CRITICAL', label: 'CRITICAL HAZARD', color: 'var(--status-critical)' };
    if (value >= t.warning) return { status: 'WARNING', label: 'ELEVATED / CAUTION', color: 'var(--status-warning)' };
    return { status: 'SAFE', label: 'NORMAL / SAFE', color: 'var(--status-safe)' };
  }

  /**
   * Perform comprehensive hazard assessment
   */
  evaluateHazards(telemetry, hardwareStatus = 'CONNECTED') {
    if (!telemetry || hardwareStatus === 'DISCONNECTED' || telemetry.gas === null) {
      return {
        level: 'UNKNOWN',
        levelLabel: 'AWAITING TELEMETRY',
        color: 'var(--status-muted)',
        activeHazards: [],
        primaryAction: 'Establish rover serial/Wi-Fi communication link to commence atmospheric hazard assessment.',
        isDisconnected: true
      };
    }

    const activeHazards = [];
    let hasCritical = false;
    let hasWarning = false;

    // 1. Toxic & Flammable Gas
    if (telemetry.gas >= this.thresholds.gas.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'gas_crit',
        title: 'Explosive / Toxic Gas Accumulation',
        description: `Gas level at ${telemetry.gas} ppm exceeds critical threshold (${this.thresholds.gas.critical} ppm).`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.gas >= this.thresholds.gas.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'gas_warn',
        title: 'Elevated Combustible Gas Index',
        description: `Gas level at ${telemetry.gas} ppm exceeds reference caution threshold (${this.thresholds.gas.warning} ppm).`,
        severity: 'WARNING'
      });
    }

    // 2. Carbon Monoxide (CO)
    if (telemetry.co >= this.thresholds.co.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'co_crit',
        title: 'Lethal Carbon Monoxide Concentration',
        description: `CO at ${telemetry.co} ppm is lethal within short exposure times (threshold: ${this.thresholds.co.critical} ppm).`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.co >= this.thresholds.co.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'co_warn',
        title: 'Moderate CO Accumulation',
        description: `CO level at ${telemetry.co} ppm requires SCBA gear for any human entry.`,
        severity: 'WARNING'
      });
    }

    // 3. Carbon Dioxide (CO2)
    if (telemetry.co2 >= this.thresholds.co2.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'co2_crit',
        title: 'Asphyxiation Hazard (High CO₂)',
        description: `CO₂ at ${telemetry.co2} ppm indicates severe ventilation deficiency.`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.co2 >= this.thresholds.co2.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'co2_warn',
        title: 'Elevated CO₂ Concentration',
        description: `CO₂ at ${telemetry.co2} ppm above standard subterranean baseline.`,
        severity: 'WARNING'
      });
    }

    // 4. Water / Flood
    if (telemetry.water >= this.thresholds.water.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'water_crit',
        title: 'Critical Tunnel Inundation / Flooding',
        description: `Water depth at ${telemetry.water} mm impairs ground transit and indicates active ingress.`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.water >= this.thresholds.water.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'water_warn',
        title: 'Water Accumulation in Adit',
        description: `Water level at ${telemetry.water} mm. Sump pump capacity check recommended.`,
        severity: 'WARNING'
      });
    }

    // 5. Thermal Stress
    if (telemetry.temp >= this.thresholds.temp.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'temp_crit',
        title: 'Extreme Heat / Subsurface Fire Risk',
        description: `Ambient temp ${telemetry.temp}°C indicates potential fire or secondary thermal reaction.`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.temp >= this.thresholds.temp.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'temp_warn',
        title: 'Elevated Shaft Temperature',
        description: `Ambient temp ${telemetry.temp}°C presents heat exhaustion hazard.`,
        severity: 'WARNING'
      });
    }

    // 6. Obstacle
    if (telemetry.obstacle <= this.thresholds.obstacle.critical) {
      activeHazards.push({
        id: 'obst_crit',
        title: 'Tunnel Path Blockage / Rockfall Obstacle',
        description: `Forward clearance at ${telemetry.obstacle} cm indicates impassable rubble.`,
        severity: 'WARNING'
      });
    }

    let level = 'SAFE';
    let levelLabel = 'ATMOSPHERE NOMINAL';
    let color = 'var(--status-safe)';
    let primaryAction = 'Atmospheric parameters within acceptable reference ranges. Continue planned reconnaissance sweep.';

    if (hasCritical) {
      level = 'CRITICAL';
      levelLabel = 'CRITICAL HAZARD DETECTED';
      color = 'var(--status-critical)';
      primaryAction = 'HALT HUMAN CREW ENTRY. Deploy forced ventilation into target adit. Hold rover position or initiate autonomous fallback.';
    } else if (hasWarning) {
      level = 'WARNING';
      levelLabel = 'ELEVATED HAZARD / CAUTION';
      color = 'var(--status-warning)';
      primaryAction = 'Maintain continuous telemetry sampling. Require Level-2 SCBA protection for any rescue team advance.';
    }

    return {
      level,
      levelLabel,
      color,
      activeHazards,
      primaryAction,
      isDisconnected: false
    };
  }

  /**
   * Compute Rescue Operational Readiness Index (0 - 100%)
   */
  calculateReadiness(telemetry, hardwareStatus = 'CONNECTED', personDetected = false, cameraActive = false) {
    if (!telemetry || hardwareStatus === 'DISCONNECTED' || telemetry.gas === null) {
      return {
        score: null,
        scoreLabel: '— %',
        status: 'DISCONNECTED',
        color: 'var(--status-muted)',
        factors: [],
        disclaimer: 'Operational readiness calculation requires active live hardware telemetry stream.'
      };
    }

    let baseScore = 100;
    const factors = [];

    // Factor 1: Gas Toxicity & Combustibility (Max deduction: 40)
    let gasPenalty = 0;
    if (telemetry.gas >= this.thresholds.gas.critical) gasPenalty += 25;
    else if (telemetry.gas >= this.thresholds.gas.warning) gasPenalty += 12;

    if (telemetry.co >= this.thresholds.co.critical) gasPenalty += 25;
    else if (telemetry.co >= this.thresholds.co.warning) gasPenalty += 10;

    if (telemetry.co2 >= this.thresholds.co2.critical) gasPenalty += 15;
    else if (telemetry.co2 >= this.thresholds.co2.warning) gasPenalty += 6;

    gasPenalty = Math.min(45, gasPenalty);
    baseScore -= gasPenalty;
    factors.push({
      name: 'Atmospheric Safety (Gas / CO / CO₂)',
      weight: '35%',
      penalty: gasPenalty > 0 ? `-${gasPenalty}%` : '0%',
      status: gasPenalty > 20 ? 'CRITICAL' : (gasPenalty > 0 ? 'WARNING' : 'SAFE'),
      detail: gasPenalty === 0 ? 'Atmospheric envelope safe' : `Gas indices elevated (${gasPenalty}% impact)`
    });

    // Factor 2: Flood & Inundation (Max deduction: 20)
    let floodPenalty = 0;
    if (telemetry.water >= this.thresholds.water.critical) floodPenalty = 20;
    else if (telemetry.water >= this.thresholds.water.warning) floodPenalty = 10;

    baseScore -= floodPenalty;
    factors.push({
      name: 'Water Level & Flood Clearance',
      weight: '20%',
      penalty: floodPenalty > 0 ? `-${floodPenalty}%` : '0%',
      status: floodPenalty >= 20 ? 'CRITICAL' : (floodPenalty > 0 ? 'WARNING' : 'SAFE'),
      detail: floodPenalty === 0 ? 'Dry / Passable terrain' : `Water depth ${telemetry.water}mm impairs mobility`
    });

    // Factor 3: Thermal & Environmental Envelope (Max deduction: 15)
    let tempPenalty = 0;
    if (telemetry.temp >= this.thresholds.temp.critical) tempPenalty += 15;
    else if (telemetry.temp >= this.thresholds.temp.warning) tempPenalty += 8;

    if (telemetry.humidity >= this.thresholds.humidity.critical) tempPenalty += 5;

    tempPenalty = Math.min(15, tempPenalty);
    baseScore -= tempPenalty;
    factors.push({
      name: 'Thermal & Humidity Envelope',
      weight: '15%',
      penalty: tempPenalty > 0 ? `-${tempPenalty}%` : '0%',
      status: tempPenalty >= 15 ? 'CRITICAL' : (tempPenalty > 0 ? 'WARNING' : 'SAFE'),
      detail: tempPenalty === 0 ? 'Nominal underground climate' : `Thermal stress: ${telemetry.temp}°C`
    });

    // Factor 4: Communication & Telemetry Health (Max deduction: 15)
    let commPenalty = 0;
    if (hardwareStatus === 'STALE') commPenalty = 15;
    baseScore -= commPenalty;
    factors.push({
      name: 'Telemetry Link Health',
      weight: '15%',
      penalty: commPenalty > 0 ? `-${commPenalty}%` : '0%',
      status: commPenalty > 0 ? 'WARNING' : 'SAFE',
      detail: commPenalty === 0 ? 'Active real-time RX stream' : 'Telemetry packet latency elevated'
    });

    // Factor 5: Rover Path Clearance & Vision Link (Max deduction: 15)
    let pathPenalty = 0;
    if (telemetry.obstacle <= this.thresholds.obstacle.critical) pathPenalty += 10;
    if (!cameraActive) pathPenalty += 5;

    baseScore -= pathPenalty;
    factors.push({
      name: 'Path Clearance & Video Stream',
      weight: '15%',
      penalty: pathPenalty > 0 ? `-${pathPenalty}%` : '0%',
      status: pathPenalty >= 10 ? 'WARNING' : 'SAFE',
      detail: pathPenalty === 0 ? 'Path clear, video online' : (telemetry.obstacle <= this.thresholds.obstacle.critical ? 'Obstacle ahead (<15cm)' : 'Video stream standby')
    });

    // Person detected bonus / priority indicator
    if (personDetected) {
      factors.push({
        name: 'Target Worker Detection (Mission Priority)',
        weight: 'PRIORITY',
        penalty: '+10% Focus',
        status: 'SUCCESS',
        detail: 'Candidate human signature detected in visual stream'
      });
    }

    const finalScore = Math.max(5, Math.min(100, Math.round(baseScore)));

    let status = 'OPTIMAL';
    let color = 'var(--status-safe)';
    if (finalScore < 45) {
      status = 'RESTRICTED / NO-GO';
      color = 'var(--status-critical)';
    } else if (finalScore < 75) {
      status = 'CONDITIONAL / CAUTION';
      color = 'var(--status-warning)';
    }

    return {
      score: finalScore,
      scoreLabel: `${finalScore}%`,
      status,
      color,
      factors,
      disclaimer: 'Software-estimated operational readiness index based on multi-criteria telemetry matrix — not a probability of rescue success.'
    };
  }

  /**
   * Synthesize comprehensive decision support summary
   */
  generateDecisionSupport(telemetry, hazardAssessment, readiness, hardwareStatus, cameraStatus, personDetected) {
    if (!telemetry || hardwareStatus === 'DISCONNECTED' || telemetry.gas === null) {
      return {
        situation: 'System on standby. No physical hardware connection established.',
        environmental: 'Atmospheric telemetry unavailable.',
        communication: 'Offline. Connect USB Serial or ESP32 Wi-Fi to begin.',
        camera: cameraStatus ? 'Video stream active.' : 'Camera feed offline.',
        action: 'Plug in Arduino / ESP32 rover to commence real-time atmospheric survey.',
        confidence: 'N/A'
      };
    }

    let situation = 'Rover in operational area. ';
    if (personDetected) {
      situation += 'URGENT: Human worker signature pinpointed in camera visual feed.';
    } else if (hazardAssessment.level === 'CRITICAL') {
      situation += 'CRITICAL HAZARD: Atmospheric conditions hazardous for unassisted human entry.';
    } else if (hazardAssessment.level === 'WARNING') {
      situation += 'CAUTION: Subterranean atmosphere elevated above normal baselines.';
    } else {
      situation += 'Atmospheric and physical envelope currently within acceptable parameters.';
    }

    const environmental = `Gas: ${telemetry.gas} ppm (${this.getMetricStatus('gas', telemetry.gas).label}), CO: ${telemetry.co} ppm, Temp: ${telemetry.temp}°C, Flood: ${telemetry.water} mm.`;
    
    const comm = hardwareStatus === 'CONNECTED' 
      ? 'Telemetry link stable (Real-time RX, 0 packet loss).'
      : (hardwareStatus === 'STALE' ? 'Telemetry link STALE (high packet latency detected).' : 'Communication link disconnected.');

    const cam = cameraStatus 
      ? `Live feed active with client-side AI detection (${personDetected ? 'Worker detected' : 'Scanning for workers'}).`
      : 'Camera stream standby / offline.';

    return {
      situation,
      environmental,
      communication: comm,
      camera: cam,
      action: hazardAssessment.primaryAction,
      confidence: `${readiness.score !== null ? readiness.score : 0}% Readiness Index`
    };
  }
}

window.AnalyticsEngine = new SafetyAnalyticsEngine();

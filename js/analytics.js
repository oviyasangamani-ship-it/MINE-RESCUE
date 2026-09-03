/**
 * Industrial Hazard Assessment & Rescue Operational Readiness Engine
 * Real-time decision support matrix with consolidated Toxic Gases and Rover IMU condition evaluation.
 */
class SafetyAnalyticsEngine {
  constructor() {
    this.thresholds = this._loadThresholds();
  }

  _loadThresholds() {
    const defaults = {
      gas: { warning: 250, critical: 500, unit: 'ppm' },
      co: { warning: 35, critical: 100, unit: 'ppm' },
      co2: { warning: 1000, critical: 2500, unit: 'ppm' },
      temp: { warning: 38.0, critical: 50.0, unit: '°C' },
      humidity: { warning: 85.0, critical: 95.0, unit: '%RH' },
      water: { warning: 25.0, critical: 65.0, unit: 'mm' },
      obstacle: { warning: 35.0, critical: 15.0, unit: 'cm' },
      speed: { warning: 1.0, critical: 1.8, unit: 'm/s' },
      tilt: { warning: 20.0, critical: 35.0, unit: '°' }
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

    if (metricKey === 'obstacle') {
      if (value <= t.critical) return { status: 'CRITICAL', label: 'COLLISION RISK', color: 'var(--status-critical)' };
      if (value <= t.warning) return { status: 'WARNING', label: 'PROXIMITY CAUTION', color: 'var(--status-warning)' };
      return { status: 'SAFE', label: 'CLEAR', color: 'var(--status-safe)' };
    }

    if (value >= t.critical) return { status: 'CRITICAL', label: 'CRITICAL', color: 'var(--status-critical)' };
    if (value >= t.warning) return { status: 'WARNING', label: 'CAUTION', color: 'var(--status-warning)' };
    return { status: 'SAFE', label: 'SAFE', color: 'var(--status-safe)' };
  }

  /**
   * Evaluates Consolidated Toxic Gases Card status (combines Gas, CO, and CO2)
   */
  getConsolidatedGasStatus(gas, co, co2) {
    if (gas === null || gas === undefined) {
      return { status: 'NO_DATA', label: 'Awaiting data', color: 'var(--status-muted)' };
    }

    const statGas = this.getMetricStatus('gas', gas);
    const statCo = this.getMetricStatus('co', co);
    const statCo2 = this.getMetricStatus('co2', co2);

    if (statGas.status === 'CRITICAL' || statCo.status === 'CRITICAL' || statCo2.status === 'CRITICAL') {
      return { status: 'CRITICAL', label: 'CRITICAL TOXIC GAS', color: 'var(--status-critical)' };
    }
    if (statGas.status === 'WARNING' || statCo.status === 'WARNING' || statCo2.status === 'WARNING') {
      return { status: 'WARNING', label: 'ELEVATED GAS', color: 'var(--status-warning)' };
    }
    return { status: 'SAFE', label: 'SAFE', color: 'var(--status-safe)' };
  }

  /**
   * Evaluate Rover IMU Speed and Tilt condition for threshold warnings
   */
  evaluateRoverIMU(speed, tilt) {
    if (speed === null || speed === undefined || isNaN(speed)) {
      return {
        hasWarning: false,
        warningType: 'NONE',
        message: '',
        status: 'NO_DATA'
      };
    }

    const isSpeedCrit = (speed >= this.thresholds.speed.critical);
    const isSpeedWarn = (speed >= this.thresholds.speed.warning);
    const isTiltCrit = (Math.abs(tilt) >= this.thresholds.tilt.critical);
    const isTiltWarn = (Math.abs(tilt) >= this.thresholds.tilt.warning);

    if (isSpeedCrit && isTiltCrit) {
      return {
        hasWarning: true,
        warningType: 'BOTH',
        message: 'Warning: Rover accelerating excessively and abnormal tilt detected.',
        status: 'CRITICAL'
      };
    }
    if (isTiltCrit) {
      return {
        hasWarning: true,
        warningType: 'TILT',
        message: 'Warning: Abnormal rover tilt detected (exceeds safe rollover limit).',
        status: 'CRITICAL'
      };
    }
    if (isSpeedCrit) {
      return {
        hasWarning: true,
        warningType: 'SPEED',
        message: 'Warning: Linear speed above critical safety threshold.',
        status: 'CRITICAL'
      };
    }
    if (isTiltWarn) {
      return {
        hasWarning: true,
        warningType: 'TILT',
        message: 'Warning: Rover tilt angle outside nominal safe range.',
        status: 'WARNING'
      };
    }
    if (isSpeedWarn) {
      return {
        hasWarning: true,
        warningType: 'SPEED',
        message: 'Warning: Rover accelerating too fast on uneven terrain.',
        status: 'WARNING'
      };
    }

    return {
      hasWarning: false,
      warningType: 'NONE',
      message: '',
      status: 'SAFE'
    };
  }

  /**
   * Perform concise hazard assessment
   */
  evaluateHazards(telemetry, hardwareStatus = 'CONNECTED') {
    if (!telemetry || hardwareStatus === 'DISCONNECTED' || telemetry.gas === null) {
      return {
        level: 'UNKNOWN',
        levelLabel: 'AWAITING TELEMETRY',
        color: 'var(--status-muted)',
        activeHazards: [],
        primaryAction: 'Connect rover hardware to evaluate live atmospheric hazards.',
        isDisconnected: true
      };
    }

    const activeHazards = [];
    let hasCritical = false;
    let hasWarning = false;

    // 1. Toxic / Combustible Gas
    if (telemetry.gas >= this.thresholds.gas.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'gas_crit',
        title: 'Critical Combustible / Toxic Gas',
        description: `Gas level ${telemetry.gas} ppm exceeds limit (${this.thresholds.gas.critical} ppm).`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.gas >= this.thresholds.gas.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'gas_warn',
        title: 'Elevated Gas Index',
        description: `Gas concentration ${telemetry.gas} ppm above baseline.`,
        severity: 'WARNING'
      });
    }

    // 2. Carbon Monoxide (CO)
    if (telemetry.co >= this.thresholds.co.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'co_crit',
        title: 'Lethal Carbon Monoxide (CO)',
        description: `CO level at ${telemetry.co} ppm is life-threatening.`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.co >= this.thresholds.co.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'co_warn',
        title: 'Moderate CO Accumulation',
        description: `CO level at ${telemetry.co} ppm. SCBA gear required.`,
        severity: 'WARNING'
      });
    }

    // 3. Water / Flood
    if (telemetry.water >= this.thresholds.water.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'water_crit',
        title: 'Adit Flooding Inundation',
        description: `Water depth ${telemetry.water} mm impairs rover track transit.`,
        severity: 'CRITICAL'
      });
    } else if (telemetry.water >= this.thresholds.water.warning) {
      hasWarning = true;
      activeHazards.push({
        id: 'water_warn',
        title: 'Water Ingress Caution',
        description: `Water accumulation at ${telemetry.water} mm.`,
        severity: 'WARNING'
      });
    }

    // 4. Thermal
    if (telemetry.temp >= this.thresholds.temp.critical) {
      hasCritical = true;
      activeHazards.push({
        id: 'temp_crit',
        title: 'Extreme Heat / Fire Sentry',
        description: `Shaft temperature at ${telemetry.temp}°C.`,
        severity: 'CRITICAL'
      });
    }

    // 5. Obstacle
    if (telemetry.obstacle <= this.thresholds.obstacle.critical) {
      activeHazards.push({
        id: 'obst_crit',
        title: 'Tunnel Path Blockage',
        description: `Obstacle clearance below ${telemetry.obstacle} cm.`,
        severity: 'WARNING'
      });
    }

    let level = 'SAFE';
    let levelLabel = 'ATMOSPHERE NOMINAL';
    let color = 'var(--status-safe)';
    let primaryAction = 'Atmospheric envelope safe. Proceed with planned reconnaissance sweep.';

    if (hasCritical) {
      level = 'CRITICAL';
      levelLabel = 'CRITICAL HAZARD DETECTED';
      color = 'var(--status-critical)';
      primaryAction = 'HALT HUMAN CREW ADVANCE. Activate emergency adit ventilation. Hold rover position.';
    } else if (hasWarning) {
      level = 'WARNING';
      levelLabel = 'ELEVATED HAZARD / CAUTION';
      color = 'var(--status-warning)';
      primaryAction = 'Maintain continuous telemetry sampling. Require Level-2 SCBA protection for any advance.';
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

    // Gas factor (Weight: 25%)
    if (telemetry.gas >= this.thresholds.gas.critical) {
      baseScore -= 25;
      factors.push({ name: 'Toxic Gas Level', penalty: '-25%', weight: '25%', status: 'CRITICAL', detail: `Gas level at ${telemetry.gas} ppm exceeded critical cutoff.` });
    } else if (telemetry.gas >= this.thresholds.gas.warning) {
      baseScore -= 12;
      factors.push({ name: 'Toxic Gas Level', penalty: '-12%', weight: '25%', status: 'WARNING', detail: `Gas level at ${telemetry.gas} ppm is elevated.` });
    } else {
      factors.push({ name: 'Toxic Gas Level', penalty: '0%', weight: '25%', status: 'SAFE', detail: 'Gas concentration within nominal baseline limits.' });
    }

    // CO factor (Weight: 20%)
    if (telemetry.co >= this.thresholds.co.critical) {
      baseScore -= 20;
      factors.push({ name: 'Carbon Monoxide', penalty: '-20%', weight: '20%', status: 'CRITICAL', detail: `CO concentration ${telemetry.co} ppm is life-threatening.` });
    } else if (telemetry.co >= this.thresholds.co.warning) {
      baseScore -= 10;
      factors.push({ name: 'Carbon Monoxide', penalty: '-10%', weight: '20%', status: 'WARNING', detail: `CO level at ${telemetry.co} ppm.` });
    } else {
      factors.push({ name: 'Carbon Monoxide', penalty: '0%', weight: '20%', status: 'SAFE', detail: 'CO level nominal.' });
    }

    // Flooding factor (Weight: 20%)
    if (telemetry.water >= this.thresholds.water.critical) {
      baseScore -= 20;
      factors.push({ name: 'Water & Flooding', penalty: '-20%', weight: '20%', status: 'CRITICAL', detail: `Water height ${telemetry.water} mm restricts track transit.` });
    } else if (telemetry.water >= this.thresholds.water.warning) {
      baseScore -= 8;
      factors.push({ name: 'Water & Flooding', penalty: '-8%', weight: '20%', status: 'WARNING', detail: `Water ingress at ${telemetry.water} mm.` });
    } else {
      factors.push({ name: 'Water & Flooding', penalty: '0%', weight: '20%', status: 'SAFE', detail: 'No standing water detected in passage.' });
    }

    // Thermal factor (Weight: 15%)
    if (telemetry.temp >= this.thresholds.temp.critical) {
      baseScore -= 15;
      factors.push({ name: 'Thermal Stress', penalty: '-15%', weight: '15%', status: 'CRITICAL', detail: `High shaft temperature (${telemetry.temp}°C).` });
    } else if (telemetry.temp >= this.thresholds.temp.warning) {
      baseScore -= 6;
      factors.push({ name: 'Thermal Stress', penalty: '-6%', weight: '15%', status: 'WARNING', detail: `Elevated ambient temp (${telemetry.temp}°C).` });
    } else {
      factors.push({ name: 'Thermal Stress', penalty: '0%', weight: '15%', status: 'SAFE', detail: 'Ambient shaft temperature normal.' });
    }

    // Clearance factor (Weight: 10%)
    if (telemetry.obstacle <= this.thresholds.obstacle.critical) {
      baseScore -= 10;
      factors.push({ name: 'Tunnel Clearance', penalty: '-10%', weight: '10%', status: 'CRITICAL', detail: `Path obstructed (${telemetry.obstacle} cm).` });
    } else {
      factors.push({ name: 'Tunnel Clearance', penalty: '0%', weight: '10%', status: 'SAFE', detail: 'Clear forward passage.' });
    }

    // Person bonus (Up to +10% urgency/relevance)
    if (personDetected) {
      factors.push({ name: 'Survivor Detection', penalty: '+5%', weight: 'Bonus', status: 'SAFE', detail: 'Person visual confirmation active.' });
    }

    const finalScore = Math.max(0, Math.min(100, baseScore));
    let status = 'GO - OPTIMAL';
    let color = 'var(--status-safe)';

    if (finalScore < 45) {
      status = 'NO-GO / RESTRICTED';
      color = 'var(--status-critical)';
    } else if (finalScore < 75) {
      status = 'CONDITIONAL CAUTION';
      color = 'var(--status-warning)';
    }

    return {
      score: finalScore,
      scoreLabel: `${finalScore}%`,
      status,
      color,
      factors,
      disclaimer: 'Software-estimated operational index based on current atmospheric & sensor readings.'
    };
  }
}

window.AnalyticsEngine = new SafetyAnalyticsEngine();

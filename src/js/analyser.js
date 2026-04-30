/**
 * analyser.js — Applies BBD5249 v3.1 alarm limits to parsed train data.
 *
 * Depends on: ALARM_LIMITS, SEVERITY, RAIL_TYPE (from config/alarm-limits.js)
 * Depends on: Parser output (TrainData) from parser.js
 */

const Analyser = (() => {

  /**
   * Main entry point. Analyses a parsed TrainData object against BBD5249 limits.
   * @param {object} trainData - output from Parser.parseConditionFile()
   * @param {string} railType  - RAIL_TYPE.S_LINE or RAIL_TYPE.N1_LINE
   * @returns {AnalysisResult}
   */
  function analyse(trainData, railType) {
    const limits = ALARM_LIMITS;
    const impactLimits = limits.wheelImpact[railType];

    const channelHealth = assessChannelHealth(trainData.offsets, limits.channelOffset);
    const vehicleResults = trainData.vehicles.map(v => assessVehicle(v, impactLimits, limits));

    const allAxleResults = vehicleResults.flatMap(v => v.axleResults);
    const allExceedances = vehicleResults.flatMap(v => v.exceedances);

    const stats = computeStats(allAxleResults, allExceedances);
    const verdict = determineVerdict(channelHealth, stats, limits.falseAlarmHeuristics);

    return {
      railType,
      channelHealth,
      vehicleResults,
      stats,
      verdict,
    };
  }

  // ── Channel health ─────────────────────────────────────────────────────────

  function assessChannelHealth(offsets, thresholds) {
    const channels = offsets.map(o => {
      const absVal = Math.abs(o.value);
      let status = 'healthy';
      if (absVal >= thresholds.faultThreshold) {
        status = 'fault';
      } else if (absVal >= thresholds.warningThreshold) {
        status = 'warning';
      }
      return { channel: o.channel, value: o.value, status };
    });

    const faultCount   = channels.filter(c => c.status === 'fault').length;
    const warningCount = channels.filter(c => c.status === 'warning').length;
    const total        = channels.length;
    const faultFraction = total > 0 ? faultCount / total : 0;

    return { channels, faultCount, warningCount, total, faultFraction };
  }

  // ── Per-vehicle assessment ─────────────────────────────────────────────────

  function assessVehicle(vehicle, impactLimits, limits) {
    const exceedances = [];
    const axleResults = [];

    // Side-to-side skew (vehicle level)
    if (vehicle.sideToSideSkew != null) {
      const skewPct = vehicle.sideToSideSkew * 100;
      if (skewPct >= limits.skewLoading.type2) {
        exceedances.push({
          vPos: vehicle.vPos, parameter: 'Side-to-Side Skew', axle: null, side: 'Both',
          value: skewPct, limit: limits.skewLoading.type2, units: '%', severity: SEVERITY.TYPE2,
        });
      }
    }

    // End-to-end skew (vehicle level)
    if (vehicle.endToEndSkew != null) {
      const skewPct = vehicle.endToEndSkew * 100;
      if (skewPct >= limits.skewLoading.type2) {
        exceedances.push({
          vPos: vehicle.vPos, parameter: 'End-to-End Skew', axle: null, side: 'Both',
          value: skewPct, limit: limits.skewLoading.type2, units: '%', severity: SEVERITY.TYPE2,
        });
      }
    }

    // Per-axle checks
    for (const axle of vehicle.axles) {
      const axleExceedances = [];

      // Dynamic load — Left wheel
      if (axle.dynamicLoadLeft_kN != null) {
        const sev = wheelImpactSeverity(axle.dynamicLoadLeft_kN, impactLimits);
        axleResults.push({ vPos: vehicle.vPos, axle: axle.axleNum, side: 'Left', parameter: 'Dynamic Load', value_kN: axle.dynamicLoadLeft_kN, severity: sev });
        if (sev !== SEVERITY.NOMINAL) {
          axleExceedances.push({ vPos: vehicle.vPos, parameter: 'Dynamic Load', axle: axle.axleNum, side: 'Left', value: axle.dynamicLoadLeft_kN, limit: impactLimits.type2, units: 'kN', severity: sev });
        }
      }

      // Dynamic load — Right wheel
      if (axle.dynamicLoadRight_kN != null) {
        const sev = wheelImpactSeverity(axle.dynamicLoadRight_kN, impactLimits);
        axleResults.push({ vPos: vehicle.vPos, axle: axle.axleNum, side: 'Right', parameter: 'Dynamic Load', value_kN: axle.dynamicLoadRight_kN, severity: sev });
        if (sev !== SEVERITY.NOMINAL) {
          axleExceedances.push({ vPos: vehicle.vPos, parameter: 'Dynamic Load', axle: axle.axleNum, side: 'Right', value: axle.dynamicLoadRight_kN, limit: impactLimits.type2, units: 'kN', severity: sev });
        }
      }

      // Lateral force — Left wheel
      if (axle.lateralForceLeft_t != null) {
        const sev = lateralForceSeverity(axle.lateralForceLeft_t, limits.lateralForce);
        if (sev !== SEVERITY.NOMINAL) {
          axleExceedances.push({ vPos: vehicle.vPos, parameter: 'Lateral Force', axle: axle.axleNum, side: 'Left', value: axle.lateralForceLeft_t, limit: limits.lateralForce.type1Min, units: 't', severity: sev });
        }
      }

      // Lateral force — Right wheel
      if (axle.lateralForceRight_t != null) {
        const sev = lateralForceSeverity(axle.lateralForceRight_t, limits.lateralForce);
        if (sev !== SEVERITY.NOMINAL) {
          axleExceedances.push({ vPos: vehicle.vPos, parameter: 'Lateral Force', axle: axle.axleNum, side: 'Right', value: axle.lateralForceRight_t, limit: limits.lateralForce.type1Min, units: 't', severity: sev });
        }
      }

      // Gauge spreading force
      if (axle.gaugeSpreadingForce_t != null) {
        const sev = gaugeSpreadingSeverity(axle.gaugeSpreadingForce_t, limits.gaugeSpreading);
        if (sev !== SEVERITY.NOMINAL) {
          axleExceedances.push({ vPos: vehicle.vPos, parameter: 'Gauge Spreading Force', axle: axle.axleNum, side: 'N/A', value: axle.gaugeSpreadingForce_t, limit: limits.gaugeSpreading.type1Min, units: 't', severity: sev });
        }
      }

      exceedances.push(...axleExceedances);
    }

    // Worst severity across this vehicle's axles
    const worstSeverity = worstOf(axleResults.map(r => r.severity));

    return { vPos: vehicle.vPos, vehicleId: vehicle.vehicleId, mass_t: vehicle.mass_t, axleResults, exceedances, worstSeverity };
  }

  // ── Severity classifiers ───────────────────────────────────────────────────

  function wheelImpactSeverity(kN, impactLimits) {
    if (kN >= impactLimits.type3) return SEVERITY.TYPE3;
    if (kN >= impactLimits.type2) return SEVERITY.TYPE2;
    return SEVERITY.NOMINAL;
  }

  function lateralForceSeverity(t, lf) {
    if (t >= lf.type3Force) return SEVERITY.TYPE3;
    if (t >= lf.type2Min)   return SEVERITY.TYPE2;
    if (t >= lf.type1Min)   return SEVERITY.TYPE1;
    return SEVERITY.NOMINAL;
  }

  function gaugeSpreadingSeverity(t, gs) {
    if (t >= gs.type2)    return SEVERITY.TYPE2;
    if (t >= gs.type1Min) return SEVERITY.TYPE1;
    return SEVERITY.NOMINAL;
  }

  const SEVERITY_ORDER = [SEVERITY.NOMINAL, SEVERITY.TYPE1, SEVERITY.TYPE2, SEVERITY.TYPE3];

  function worstOf(severities) {
    return severities.reduce((worst, s) => {
      return SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(worst) ? s : worst;
    }, SEVERITY.NOMINAL);
  }

  // ── Stats and verdict ──────────────────────────────────────────────────────

  function computeStats(allAxleResults, allExceedances) {
    const totalWheels = allAxleResults.length;
    const exceedingWheels = allAxleResults.filter(r => r.severity !== SEVERITY.NOMINAL).length;
    const exceedanceRate = totalWheels > 0 ? exceedingWheels / totalWheels : 0;

    const worstOverall = worstOf(allAxleResults.map(r => r.severity));

    // Check for systematic one-sided pattern (all exceedances on one side)
    const leftExceedances  = allExceedances.filter(e => e.side === 'Left').length;
    const rightExceedances = allExceedances.filter(e => e.side === 'Right').length;
    const totalSided = leftExceedances + rightExceedances;
    const isOneSided = totalSided > 2 && (leftExceedances === 0 || rightExceedances === 0);

    // Find worst value per parameter
    const worstByParameter = {};
    for (const e of allExceedances) {
      if (!worstByParameter[e.parameter] || e.value > worstByParameter[e.parameter].value) {
        worstByParameter[e.parameter] = e;
      }
    }

    return {
      totalWheels,
      exceedingWheels,
      exceedanceRate,
      worstOverall,
      isOneSided,
      leftExceedances,
      rightExceedances,
      worstByParameter,
      totalExceedances: allExceedances.length,
      type1Count: allExceedances.filter(e => e.severity === SEVERITY.TYPE1).length,
      type2Count: allExceedances.filter(e => e.severity === SEVERITY.TYPE2).length,
      type3Count: allExceedances.filter(e => e.severity === SEVERITY.TYPE3).length,
    };
  }

  /**
   * Determines whether the alarm is likely true, false, or inconclusive,
   * and generates plain-English rationale bullets.
   */
  function determineVerdict(channelHealth, stats, heuristics) {
    const reasons = [];
    let trueSignals = 0;
    let falseSignals = 0;

    // --- False alarm indicators ---
    if (channelHealth.faultFraction >= heuristics.suspectChannelFraction) {
      falseSignals += 2;
      reasons.push(`${channelHealth.faultCount} of ${channelHealth.total} bridge channels have large offsets (≥ ${ALARM_LIMITS.channelOffset.faultThreshold} t), indicating the measurement system may be faulty.`);
    } else if (channelHealth.warningCount > 0) {
      falseSignals += 1;
      reasons.push(`${channelHealth.warningCount} bridge channel(s) show elevated offsets — monitor system calibration.`);
    }

    if (stats.isOneSided && stats.exceedingWheels > 2) {
      falseSignals += 2;
      const side = stats.leftExceedances === 0 ? 'Right' : 'Left';
      reasons.push(`All ${stats.exceedingWheels} exceedances are on the ${side} rail side only — a systematic one-sided pattern strongly suggests a faulty sensor rather than a genuine wheel defect.`);
    }

    if (stats.exceedanceRate >= heuristics.highExceedanceRate && stats.isOneSided) {
      falseSignals += 2;
      reasons.push(`${(stats.exceedanceRate * 100).toFixed(1)}% of measured wheels exceed limits — this rate is too high to be explained by genuine wheel defects across an entire train.`);
    }

    // High raw count of exceedances — statistically implausible for genuine defects
    if (stats.totalExceedances > 10) {
      falseSignals += 2;
      reasons.push(`${stats.totalExceedances} individual exceedances recorded across the train. In practice, more than 10 exceedances in a single pass strongly suggests a system measurement issue (faulty channel, calibration drift, or electrical interference) rather than coincidental defects across many wheels.`);
    }

    // --- True alarm indicators ---
    if (stats.type3Count > 0) {
      trueSignals += 3;
      reasons.push(`${stats.type3Count} Type 3 (safety-critical) exceedance(s) detected — these represent forces well above the threshold and are unlikely to be measurement artefacts.`);
    }

    if (stats.exceedanceRate <= heuristics.lowExceedanceRate && stats.exceedingWheels > 0 && !stats.isOneSided) {
      trueSignals += 2;
      reasons.push(`Only ${stats.exceedingWheels} wheel(s) (${(stats.exceedanceRate * 100).toFixed(2)}% of the train) exceed limits — an isolated defect on a small number of wheels is consistent with a true alarm.`);
    }

    if (channelHealth.faultFraction < heuristics.suspectChannelFraction && channelHealth.warningCount === 0 && stats.exceedingWheels > 0) {
      trueSignals += 1;
      reasons.push('All bridge channels show healthy offsets close to zero, indicating the measurement system is functioning normally.');
    }

    if (stats.totalExceedances === 0) {
      reasons.push('No exceedances detected against BBD5249 v3.1 limits at the selected rail type. Verify the correct rail type was selected.');
    }

    let verdict, confidence;
    if (stats.totalExceedances === 0) {
      verdict = 'NO ALARM';
      confidence = 'N/A';
    } else if (falseSignals > trueSignals && falseSignals >= 2) {
      verdict = 'LIKELY FALSE ALARM';
      confidence = falseSignals >= 4 ? 'High' : 'Moderate';
    } else if (trueSignals > falseSignals && trueSignals >= 2) {
      verdict = 'LIKELY TRUE ALARM';
      confidence = trueSignals >= 4 ? 'High' : 'Moderate';
    } else {
      verdict = 'INCONCLUSIVE';
      confidence = 'Low';
      reasons.push('Mixed indicators — manual review by a qualified technician is required.');
    }

    return { verdict, confidence, reasons };
  }

  return { analyse };

})();

/**
 * analyser.js — Applies BBD5249 v3.1 alarm limits to parsed train data.
 *
 * Depends on: ALARM_LIMITS, SEVERITY, RAIL_TYPE (from config/alarm-limits.js)
 * Depends on: Parser output (TrainData) from parser.js
 */

const Analyser = (() => {

  /**
   * Main entry point. Analyses a parsed TrainData object against BBD5249 limits.
   * @param {object} trainData   - output from Parser.parseConditionFile()
   * @param {string} railType    - RAIL_TYPE.S_LINE or RAIL_TYPE.N1_LINE
   * @param {object} [overrides] - optional partial limits object to override ALARM_LIMITS
   * @returns {AnalysisResult}
   */
  function analyse(trainData, railType, overrides = null) {
    const limits = overrides ? deepMerge(ALARM_LIMITS, overrides) : ALARM_LIMITS;
    const impactLimits = limits.wheelImpact[railType];

    const channelHealth = assessChannelHealth(trainData.offsets, limits.channelOffset);
    const vehicleResults = trainData.vehicles.map(v => assessVehicle(v, impactLimits, limits));

    const allAxleResults = vehicleResults.flatMap(v => v.axleResults);
    const allExceedances = vehicleResults.flatMap(v => v.exceedances);

    const stats = computeStats(allAxleResults, allExceedances);
    const suppressedParams = detectSuppressedParameters(trainData.vehicles);
    const verdict = determineVerdict(channelHealth, stats, limits.falseAlarmHeuristics, suppressedParams);

    return {
      railType,
      effectiveLimits: limits,
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
   * Detects parameters where every recorded value is identical (especially zero),
   * which is a strong indicator that the channel or parameter is disabled or
   * suppressed on this measurement system.
   *
   * Requires at least 3 non-null readings to be meaningful.
   */
  function detectSuppressedParameters(vehicles) {
    const suppressed = [];

    const params = [
      {
        label: 'Dynamic Load (Left)',
        values: vehicles.flatMap(v => v.axles.map(a => a.dynamicLoadLeft_kN).filter(x => x != null)),
      },
      {
        label: 'Dynamic Load (Right)',
        values: vehicles.flatMap(v => v.axles.map(a => a.dynamicLoadRight_kN).filter(x => x != null)),
      },
      {
        label: 'Lateral Force (Left)',
        values: vehicles.flatMap(v => v.axles.map(a => a.lateralForceLeft_t).filter(x => x != null)),
      },
      {
        label: 'Lateral Force (Right)',
        values: vehicles.flatMap(v => v.axles.map(a => a.lateralForceRight_t).filter(x => x != null)),
      },
      {
        label: 'Gauge Spreading Force',
        values: vehicles.flatMap(v => v.axles.map(a => a.gaugeSpreadingForce_t).filter(x => x != null)),
      },
      {
        label: 'Side-to-Side Skew',
        values: vehicles.map(v => v.sideToSideSkew).filter(x => x != null),
      },
      {
        label: 'End-to-End Skew',
        values: vehicles.map(v => v.endToEndSkew).filter(x => x != null),
      },
    ];

    for (const p of params) {
      if (p.values.length < 3) continue;
      const first = p.values[0];
      if (p.values.every(v => v === first)) {
        suppressed.push({ label: p.label, value: first, allZero: first === 0 });
      }
    }

    return suppressed;
  }

  /**
   * Determines whether the alarm is likely true, false, or requires review,
   * and generates plain-English observations and rationale bullets.
   *
   * Verdict philosophy:
   *   - Observations (factual) are always listed regardless of verdict.
   *   - LIKELY FALSE ALARM requires clear systematic evidence: a purely one-sided
   *     exceedance pattern (all on one rail) corroborated by either faulty channels
   *     OR a high exceedance rate, with no Type 3 exceedances.
   *   - LIKELY TRUE ALARM requires either a Type 3 exceedance with a healthy
   *     measurement system, or a genuinely isolated low-count exceedance with a
   *     healthy system and no one-sided pattern artefact.
   *   - REVIEW REQUIRED is the default for everything else — mixed signals, high
   *     exceedance counts without a clear pattern, ambiguous channel health, etc.
   *     This errs on the side of caution: a qualified technician decides.
   */
  function determineVerdict(channelHealth, stats, heuristics, suppressedParams = []) {
    const observations = [];
    const verdictRationale = [];

    // ── Derived flags ────────────────────────────────────────────────────────
    const systemFaulty  = channelHealth.faultFraction >= heuristics.suspectChannelFraction;
    const systemWarning = !systemFaulty && channelHealth.warningCount > 0;
    const systemHealthy = !systemFaulty && !systemWarning;

    const totalSided    = stats.leftExceedances + stats.rightExceedances;
    const purelyOneSided = totalSided > 2 &&
      (stats.leftExceedances === 0 || stats.rightExceedances === 0);

    const isolated = stats.exceedingWheels > 0 &&
      stats.exceedanceRate <= heuristics.lowExceedanceRate &&
      stats.totalExceedances <= 5;

    const highRate  = stats.exceedanceRate >= heuristics.highExceedanceRate;
    const highCount = stats.totalExceedances > 10;

    // ── Observations (factual, always shown) ─────────────────────────────────
    if (systemFaulty) {
      observations.push(
        `${channelHealth.faultCount} of ${channelHealth.total} bridge channels show large offsets ` +
        `(≥ ${ALARM_LIMITS.channelOffset.faultThreshold} t) — the measurement system may not be ` +
        `functioning correctly and measurements should be treated with caution.`
      );
    } else if (systemWarning) {
      observations.push(
        `${channelHealth.warningCount} bridge channel(s) show elevated offsets — ` +
        `monitor system calibration.`
      );
    } else {
      observations.push(
        'All bridge channels show healthy offsets, indicating the measurement system ' +
        'was functioning normally during this passage.'
      );
    }

    if (purelyOneSided) {
      const side = stats.leftExceedances === 0 ? 'Right' : 'Left';
      observations.push(
        `All ${stats.exceedingWheels} exceedance(s) are confined to the ${side} rail side — ` +
        `a purely one-sided pattern can indicate a faulty or miscalibrated sensor on that rail, ` +
        `but may also reflect a genuine track or wheel geometry bias.`
      );
    }

    if (highCount) {
      observations.push(
        `${stats.totalExceedances} individual exceedances were recorded across this passage — ` +
        `a high count spread across many wheels is atypical for isolated genuine defects and ` +
        `may indicate measurement artefacts (channel drift, electrical interference, or calibration offset).`
      );
    } else if (highRate) {
      observations.push(
        `${(stats.exceedanceRate * 100).toFixed(1)}% of measured wheels exceed limits — ` +
        `an exceedance rate this high across a full consist is unusual and warrants scrutiny.`
      );
    }

    if (isolated) {
      observations.push(
        `Only ${stats.exceedingWheels} wheel(s) (${(stats.exceedanceRate * 100).toFixed(2)}% of ` +
        `the consist) exceed limits — an isolated low-count exceedance pattern is more consistent ` +
        `with a localised wheel or loading defect.`
      );
    }

    if (stats.type3Count > 0) {
      observations.push(
        `${stats.type3Count} Type 3 (safety-critical) exceedance(s) detected — these forces are ` +
        `significantly above threshold and demand investigation irrespective of measurement system status.`
      );
    }

    if (stats.totalExceedances === 0) {
      observations.push(
        'No exceedances detected against the applied limits. ' +
        'Verify the correct rail type is selected if an alarm was expected.'
      );
    }

    if (suppressedParams.length > 0) {
      const allZeroList  = suppressedParams.filter(p => p.allZero).map(p => p.label);
      const uniformList  = suppressedParams.filter(p => !p.allZero).map(p => `${p.label} (all = ${p.value})`);
      const nameList     = [...allZeroList, ...uniformList];
      const paramStr     = nameList.length === 1
        ? nameList[0]
        : nameList.slice(0, -1).join(', ') + ' and ' + nameList[nameList.length - 1];
      const verb         = suppressedParams.length === 1 ? 'parameter appears' : 'parameters appear';
      observations.push(
        `The following ${verb} to be disabled or suppressed on this measurement system ` +
        `(all recorded values are identical${ allZeroList.length === suppressedParams.length ? ' and zero' : '' }): ` +
        `${paramStr}. Alarms generated from these channels should be disregarded.`
      );
    }

    // ── Verdict ──────────────────────────────────────────────────────────────
    let verdict, confidence;

    if (stats.totalExceedances === 0) {
      // ── No exceedances — nothing to classify
      verdict    = 'NO ALARM';
      confidence = 'N/A';

    } else if (stats.type3Count > 0 && systemHealthy) {
      // ── Type 3 forces with a healthy system — strong true alarm signal.
      //    A measurement system confirmed as healthy cannot produce a Type 3
      //    artefact of this magnitude without a genuine physical cause.
      verdict    = 'LIKELY TRUE ALARM';
      confidence = stats.type3Count >= 2 ? 'High' : 'Moderate';
      verdictRationale.push(
        'Type 3 exceedance(s) recorded with all bridge channels healthy — ' +
        'a healthy measurement system is unlikely to produce artefacts of this magnitude. ' +
        'Immediate investigation of the flagged vehicle(s) is required.'
      );

    } else if (
      purelyOneSided &&
      stats.type3Count === 0 &&
      (systemFaulty || highRate)
    ) {
      // ── Purely one-sided pattern corroborated by system faults or high rate.
      //    Both conditions together form a coherent false-alarm signature:
      //    a single compromised sensor produces exceedances on only one rail
      //    at an implausibly high rate.
      verdict    = 'LIKELY FALSE ALARM';
      confidence = (systemFaulty && highRate) ? 'High' : 'Moderate';
      if (systemFaulty) {
        verdictRationale.push(
          'A purely one-sided exceedance pattern combined with faulty bridge channels is most ' +
          'consistent with a sensor or calibration fault on that rail.'
        );
      } else {
        verdictRationale.push(
          'A purely one-sided exceedance pattern at an implausibly high rate suggests a ' +
          'sensor fault rather than genuine wheel defects distributed across the consist.'
        );
      }

    } else if (isolated && systemHealthy && !purelyOneSided && !highCount) {
      // ── Isolated exceedance on a healthy system without artefact indicators.
      //    Low rate + low count + healthy system + bilateral distribution
      //    is the most credible true-alarm signature short of a Type 3.
      verdict    = 'LIKELY TRUE ALARM';
      confidence = 'Moderate';
      verdictRationale.push(
        'A small number of isolated exceedances on a healthy measurement system, ' +
        'without a one-sided or high-count artefact pattern, is consistent with a ' +
        'localised wheel or loading defect.'
      );

    } else {
      // ── Everything else — too ambiguous to classify reliably.
      //    This covers: Type 3 with faulty/warning system; high count without
      //    clear pattern; one-sided with healthy system; moderate rate with
      //    mixed channel health; and any other combination not clearly meeting
      //    the evidence thresholds above.
      verdict    = 'REVIEW REQUIRED';
      confidence = 'N/A';
      verdictRationale.push(
        'The data presents mixed or ambiguous indicators that cannot be reliably ' +
        'classified by automated analysis. A trained technician must review the ' +
        'raw data and train overview illustration before any operational decision is made.'
      );
    }

    return { verdict, confidence, reasons: [...observations, ...verdictRationale] };
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  /**
   * Deep-merges `override` into a copy of `base`. Only plain objects are merged
   * recursively; primitive leaf values in `override` replace those in `base`.
   */
  function deepMerge(base, override) {
    const result = Object.assign({}, base);
    for (const key of Object.keys(override)) {
      if (
        override[key] !== null &&
        typeof override[key] === 'object' &&
        !Array.isArray(override[key]) &&
        typeof base[key] === 'object' &&
        base[key] !== null
      ) {
        result[key] = deepMerge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  return { analyse };

})();

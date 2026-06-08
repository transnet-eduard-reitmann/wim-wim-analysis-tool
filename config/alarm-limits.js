/**
 * BBD5249 v3.1 — Alarm Limits for WIM-WIM systems.
 * This is the single source of truth for all threshold values used in analysis.
 *
 * Forces in kN unless noted. Mass in tonnes. Percentages as decimal fractions.
 */
const ALARM_LIMITS = {

  // Wheel impact (dynamic vertical force) — thresholds depend on rail class
  wheelImpact: {
    // S-line: 60 kg/m rail, max axle load 30 t
    sLine: {
      type2: 240,  // kN
      type3: 270,  // kN
    },
    // N1-line: 57 kg/m rail, max axle load 22 t
    n1Line: {
      type2: 160,  // kN
      type3: 190,  // kN
    },
  },

  // Lateral wheel force (single wheel)
  lateralForce: {
    type1Min: 3,   // t — lower bound of Type 1 range
    type1Max: 4,   // t — upper bound of Type 1 range (exclusive)
    type2Min: 4,   // t — lower bound of Type 2 range
    type2Max: 6,   // t — upper bound of Type 2 range (exclusive)
    type3Force: 6, // t — absolute force threshold for Type 3
    type3LvRatio: 1.0, // L/V ratio threshold for Type 3 (dimensionless)
  },

  // Gauge spreading force (outward lateral force tending to spread the rails)
  gaugeSpreading: {
    type1Min: 4,   // t
    type1Max: 5,   // t (exclusive)
    type2: 5,      // t — >= this is Type 2
  },

  // Bogie couple force (BBD5249 §3.3 — Skewness [B]: lateral force asymmetry between the leading
  // and trailing axles of a bogie. Formula: (L1+R1) − (L2+R2). Units: tonnes. Positive = skew right.)
  bogieCouple: {
    type1Min: 4,   // t
    type1Max: 5,   // t (exclusive)
    type2: 5,      // t — >= this is Type 2
  },

  // Skew loading — imbalance percentage between sides or ends of a wagon
  // Formula: |Load1 - Load2| / (Load1 + Load2) * 100
  skewLoading: {
    type2: 12,  // % — end-to-end skew OR side-to-side skew
  },

  // Wagon mass exceedances
  overloading: {
    type2: 0.07,  // 7% above maximum allowable gross mass
  },

  underLoading: {
    type2: 0.30,  // 30% below rated capacity (front loaded wagons)
  },

  // Bridge channel voltage offset — diagnostic only (not an alarm parameter in BBD5249
  // but used here as a system health indicator; channels should be close to 0 V at rest)
  channelOffset: {
    warningThreshold: 1.0,  // tonnes — flag offset exceeding this
    faultThreshold: 2.0,    // tonnes — consider channel faulty above this
  },

  // False alarm detection heuristics (not in BBD5249 — analyst judgement rules)
  falseAlarmHeuristics: {
    // If the exceedance rate across all axles is below this, likely a true (isolated) alarm
    lowExceedanceRate: 0.01,   // 1%
    // If above this rate with a systematic (one-sided) pattern, likely a faulty sensor
    highExceedanceRate: 0.30,  // 30%
    // Minimum fraction of channels with large offsets to flag system as suspect
    suspectChannelFraction: 0.25,  // 25% of channels
  },
};

// Named severity levels for display
const SEVERITY = {
  NOMINAL: 'nominal',
  TYPE1:   'type1',
  TYPE2:   'type2',
  TYPE3:   'type3',
};

// Rail type keys
const RAIL_TYPE = {
  S_LINE:  'sLine',
  N1_LINE: 'n1Line',
};

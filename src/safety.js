// Safety layer. Critical hazards are confirmed by the human through MCP
// elicitation, so the model cannot answer "yes, the power is off" on their behalf.

export const HAZARDS = {
  electrical: {
    critical: true,
    label: 'Electricity',
    patterns: [/\bunplug/i, /power (cord|supply|off|source)/i, /\bbreaker\b/i, /\bmains\b/i, /\belectric(al|ity)?\b/i, /\bwir(e|es|ing)\b/i, /\bcapacitor/i, /\bvoltage\b/i, /disconnect (the )?power/i, /\boutlet\b/i, /\bterminal/i],
    question: (device) => `Is the ${device} switched off and unplugged, or its breaker turned off?`,
  },
  water: {
    critical: true,
    label: 'Water',
    patterns: [/water supply/i, /shut[- ]?off valve/i, /inlet (hose|valve)/i, /water (line|valve)/i, /drain the (water|tub)/i, /standing water/i, /\bhoses?\b/i],
    question: () => 'Is the water supply turned off, with towels ready for spills?',
  },
  gas: {
    critical: true,
    label: 'Gas',
    patterns: [/\bgas (line|valve|supply|burner|dryer|oven|range)\b/i, /\bnatural gas\b/i, /\bpropane\b/i],
    question: () => 'Is the gas valve closed? If you smell gas at any point, stop and leave the house.',
  },
  battery: {
    critical: true,
    label: 'Battery',
    patterns: [/\blithium/i, /\bbattery\b/i, /\bswollen\b/i],
    question: () => 'Is the device powered off? If the battery is swollen, hot or punctured, stop now.',
  },
  refrigerant: {
    critical: true,
    stop: true,
    label: 'Refrigerant',
    patterns: [/\brefrigerant\b/i, /\bsealed system\b/i, /\bfreon\b/i],
    question: () => 'This step involves refrigerant, which needs a certified technician. Do you want to stop here?',
  },
  heat: { critical: false, label: 'Hot parts', patterns: [/\bhot\b/i, /heating element/i, /\bburns?\b/i], note: 'Let parts cool down before you touch them.' },
  sharp: { critical: false, label: 'Sharp edges', patterns: [/\bsharp\b/i, /\bglass\b/i, /\bblades?\b/i], note: 'Wear gloves: edges can be sharp.' },
  heavy: { critical: false, label: 'Heavy', patterns: [/\bheavy\b/i, /\b(lift|move|pull|slide) (out )?(the |it )?(whole |entire )?(unit|appliance|machine|washer|dryer|fridge|refrigerator|dishwasher|oven|range)\b/i, /tip (it )?over/i, /two people/i], note: 'Get a second person to help move it.' },
};

// Mains-powered appliances get a power check before the first step,
// even when the guide itself forgets to say "unplug it".
const MAINS = /dishwasher|washer|washing machine|dryer|refrigerator|fridge|freezer|oven|stove|range|microwave|air conditioner|dehumidifier|water heater|garbage disposal|disposer|range hood|vacuum|toaster|kettle|coffee/i;
const BATTERY = /laptop|phone|iphone|ipad|tablet|macbook|switch|controller|airpods|headphones|watch/i;

export const KINDS = [
  'dishwasher', 'washer', 'dryer', 'refrigerator', 'oven', 'microwave', 'air_conditioner',
  'water_heater', 'range_hood', 'vacuum', 'laptop', 'phone', 'smoke_alarm', 'other',
];

export function inferKind(text = '') {
  const t = text.toLowerCase();
  const rules = [
    ['dishwasher', /dishwasher/], ['washer', /washer|washing machine/], ['dryer', /dryer/],
    ['refrigerator', /refrigerator|fridge|freezer/], ['oven', /oven|stove|range(?! hood)|cooktop/],
    ['microwave', /microwave/], ['air_conditioner', /air condition|\bac\b|heat pump/],
    ['water_heater', /water heater/], ['range_hood', /range hood|extractor/], ['vacuum', /vacuum|roomba/],
    ['laptop', /laptop|macbook|notebook|thinkpad/], ['phone', /phone|iphone|pixel|galaxy/],
    ['smoke_alarm', /smoke (alarm|detector)/],
  ];
  return (rules.find(([, re]) => re.test(t)) || ['other'])[0];
}

export function detectHazards(text = '') {
  return Object.entries(HAZARDS).filter(([, h]) => h.patterns.some((re) => re.test(text))).map(([k]) => k);
}

/** Hazards for the whole guide: a pre-flight list plus per-step hazards. */
export function guideHazards(guide) {
  const name = `${guide.title} ${guide.device}`;
  const preflight = [];
  if (MAINS.test(name)) preflight.push('electrical');
  else if (BATTERY.test(name)) preflight.push('battery');
  const perStep = guide.steps.map((s) => detectHazards(`${s.title} ${s.lines.join(' ')}`));
  return { preflight, perStep };
}

/** Critical hazards that still need a human "yes" before this step can be shown. */
export function pendingChecks(hazardKeys, confirmed = []) {
  return [...new Set(hazardKeys)].filter((k) => HAZARDS[k]?.critical && !confirmed.includes(k));
}

export function safetyQuestion(keys, device = 'appliance') {
  return keys.map((k) => HAZARDS[k].question(device)).join(' ');
}

export function cautionNotes(keys) {
  return [...new Set(keys)].map((k) => HAZARDS[k]).filter((h) => h && !h.critical && h.note).map((h) => h.note);
}

/** Short spoken device name for questions, e.g. "dishwasher". */
export function deviceNoun(guide) {
  const kind = inferKind(`${guide.title} ${guide.device}`);
  return kind === 'other' ? 'device' : kind.replace('_', ' ');
}

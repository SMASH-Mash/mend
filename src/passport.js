// The appliance passport: what's in the home, its warranty, its repairs, and
// what maintenance is due. Pure functions over plain household data.

const DAY = 86400000;

// Typical manufacturer guidance. Intervals are deliberately conservative.
export const MAINTENANCE = {
  dishwasher: [
    { id: 'filter', task: 'Clean the drain filter', everyDays: 30 },
    { id: 'spray-arms', task: 'Rinse the spray arms', everyDays: 90 },
  ],
  washer: [
    { id: 'drum', task: 'Run an empty hot drum-clean cycle', everyDays: 30 },
    { id: 'pump-filter', task: 'Clean the drain pump filter', everyDays: 90 },
  ],
  dryer: [{ id: 'vent', task: 'Clean the vent duct (a common cause of dryer fires)', everyDays: 365 }],
  refrigerator: [
    { id: 'coils', task: 'Vacuum the condenser coils', everyDays: 180 },
    { id: 'water-filter', task: 'Replace the water filter', everyDays: 180 },
  ],
  air_conditioner: [{ id: 'filter', task: 'Clean or replace the air filter', everyDays: 90 }],
  water_heater: [{ id: 'flush', task: 'Flush sediment from the tank', everyDays: 365 }],
  range_hood: [{ id: 'grease-filter', task: 'Degrease the hood filter', everyDays: 90 }],
  vacuum: [{ id: 'filter', task: 'Wash or replace the filter', everyDays: 90 }],
  laptop: [{ id: 'vents', task: 'Blow dust out of the fan vents', everyDays: 180 }],
  smoke_alarm: [{ id: 'test', task: 'Press the test button', everyDays: 30 }],
};

export function emptyHousehold(id = 'demo') {
  return { id, appliances: [], repairs: [], sessions: {}, activeSessionId: null, cart: [], maintenance: {} };
}

export const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function warrantyStatus(appliance, now = Date.now()) {
  if (!appliance.purchasedOn || !appliance.warrantyMonths) return null;
  const start = new Date(`${appliance.purchasedOn}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + Number(appliance.warrantyMonths));
  const daysLeft = Math.ceil((end.getTime() - now) / DAY);
  return { endsOn: end.toISOString().slice(0, 10), active: daysLeft > 0, daysLeft };
}

/** Maintenance tasks with their next due date, most urgent first. */
export function maintenanceFor(household, now = Date.now()) {
  const out = [];
  for (const a of household.appliances) {
    for (const rule of MAINTENANCE[a.kind] || []) {
      const last = household.maintenance?.[a.id]?.[rule.id] || a.addedAt;
      const due = new Date(new Date(last).getTime() + rule.everyDays * DAY);
      const days = Math.round((due.getTime() - now) / DAY);
      out.push({
        applianceId: a.id,
        appliance: a.nickname || `${a.brand || ''} ${a.kind.replace('_', ' ')}`.trim(),
        taskId: rule.id,
        task: rule.task,
        dueOn: due.toISOString().slice(0, 10),
        inDays: days,
        status: days < 0 ? 'overdue' : days <= 7 ? 'due' : 'ok',
      });
    }
  }
  return out.sort((x, y) => x.inDays - y.inDays);
}

/** Finds the appliance a request is about: by id, then nickname, kind or brand. */
export function matchAppliance(household, hint = '') {
  if (!hint) return null;
  const h = hint.toLowerCase();
  return household.appliances.find((a) => a.id === hint)
    || household.appliances.find((a) => a.nickname && h.includes(a.nickname.toLowerCase()))
    || household.appliances.find((a) => h.includes(a.kind.replace('_', ' ')) || (a.kind === 'washer' && h.includes('washing machine')))
    || household.appliances.find((a) => a.brand && h.includes(a.brand.toLowerCase()))
    || null;
}

export function describeAppliance(a) {
  return [a.brand, a.model, a.kind.replace('_', ' ')].filter(Boolean).join(' ');
}

/** Amazon search link for a part. The cart is simulated in this prototype. */
export function partSearchUrl(part, appliance) {
  const q = [appliance?.brand, appliance?.model, part].filter(Boolean).join(' ');
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}

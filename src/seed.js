// Demo household: a realistic home, with dates relative to today so the demo
// always has an active warranty and something overdue.

import { newId } from './passport.js';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const month = (ms) => iso(ms).slice(0, 7);

export async function seedDemo(store, household = 'demo', now = Date.now()) {
  await store.update(household, (h) => {
    if (h.appliances.length) return;
    const added = iso(now - 400 * DAY);
    const dishwasher = { id: newId('app'), kind: 'dishwasher', brand: 'Bosch', model: 'SHEM78WH5N', nickname: 'kitchen dishwasher', purchasedOn: month(now - 480 * DAY), warrantyMonths: 24, addedAt: added };
    const fridge = { id: newId('app'), kind: 'refrigerator', brand: 'Samsung', model: 'RF28R7351SR', nickname: 'fridge', purchasedOn: month(now - 1500 * DAY), warrantyMonths: 12, addedAt: added };
    const washer = { id: newId('app'), kind: 'washer', brand: 'LG', model: 'WM4000HWA', nickname: 'washing machine', purchasedOn: month(now - 730 * DAY), warrantyMonths: 12, addedAt: added };
    h.appliances.push(dishwasher, fridge, washer);
    h.maintenance = {
      [dishwasher.id]: { filter: iso(now - 45 * DAY), 'spray-arms': iso(now - 30 * DAY) },
      [fridge.id]: { coils: iso(now - 200 * DAY), 'water-filter': iso(now - 60 * DAY) },
      [washer.id]: { drum: iso(now - 20 * DAY), 'pump-filter': iso(now - 50 * DAY) },
    };
    h.repairs.push({ id: newId('rep'), applianceId: washer.id, guideId: 0, title: 'Replaced the door gasket', outcome: 'fixed', note: '', startedAt: iso(now - 210 * DAY), finishedAt: iso(now - 210 * DAY) });
  });
}

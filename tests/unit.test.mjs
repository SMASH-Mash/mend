import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanText, searchTerms, normalizeGuide } from '../src/ifixit.js';
import { detectHazards, guideHazards, pendingChecks, inferKind, safetyQuestion } from '../src/safety.js';
import { maintenanceFor, warrantyStatus, matchAppliance, partSearchUrl } from '../src/passport.js';
import { createMemoryStore } from '../src/store.js';
import { seedDemo } from '../src/seed.js';
import { inlineBundle } from '../src/ui.js';

const DAY = 86400000;
const bosch = normalizeGuide(JSON.parse(await readFile(new URL('../data/guides/182595.json', import.meta.url), 'utf8')));

test('cleanText strips iFixit wiki markup', () => {
  assert.equal(cleanText('[videotimestamp|1|2]Lift the basket.'), 'Lift the basket.');
  assert.equal(cleanText("Use a [link|https://x.y|Torx T20] driver and '''don't''' force it ."), "Use a Torx T20 driver and don't force it.");
  assert.equal(cleanText("''Gently'' pull &amp; twist"), 'Gently pull & twist');
});

test('everyday symptoms become repair search terms', () => {
  const q = searchTerms('my Bosch dishwasher', 'water left at the bottom, it won\'t drain');
  assert.ok(q.some((x) => x.includes('drain filter')), q.join(' | '));
  assert.ok(q.includes('bosch dishwasher'));
  assert.ok(!q.some((x) => x.includes(' my ')), 'filler words removed');
});

test('normalized guide keeps steps, photos and attribution', () => {
  assert.equal(bosch.guideId, 182595);
  assert.ok(bosch.steps.length >= 10);
  assert.ok(bosch.steps[0].images.length > 0, 'step photos');
  assert.match(bosch.attribution, /iFixit, CC BY-NC-SA/);
  assert.ok(!bosch.steps.some((s) => s.lines.some((l) => l.includes('[videotimestamp'))));
});

test('hazard detection', () => {
  assert.deepEqual(detectHazards('Unplug the dishwasher before you start'), ['electrical']);
  assert.deepEqual(detectHazards('Turn off the water supply valve'), ['water']);
  assert.ok(detectHazards('The refrigerant line must not be cut').includes('refrigerant'));
  assert.deepEqual(detectHazards('Open the door and pull out the rack'), []);
  assert.deepEqual(detectHazards('Lift the drain screen and filter basket up'), [], 'lifting a filter is not a heavy lift');
  assert.deepEqual(detectHazards('Pull the refrigerator out from the wall'), ['heavy']);
});

test('mains appliances get a power check even when the guide forgets', () => {
  const hz = guideHazards(bosch);
  assert.deepEqual(hz.preflight, ['electrical']);
  assert.equal(hz.perStep.length, bosch.steps.length);
  assert.deepEqual(pendingChecks(['electrical', 'heat'], []), ['electrical'], 'only critical hazards need a human yes');
  assert.deepEqual(pendingChecks(['electrical'], ['electrical']), [], 'asked once per repair');
  assert.match(safetyQuestion(['electrical'], 'dishwasher'), /dishwasher switched off and unplugged/);
});

test('appliance kind inference', () => {
  assert.equal(inferKind('How to Unclog a Bosch SHEM78WH5N Dishwasher Drain Filter'), 'dishwasher');
  assert.equal(inferKind('Samsung Refrigerator condenser coil'), 'refrigerator');
  assert.equal(inferKind('LG washing machine pump'), 'washer');
  assert.equal(inferKind('MacBook Air battery'), 'laptop');
});

test('demo household: active warranty and overdue maintenance', async () => {
  const store = createMemoryStore();
  const now = Date.UTC(2026, 9, 21);
  await seedDemo(store, 'demo', now);
  const h = await store.get('demo');
  assert.equal(h.appliances.length, 3);
  const dw = h.appliances.find((a) => a.kind === 'dishwasher');
  assert.equal(warrantyStatus(dw, now).active, true);
  const tasks = maintenanceFor(h, now);
  assert.ok(tasks.some((t) => t.status === 'overdue' && /condenser coils/i.test(t.task)));
  assert.ok(tasks.some((t) => t.status === 'overdue' && /drain filter/i.test(t.task)));
  assert.ok(tasks[0].inDays <= tasks[tasks.length - 1].inDays, 'most urgent first');
  await seedDemo(store, 'demo', now);
  assert.equal((await store.get('demo')).appliances.length, 3, 'seeding is idempotent');
});

test('matching an appliance from what people say', async () => {
  const store = createMemoryStore();
  await seedDemo(store);
  const h = await store.get('demo');
  assert.equal(matchAppliance(h, 'my Bosch dishwasher').kind, 'dishwasher');
  assert.equal(matchAppliance(h, 'the washing machine').kind, 'washer');
  assert.equal(matchAppliance(h, 'fridge').kind, 'refrigerator');
  assert.equal(matchAppliance(h, 'toaster'), null);
});

test('warranty math', () => {
  const now = Date.UTC(2026, 9, 21);
  assert.equal(warrantyStatus({ purchasedOn: '2025-06', warrantyMonths: 24 }, now).endsOn, '2027-06-01');
  assert.equal(warrantyStatus({ purchasedOn: '2023-01', warrantyMonths: 12 }, now).active, false);
  assert.equal(warrantyStatus({}, now), null);
});

test('part links are Amazon searches including the model', () => {
  assert.equal(partSearchUrl('drain pump', { brand: 'Bosch', model: 'SHEM78WH5N' }), 'https://www.amazon.com/s?k=Bosch%20SHEM78WH5N%20drain%20pump');
});

test('store serializes concurrent updates', async () => {
  const store = createMemoryStore();
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.update('h', (h) => { h.cart.push(i); })));
  assert.equal((await store.get('h')).cart.length, 20);
});

test('tool names are speakable', async () => {
  const { speakableTool } = await import('../src/server.js');
  assert.equal(speakableTool('VJH1612PF0201 - Vacmaster Professional Beast Series 16-gallon wet/dry vacuum'), 'wet/dry vacuum');
  assert.equal(speakableTool('Flathead 3/32" or 2.5 mm Screwdriver'), 'flathead screwdriver');
  assert.equal(speakableTool('Nitrile Gloves 100 Box'), 'nitrile gloves');
  assert.equal(speakableTool('Phillips #2 Screwdriver'), 'phillips screwdriver');
  assert.equal(speakableTool('Shop Towel'), 'shop towel');
});

test('MCP Apps bundle inlining exposes App', () => {
  const out = inlineBundle('var a=1;class B{}export{a as x,B as App};');
  assert.match(out, /const MCPApps=\{"x":a,"App":B\};/);
  assert.ok(!out.includes('export{'));
});

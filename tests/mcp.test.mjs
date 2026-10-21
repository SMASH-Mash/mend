// End-to-end: a real MCP client talks to the HTTP server over Streamable HTTP,
// negotiates protocol 2025-11-25 and runs a full repair, answering elicitations
// the way a person would.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL_ = `http://127.0.0.1:${PORT}/mcp`;
let proc;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'mend-'));
  proc = spawn(process.execPath, ['src/http.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT), MEND_DATA: dataDir, MEND_OFFLINE: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('Mend MCP server')) resolve(); });
    proc.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
});

after(async () => {
  proc?.kill();
  await rm(dataDir, { recursive: true, force: true });
});

async function connect({ answers = [] } = {}) {
  const client = new Client({ name: 'mend-test', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler('elicitation/create', async (req) => {
    asked.push(req.params.message);
    const a = answers.shift() ?? true;
    const field = Object.keys(req.params.requestedSchema.properties)[0];
    return a === 'decline' ? { action: 'decline' } : { action: 'accept', content: { [field]: a } };
  });
  const transport = new StreamableHTTPClientTransport(new URL(URL_));
  await client.connect(transport);
  return { client, transport, asked };
}

const sc = (r) => r.structuredContent;

test('negotiates MCP 2025-11-25 and lists Mend tools with an MCP App screen', async () => {
  const { client } = await connect();
  assert.equal(client.getServerVersion().name, 'mend');
  assert.equal(client.getNegotiatedProtocolVersion(), '2025-11-25');
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['find_repair_guides', 'start_repair', 'repair_step', 'finish_repair', 'add_part_to_cart', 'appliance_passport']) assert.ok(names.includes(n), n);
  const step = tools.find((t) => t.name === 'repair_step');
  assert.equal(step._meta.ui.resourceUri, 'ui://mend/screen.html');
  const screen = await client.readResource({ uri: 'ui://mend/screen.html' });
  assert.equal(screen.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.ok(screen.contents[0].text.includes('const MCPApps='));
  assert.match(client.getInstructions(), /ONE step at a time/);
  await client.close();
});

test('a full hands-free repair: the safety check goes to the human, not the model', async () => {
  const { client, asked } = await connect({ answers: ['decline', true] });
  const raw = await client.callTool({ name: 'find_repair_guides', arguments: { device: 'my dishwasher', problem: "it won't drain, standing water" } });
  const found = sc(raw);
  assert.equal(found.view, 'guides');
  // Spoken summary first, then the structured data as JSON text for the model (ids, no image URLs).
  assert.equal(raw.content[0].text, `Tell the person: ${found.speech}`);
  const data = JSON.parse(raw.content[1].text.replace(/^Data: /, ''));
  assert.equal(data.guides[0].guideId, 182595);
  assert.equal(data.guides[0].image, undefined);
  assert.equal(found.guides[0].guideId, 182595, 'offline index finds the Bosch drain filter guide');
  assert.equal(found.appliance.name, 'Bosch SHEM78WH5N dishwasher', 'uses the appliance passport');

  const overview = sc(await client.callTool({ name: 'start_repair', arguments: { guideId: 182595 } }));
  assert.equal(overview.view, 'overview');
  assert.ok(overview.risks.includes('Electricity'));

  // First "next": Mend asks the person to confirm the power is off. They say no → paused.
  const paused = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'next' } }));
  assert.equal(paused.status, 'paused');
  assert.match(asked[0], /switched off and unplugged/);

  // Second try: they confirm, and step 1 appears with a photo.
  const s1 = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'next' } }));
  assert.equal(s1.view, 'step');
  assert.equal(s1.step.n, 1);
  assert.ok(s1.step.images.length > 0);
  assert.deepEqual(s1.confirmed, ['Electricity']);
  assert.equal(asked.length, 2);

  // Already confirmed: no more questions for the same hazard.
  const s2 = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'next' } }));
  assert.equal(s2.step.n, 2);
  const back = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'back' } }));
  assert.equal(back.step.n, 1);
  const jump = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'goto', step: 99 } }));
  assert.equal(jump.view, 'last');

  const done = sc(await client.callTool({ name: 'finish_repair', arguments: { outcome: 'fixed' } }));
  assert.equal(done.view, 'finished');
  assert.equal(done.appliance, 'Bosch SHEM78WH5N dishwasher');
  const passport = sc(await client.callTool({ name: 'appliance_passport', arguments: {} }));
  const dw = passport.appliances.find((a) => a.kind === 'dishwasher');
  assert.equal(dw.lastRepair.outcome, 'fixed', 'repair logged');
  assert.ok(!passport.due.some((d) => d.applianceId === dw.id && /drain filter/i.test(d.task)), 'filter clock reset by the repair');
  await client.close();
});

test('purchases need the person to approve, every time', async () => {
  const { client } = await connect({ answers: ['decline', true] });
  const declined = sc(await client.callTool({ name: 'add_part_to_cart', arguments: { part: 'drain pump', appliance: 'dishwasher' } }));
  assert.equal(declined.status, 'declined');
  assert.equal(declined.cart.length, 0);
  const added = sc(await client.callTool({ name: 'add_part_to_cart', arguments: { part: 'drain pump', appliance: 'dishwasher' } }));
  assert.equal(added.status, 'added');
  assert.match(added.cart[0].url, /amazon\.com\/s\?k=Bosch%20SHEM78WH5N%20drain%20pump/);
  await client.close();
});

test('clients without elicitation get a spoken check instead of a silent skip', async () => {
  const client = new Client({ name: 'no-elicit', version: '1.0.0' }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  await client.callTool({ name: 'start_repair', arguments: { guideId: 182595 } });
  const ask = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'next' } }));
  assert.equal(ask.status, 'confirmation_required');
  const s1 = sc(await client.callTool({ name: 'repair_step', arguments: { move: 'next', confirmSafety: true } }));
  assert.equal(s1.step.n, 1);
  await client.close();
});

test('maintenance and the passport resource', async () => {
  const { client } = await connect();
  const m = sc(await client.callTool({ name: 'maintenance_due', arguments: {} }));
  assert.ok(m.tasks.some((t) => /condenser coils/i.test(t.task) && t.status === 'overdue'));
  const done = sc(await client.callTool({ name: 'mark_maintenance_done', arguments: { appliance: 'fridge', task: 'coils' } }));
  assert.ok(done.tasks.some((t) => /condenser coils/i.test(t.task) && t.status === 'ok'));
  const res = await client.readResource({ uri: 'mend://household/passport' });
  assert.equal(JSON.parse(res.contents[0].text).view, 'passport');
  await client.close();
});

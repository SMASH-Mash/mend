// Mend MCP server: tools, resources and prompts. One instance per session/household.

import { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { guideHazards, pendingChecks, safetyQuestion, cautionNotes, deviceNoun, HAZARDS, KINDS, inferKind } from './safety.js';
import { maintenanceFor, matchAppliance, describeAppliance, warrantyStatus, partSearchUrl, newId, MAINTENANCE } from './passport.js';
import { screenHtml } from './ui.js';

export const SCREEN_URI = 'ui://mend/screen.html';
export const VERSION = '1.0.0';

export const INSTRUCTIONS = `Mend helps people repair things at home, hands-free, one step at a time, using iFixit guides.
Workflow:
1. When someone describes a problem, call find_repair_guides. Check appliance_passport first so you know their brand and model.
2. Offer the best matching guide in one sentence. When they agree, call start_repair with that guide's guideId from the Data.
3. Read ONE step at a time with repair_step, and say the step's instructions out loud: their hands are busy and they may not be looking at the screen. Wait for "next", "repeat" or "go back" before moving on.
4. Only describe steps that repair_step has returned. Never invent, reorder, merge or skip repair steps, tools or measurements: read what Mend gives you.
5. Never skip, summarize or answer safety checks yourself. Mend asks the person directly and pauses until they confirm.
6. When they say it's done, call finish_repair with the outcome.
7. If a part is needed, offer add_part_to_cart. Mend asks the person to approve every purchase.
Keep spoken replies to one to three short sentences. The screen shows the photos and details.`;

// Every result: a spoken summary first, then (as the spec recommends for structured
// results) the same data serialized as JSON, so the model has ids like guideId to act on.
const SCREEN_ONLY = new Set(['image', 'images', 'url', 'attribution', 'csp']);
const forModel = (v) => JSON.stringify(v, (k, x) => (SCREEN_ONLY.has(k) ? undefined : x));
// Steps are read verbatim: a voice assistant must never improvise repair instructions.
const VERBATIM = new Set(['step', 'safety']);
const text = (speech, structured) => ({
  content: [
    { type: 'text', text: VERBATIM.has(structured.view) ? `Read this to the person exactly as written: ${speech}` : `Tell the person: ${speech}` },
    { type: 'text', text: `Data: ${forModel(structured)}` },
  ],
  structuredContent: { speech, ...structured },
});

const listOf = (items, max = 3) => {
  const list = items.slice(0, max);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};

const ui = { ui: { resourceUri: SCREEN_URI } };

/** "VJH1612PF0201 - Vacmaster … 16-gallon wet/dry vacuum" → "wet/dry vacuum" for speech. */
export function speakableTool(name) {
  let s = name
    .replace(/^[A-Z0-9][A-Z0-9-]{5,}\s*-\s*/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b\d+(\.\d+)?\s*(mm|cm|in|inch|ft)\b|\d+\/\d+"?|\b\d+(-|\s)?gallon\b|#\d+|\b\d+\s*box\b|\bor\b/gi, ' ')
    .replace(/["”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = s.split(' ').filter(Boolean);
  if (words.length > 3) s = words.slice(-2).join(' ');
  return s.toLowerCase();
}

/**
 * @param {{ store: ReturnType<import('./store.js').createMemoryStore>, guides: ReturnType<import('./ifixit.js').createGuideSource>, household?: string, now?: () => number }} deps
 */
export function createMendServer({ store, guides, household = 'demo', now = () => Date.now() }) {
  const server = new McpServer({ name: 'mend', title: 'Mend: hands-free repair', version: VERSION }, { instructions: INSTRUCTIONS });
  const canElicit = () => Boolean(server.server.getClientCapabilities()?.elicitation);

  /** Asks the human a yes/no question through the client, bypassing the model. */
  async function askHuman(ctx, message, field, title) {
    const res = await ctx.mcpReq.elicitInput({
      mode: 'form',
      message,
      requestedSchema: {
        type: 'object',
        properties: { [field]: { type: 'boolean', title, default: false } },
        required: [field],
      },
    });
    return res.action === 'accept' && res.content?.[field] === true;
  }

  const activeSession = (h, id) => h.sessions[id || h.activeSessionId] || null;

  /* ---------------- Guides & repair flow ---------------- */

  registerAppTool(server, 'find_repair_guides', {
    title: 'Find repair guides',
    description: 'Search iFixit repair guides for a device and a problem described in everyday words (e.g. device "Bosch dishwasher", problem "not draining, standing water").',
    inputSchema: z.object({
      device: z.string().describe('What is broken, with brand and model if known, e.g. "Bosch dishwasher"'),
      problem: z.string().describe('The symptom in everyday words, e.g. "water left in the bottom"'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: ui,
  }, async ({ device, problem }) => {
    const h = await store.get(household);
    const appliance = matchAppliance(h, device);
    const query = appliance ? [appliance.brand, appliance.kind.replace('_', ' ')].filter(Boolean).join(' ') : device;
    const found = await guides.find(query, problem, { limit: 4, model: appliance?.model || '' });
    if (!found.length) {
      return text(`I couldn't find a guide for that ${device} problem. Can you tell me the brand or what exactly happens?`, { view: 'guides', guides: [], device, problem });
    }
    const best = found[0];
    const speech = `I found ${found.length} guides. The best match is "${best.title}"${best.difficulty ? `, rated ${best.difficulty.toLowerCase()}` : ''}. Want to start it?`;
    return text(speech, { view: 'guides', guides: found, device, problem, appliance: appliance ? { id: appliance.id, name: describeAppliance(appliance) } : null });
  });

  registerAppTool(server, 'start_repair', {
    title: 'Start a repair',
    description: 'Start a step-by-step repair from an iFixit guide. Returns the overview: difficulty, time, tools and parts.',
    inputSchema: z.object({
      guideId: z.number().int().describe('iFixit guide id from find_repair_guides'),
      appliance: z.string().optional().describe('Appliance id or name from the passport, if the repair is for one of them'),
    }),
    _meta: ui,
  }, async ({ guideId, appliance }) => {
    const guide = await guides.guide(guideId);
    const hazards = guideHazards(guide);
    const session = await store.update(household, (h) => {
      const a = matchAppliance(h, appliance || guide.title);
      const s = {
        id: newId('fix'),
        guideId,
        title: guide.title,
        device: deviceNoun(guide),
        kind: inferKind(`${guide.title} ${guide.device}`),
        applianceId: a?.id || null,
        step: -1,
        total: guide.steps.length,
        confirmed: [],
        startedAt: new Date(now()).toISOString(),
      };
      h.sessions[s.id] = s;
      h.activeSessionId = s.id;
      return s;
    });
    const risks = [...new Set([...hazards.preflight, ...hazards.perStep.flat()])].map((k) => HAZARDS[k].label);
    const tools = [...new Set(guide.tools.map((t) => speakableTool(t.name)).filter(Boolean))];
    const speech = `Let's do it: ${guide.title}. It's ${(guide.difficulty || 'a moderate job').toLowerCase()}${guide.timeRequired ? `, about ${guide.timeRequired}` : ''}, in ${guide.steps.length} steps.${tools.length ? ` You'll need ${listOf(tools)}.` : ''} Say "next" when you're ready.`;
    return text(speech, {
      view: 'overview',
      sessionId: session.id,
      guide: { guideId, title: guide.title, difficulty: guide.difficulty, timeRequired: guide.timeRequired, image: guide.image, url: guide.url, attribution: guide.attribution },
      tools: guide.tools,
      parts: guide.parts,
      steps: guide.steps.length,
      risks,
    });
  });

  registerAppTool(server, 'repair_step', {
    title: 'Repair step',
    description: 'Move through the active repair one step at a time. Mend pauses for a human safety confirmation before risky steps.',
    inputSchema: z.object({
      move: z.enum(['next', 'back', 'repeat', 'goto']).default('next').describe('"next", "back", "repeat", or "goto" with a step number'),
      step: z.number().int().min(1).optional().describe('Step number for "goto"'),
      confirmSafety: z.boolean().optional().describe('ONLY for clients without elicitation: set true only after the person has said out loud that the safety check is done'),
    }),
    _meta: ui,
  }, async ({ move = 'next', step, confirmSafety }, ctx) => {
    const h = await store.get(household);
    const s = activeSession(h);
    if (!s) return text('There is no repair in progress. Tell me what needs fixing and I will find a guide.', { view: 'idle' });
    const guide = await guides.guide(s.guideId);
    const hazards = guideHazards(guide);
    let target = move === 'next' ? s.step + 1 : move === 'back' ? s.step - 1 : move === 'goto' ? (step || 1) - 1 : Math.max(0, s.step);
    target = Math.max(0, target);
    if (target >= guide.steps.length) {
      return text('That was the last step. Did it fix the problem?', { view: 'last', sessionId: s.id, title: guide.title, total: guide.steps.length });
    }

    const needed = [...(s.step < 0 || target === 0 ? hazards.preflight : []), ...hazards.perStep[target]];
    const pending = pendingChecks(needed, s.confirmed);
    if (pending.length) {
      const question = safetyQuestion(pending, s.device);
      if (pending.includes('refrigerant')) {
        return text(`${question} I'd recommend a certified technician for this one.`, { view: 'safety', status: 'stop', hazards: pending.map((k) => HAZARDS[k].label), question, step: target + 1 });
      }
      let ok = false;
      if (canElicit()) {
        ok = await askHuman(ctx, `Safety check before step ${target + 1}: ${question}`, 'confirmed', 'Yes, it is safe to continue');
      } else {
        ok = confirmSafety === true;
        if (!ok) {
          return text(`Before step ${target + 1}, a safety check: ${question} Say yes when it's done.`, { view: 'safety', status: 'confirmation_required', hazards: pending.map((k) => HAZARDS[k].label), question, step: target + 1 });
        }
      }
      if (!ok) {
        return text("Okay, we'll wait. Tell me when it's safe and I'll show the next step.", { view: 'safety', status: 'paused', hazards: pending.map((k) => HAZARDS[k].label), question, step: target + 1 });
      }
    }

    const saved = await store.update(household, (hh) => {
      const ss = activeSession(hh, s.id);
      ss.step = target;
      ss.confirmed = [...new Set([...ss.confirmed, ...pending])];
      return ss;
    });
    const st = guide.steps[target];
    const cautions = cautionNotes(hazards.perStep[target]);
    const said = st.lines.slice(0, 3).join(' ');
    const speech = `Step ${target + 1} of ${guide.steps.length}. ${said}${cautions.length ? ` ${cautions[0]}` : ''}`;
    return text(speech, {
      view: 'step',
      sessionId: saved.id,
      step: { n: target + 1, total: guide.steps.length, title: st.title, lines: st.lines, images: st.images },
      cautions,
      confirmed: saved.confirmed.map((k) => HAZARDS[k].label),
      guide: { title: guide.title, url: guide.url, attribution: guide.attribution },
    });
  });

  registerAppTool(server, 'finish_repair', {
    title: 'Finish the repair',
    description: 'Close the active repair and log it in the appliance passport.',
    inputSchema: z.object({
      outcome: z.enum(['fixed', 'not_fixed', 'stopped']).describe('Did the repair work?'),
      note: z.string().max(300).optional(),
    }),
    _meta: ui,
  }, async ({ outcome, note }) => {
    const result = await store.update(household, (h) => {
      const s = activeSession(h);
      if (!s) return null;
      const appliance = h.appliances.find((a) => a.id === s.applianceId) || h.appliances.find((a) => a.kind === s.kind) || null;
      h.repairs.unshift({ id: newId('rep'), applianceId: appliance?.id || null, guideId: s.guideId, title: s.title, outcome, note: note || '', startedAt: s.startedAt, finishedAt: new Date(now()).toISOString() });
      // A successful cleaning-type repair also resets the matching maintenance clock.
      if (appliance && outcome === 'fixed') {
        for (const rule of MAINTENANCE[appliance.kind] || []) {
          if (s.title.toLowerCase().includes(rule.id.split('-')[0])) {
            h.maintenance[appliance.id] ||= {};
            h.maintenance[appliance.id][rule.id] = new Date(now()).toISOString();
          }
        }
      }
      delete h.sessions[s.id];
      h.activeSessionId = null;
      return { s, appliance, upcoming: maintenanceFor(h, now()).filter((m) => m.applianceId === appliance?.id).slice(0, 2) };
    });
    if (!result) return text('There is no repair in progress.', { view: 'idle' });
    const { s, appliance, upcoming } = result;
    const warranty = appliance ? warrantyStatus(appliance, now()) : null;
    const guide = await guides.guide(s.guideId);
    let speech;
    if (outcome === 'fixed') {
      speech = `Nice work, it's fixed and logged in your passport.${upcoming[0] ? ` Next up: ${upcoming[0].task.toLowerCase()} by ${upcoming[0].dueOn}.` : ''}`;
    } else if (warranty?.active) {
      speech = `Sorry it didn't work. Good news: your ${describeAppliance(appliance)} is under warranty until ${warranty.endsOn}, so a manufacturer repair should be free.`;
    } else {
      speech = `Sorry it didn't work.${guide.parts.length ? ` This guide uses a ${guide.parts[0].name}; I can add one to your cart.` : ''} Or I can help you find a repair shop.`;
    }
    return text(speech, { view: 'finished', outcome, title: s.title, appliance: appliance ? describeAppliance(appliance) : null, warranty, upcoming, parts: guide.parts });
  });

  /* ---------------- Parts & cart (purchases need the person's approval) ---------------- */

  registerAppTool(server, 'add_part_to_cart', {
    title: 'Add a part to the cart',
    description: 'Add a replacement part to the Amazon cart. The person approves every purchase directly; the model cannot approve it.',
    inputSchema: z.object({
      part: z.string().describe('Part name, e.g. "drain pump"'),
      quantity: z.number().int().min(1).max(5).default(1),
      appliance: z.string().optional().describe('Appliance id or name from the passport'),
      confirmPurchase: z.boolean().optional().describe('ONLY for clients without elicitation: true only after the person explicitly approved'),
    }),
    _meta: ui,
  }, async ({ part, quantity = 1, appliance, confirmPurchase }, ctx) => {
    const h = await store.get(household);
    const a = matchAppliance(h, appliance || part);
    const forWhat = a ? ` for your ${describeAppliance(a)}` : '';
    const question = `Add ${quantity} × ${part}${forWhat} to your Amazon cart?`;
    let ok;
    if (canElicit()) ok = await askHuman(ctx, question, 'approve', 'Yes, add it to my cart');
    else {
      ok = confirmPurchase === true;
      if (!ok) return text(`${question} Say yes to approve.`, { view: 'cart', status: 'confirmation_required', question, cart: h.cart });
    }
    if (!ok) return text("No problem, I didn't add anything.", { view: 'cart', status: 'declined', cart: h.cart });
    const cart = await store.update(household, (hh) => {
      hh.cart.push({ id: newId('item'), part, quantity, applianceId: a?.id || null, appliance: a ? describeAppliance(a) : null, url: partSearchUrl(part, a), addedAt: new Date(now()).toISOString() });
      return hh.cart;
    });
    return text(`Done: ${part} is in your cart. You can check out on Amazon when you're ready.`, { view: 'cart', status: 'added', cart, simulated: true });
  });

  registerAppTool(server, 'view_cart', {
    title: 'View the cart',
    description: 'Show the parts in the cart.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async () => {
    const h = await store.get(household);
    const n = h.cart.reduce((s, i) => s + i.quantity, 0);
    return text(n ? `You have ${n} part${n > 1 ? 's' : ''} in your cart: ${listOf(h.cart.map((i) => i.part))}.` : 'Your cart is empty.', { view: 'cart', status: 'view', cart: h.cart, simulated: true });
  });

  /* ---------------- Appliance passport ---------------- */

  registerAppTool(server, 'register_appliance', {
    title: 'Register an appliance',
    description: 'Remember an appliance in this home: kind, brand, model, purchase month and warranty length.',
    inputSchema: z.object({
      kind: z.enum(KINDS),
      brand: z.string().optional(),
      model: z.string().optional(),
      nickname: z.string().optional().describe('e.g. "kitchen dishwasher"'),
      purchasedOn: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Purchase month, YYYY-MM'),
      warrantyMonths: z.number().int().min(0).max(120).optional(),
    }),
    _meta: ui,
  }, async (input) => {
    const h = await store.update(household, (hh) => {
      hh.appliances.push({ id: newId('app'), ...input, addedAt: new Date(now()).toISOString() });
      return hh;
    });
    const a = h.appliances[h.appliances.length - 1];
    return text(`Got it, I'll remember your ${describeAppliance(a)}.`, passportView(h));
  });

  registerAppTool(server, 'appliance_passport', {
    title: 'Appliance passport',
    description: "The home's appliances with warranty status, repair history and maintenance that's due.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async () => {
    const h = await store.get(household);
    if (!h.appliances.length) return text("I don't know any of your appliances yet. Tell me about one, like your dishwasher's brand.", passportView(h));
    const due = maintenanceFor(h, now()).filter((m) => m.status !== 'ok');
    const speech = `You have ${h.appliances.length} appliance${h.appliances.length > 1 ? 's' : ''} in your passport.${due.length ? ` ${due.length} maintenance task${due.length > 1 ? 's are' : ' is'} due, starting with: ${due[0].task.toLowerCase()} on the ${due[0].appliance}.` : ' Nothing is due.'}`;
    return text(speech, passportView(h));
  });

  registerAppTool(server, 'maintenance_due', {
    title: 'Maintenance due',
    description: 'Upcoming and overdue maintenance for the appliances in the passport.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async () => {
    const h = await store.get(household);
    const all = maintenanceFor(h, now());
    const due = all.filter((m) => m.status !== 'ok');
    const speech = due.length
      ? `${due.length} thing${due.length > 1 ? 's are' : ' is'} due: ${listOf(due.map((m) => `${m.task.toLowerCase()} on the ${m.appliance}`))}.`
      : 'All caught up. Nothing is due this week.';
    return text(speech, { view: 'maintenance', tasks: all.slice(0, 8) });
  });

  registerAppTool(server, 'mark_maintenance_done', {
    title: 'Mark maintenance done',
    description: 'Record that a maintenance task was done today.',
    inputSchema: z.object({
      appliance: z.string().describe('Appliance id or name'),
      task: z.string().describe('Task id or words from it, e.g. "coils"'),
    }),
    _meta: ui,
  }, async ({ appliance, task }) => {
    const out = await store.update(household, (h) => {
      const a = matchAppliance(h, appliance);
      const rule = a && (MAINTENANCE[a.kind] || []).find((r) => r.id === task || r.task.toLowerCase().includes(task.toLowerCase()) || task.toLowerCase().includes(r.id));
      if (!a || !rule) return null;
      h.maintenance[a.id] ||= {};
      h.maintenance[a.id][rule.id] = new Date(now()).toISOString();
      return { a, rule, tasks: maintenanceFor(h, now()) };
    });
    if (!out) return text("I couldn't match that to a maintenance task. Which appliance was it?", { view: 'maintenance', tasks: [] });
    return text(`Logged: ${out.rule.task.toLowerCase()} on the ${describeAppliance(out.a)}.`, { view: 'maintenance', tasks: out.tasks.slice(0, 8) });
  });

  function passportView(h) {
    return {
      view: 'passport',
      appliances: h.appliances.map((a) => ({
        ...a,
        name: describeAppliance(a),
        warranty: warrantyStatus(a, now()),
        lastRepair: h.repairs.find((r) => r.applianceId === a.id) || null,
      })),
      due: maintenanceFor(h, now()).filter((m) => m.status !== 'ok').slice(0, 5),
    };
  }

  /* ---------------- Resources & prompts ---------------- */

  registerAppResource(server, 'Mend screen', SCREEN_URI, {
    description: 'Echo Show screen for Mend: guides, step photos, safety checks, passport and cart.',
    _meta: { ui: { csp: { resourceDomains: ['https://guide-images.cdn.ifixit.com', 'https://www.ifixit.com'] }, prefersBorder: false } },
  }, async () => ({
    contents: [{ uri: SCREEN_URI, mimeType: RESOURCE_MIME_TYPE, text: await screenHtml(), _meta: { ui: { csp: { resourceDomains: ['https://guide-images.cdn.ifixit.com', 'https://www.ifixit.com'] } } } }],
  }));

  server.registerResource('Appliance passport', 'mend://household/passport', {
    title: 'Appliance passport',
    description: 'Appliances, warranty, repairs and maintenance for this household (JSON).',
    mimeType: 'application/json',
  }, async (uri) => {
    const h = await store.get(household);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(passportView(h), null, 2) }] };
  });

  server.registerPrompt('fix_something', {
    title: 'Fix something',
    description: 'Start a guided, hands-free repair.',
    argsSchema: z.object({ device: z.string(), problem: z.string() }),
  }, ({ device, problem }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `My ${device} has a problem: ${problem}. Help me fix it with Mend, one step at a time.` } }],
  }));

  return server;
}

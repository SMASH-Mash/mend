// Mend screen (MCP App View). Renders tool results; touch controls call tools through the host.
// `MCPApps` is the official @modelcontextprotocol/ext-apps SDK, inlined by src/ui.js.

const { App } = MCPApps;
const root = document.getElementById('root');
const app = new App({ name: 'Mend screen', version: '1.0.0' }, {}, { autoResize: false });

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  wrench: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.8-.6-.6-2.8z"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v4M12 16h.01"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>'),
  next: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  repeat: svg('<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>'),
  cart: svg('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h3l2.6 12h10.4l2-8.5H6.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  alert: svg('<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
  tool: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.8-.6-.6-2.8z"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  dishwasher: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M8 5.5h.01M11 5.5h.01"/><circle cx="12" cy="14.5" r="3.5"/>'),
  washer: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13.5" r="4.5"/><path d="M8 6h.01M11 6h.01"/>'),
  dryer: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13.5" r="4.5"/><path d="M10 12c1 1 3 0 4 1.5"/>'),
  refrigerator: svg('<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 9.5h12M9 5.5v2M9 12.5v3"/>'),
  laptop: svg('<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
  other: svg('<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/>'),
};
const kindIcon = (k) => I[k] || (k === 'microwave' || k === 'oven' ? I.dishwasher : I.other);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = (o) => esc(JSON.stringify(o));
const btn = (label, tool, args, cls = '', icon = '') => `<button class="btn ${cls}" data-tool="${tool}" data-args="${attr(args)}" data-label="${esc(label)}">${icon}${esc(label)}</button>`;
const chip = (text, cls = '', icon = '') => `<span class="chip ${cls}">${icon}${esc(text)}</span>`;

const VIEWS = {
  idle: () => `<div class="logo">Mend</div><p class="muted">Tell me what's broken. I'll walk you through the fix.</p>`,

  guides: (d) => `
    <div><div class="kicker">Repair guides</div><h1>${esc(d.device)}${d.problem ? ` <span class="muted">· ${esc(d.problem)}</span>` : ''}</h1></div>
    <div class="grid">${(d.guides || []).map((g, i) => `
      <button class="card guide" style="--i:${i}" data-tool="start_repair" data-args="${attr({ guideId: g.guideId })}" data-label="Start guide ${i + 1}">
        <div class="thumb" style="background-image:url('${esc(g.image || '')}')"><span class="num">${i + 1}</span></div>
        <div class="body"><div class="t">${esc(g.title)}</div>${g.difficulty ? chip(g.difficulty, /easy/i.test(g.difficulty) ? 'green' : 'amber') : ''}</div>
      </button>`).join('') || '<p class="muted">No guides found.</p>'}</div>
    <div class="tiny">Repair guides from iFixit (CC BY-NC-SA). Say "start number one" or tap a guide.</div>`,

  overview: (d) => `
    <div class="split">
      <div class="photo">${d.guide.image ? `<img src="${esc(d.guide.image)}" alt="">` : ''}</div>
      <div class="side">
        <div class="kicker">Ready to fix</div>
        <h1>${esc(d.guide.title)}</h1>
        <div class="chips">${d.guide.difficulty ? chip(d.guide.difficulty, /easy/i.test(d.guide.difficulty) ? 'green' : 'amber') : ''}${d.guide.timeRequired ? chip(d.guide.timeRequired, '', I.clock) : ''}${chip(`${d.steps} steps`)}</div>
        <div class="scroll">
          ${d.tools?.length ? `<h2>You'll need</h2><ul class="tools">${d.tools.map((t, i) => `<li style="--i:${i}">${I.check}${esc(t.name)}</li>`).join('')}</ul>` : ''}
          ${d.parts?.length ? `<h2 style="margin-top:1em">Parts</h2><ul class="tools">${d.parts.map((p, i) => `<li style="--i:${i}">${I.cart}${esc(p.name)}</li>`).join('')}</ul>` : ''}
          ${d.risks?.length ? `<div class="chips" style="margin-top:1em">${d.risks.map((r) => chip(r, 'red', I.alert)).join('')}</div><p class="tiny">Mend will pause for a safety check before risky steps.</p>` : ''}
        </div>
        <div class="btns">${btn('Start step 1', 'repair_step', { move: 'next' }, 'primary', I.next)}</div>
        <div class="tiny">${esc(d.guide.attribution)}</div>
      </div>
    </div>`,

  step: (d) => {
    const s = d.step;
    const bar = Array.from({ length: s.total }, (_, i) => `<i class="${i + 1 < s.n ? 'done' : i + 1 === s.n ? 'cur' : ''}"></i>`).join('');
    return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:1em">
      <div class="kicker">Step ${s.n} of ${s.total}${s.title ? ` · ${esc(s.title)}` : ''}</div>
      <div class="tiny" style="text-align:right">${esc(d.guide.title)}</div>
    </div>
    <div class="progress">${bar}</div>
    <div class="split">
      <div class="photo">${s.images?.length ? `<img src="${esc(s.images[0])}" alt="">${s.images.length > 1 ? `<div class="dots">${s.images.map((u, i) => `<button class="${i ? '' : 'on'}" data-img="${esc(u)}" aria-label="Photo ${i + 1}"></button>`).join('')}</div>` : ''}` : `<div style="display:grid;place-items:center;height:100%;color:var(--ink-3)">${I.wrench}</div>`}</div>
      <div class="side">
        <div class="scroll"><ul class="lines">${s.lines.map((l, i) => `<li style="--i:${i}">${esc(l)}</li>`).join('')}</ul>
          ${(d.cautions || []).map((c) => `<div class="caution" style="margin-top:1em">${I.alert}<span>${esc(c)}</span></div>`).join('')}
        </div>
        ${d.confirmed?.length ? `<div class="chips">${d.confirmed.map((c) => chip(`${c} checked`, 'green', I.check)).join('')}</div>` : ''}
        <div class="btns">${btn('Back', 'repair_step', { move: 'back' }, '', I.back)}${btn('Repeat', 'repair_step', { move: 'repeat' }, '', I.repeat)}${btn('Next', 'repair_step', { move: 'next' }, 'primary', I.next)}</div>
        <div class="tiny">${esc(d.guide.attribution)}</div>
      </div>
    </div>`;
  },

  safety: (d) => `
    <div class="shield">${I.shield}</div>
    <div class="kicker">Safety check${d.step ? ` · before step ${d.step}` : ''}</div>
    <h1>${esc(d.question)}</h1>
    <div class="chips" style="justify-content:center">${(d.hazards || []).map((h) => chip(h, 'red', I.alert)).join('')}</div>
    ${d.status === 'stop' ? '<p class="muted">This needs a certified technician.</p>'
      : d.status === 'paused' ? `<p class="muted">Paused. Say "I'm ready" when it's safe.</p><div class="btns">${btn("I'm ready", 'repair_step', { move: 'next' }, 'primary', I.check)}</div>`
      : `<div class="btns">${btn("Yes, it's safe", 'repair_step', { move: 'next', confirmSafety: true }, 'primary', I.check)}</div>`}`,

  last: () => `
    <div class="badge bad">${I.wrench}</div>
    <h1>That was the last step. Did it fix the problem?</h1>
    <div class="btns">${btn("Yes, it's fixed", 'finish_repair', { outcome: 'fixed' }, 'teal', I.check)}${btn('Not yet', 'finish_repair', { outcome: 'not_fixed' })}</div>`,

  finished: (d) => `
    ${d.outcome === 'fixed' ? `<div class="confetti">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${['#ffb547', '#33e0c2', '#3ddc97', '#ff7a45'][i % 4]};--dx:${((i * 53) % 40) - 20}vw;--rot:${(i * 97) % 720}deg;animation-delay:${(i % 7) * 60}ms"></i>`).join('')}</div>` : ''}
    <div class="badge ${d.outcome === 'fixed' ? '' : 'bad'}">${d.outcome === 'fixed' ? I.check : I.wrench}</div>
    <h1>${d.outcome === 'fixed' ? 'Fixed, and logged in your passport' : 'Not fixed yet'}</h1>
    <p class="muted" style="max-width:40ch;margin:0 auto">${esc(d.speech)}</p>
    ${d.warranty?.active ? chip(`Warranty until ${d.warranty.endsOn}`, 'green', I.shield) : ''}
    ${(d.upcoming || []).length ? `<div class="chips" style="justify-content:center">${d.upcoming.map((m) => chip(`${m.task} · ${m.dueOn}`, '', I.calendar)).join('')}</div>` : ''}
    ${d.outcome !== 'fixed' && d.parts?.length ? `<div class="btns">${d.parts.map((p) => btn(`Add ${p.name} to cart`, 'add_part_to_cart', { part: p.name }, 'primary', I.cart)).join('')}</div>` : ''}`,

  cart: (d) => `
    <div><div class="kicker">Amazon cart ${d.simulated ? '· prototype' : ''}</div><h1>${d.status === 'declined' ? 'Nothing added' : 'Your parts'}</h1></div>
    <div class="list">${(d.cart || []).map((it, i) => `
      <div class="card row" style="--i:${i}"><div class="ico">${I.cart}</div>
        <div class="grow"><b>${esc(it.part)}</b><span class="muted">${esc(it.appliance || '')}${it.appliance ? ' · ' : ''}qty ${it.quantity}</span></div>
        <a href="${esc(it.url)}" target="_blank" rel="noopener">View on Amazon</a></div>`).join('') || '<p class="muted">Your cart is empty.</p>'}</div>
    ${d.status === 'confirmation_required' ? `<div class="btns">${btn('Approve', 'add_part_to_cart', { part: d.question?.match(/× (.+?)( for|\?)/)?.[1] || '', confirmPurchase: true }, 'primary', I.check)}</div>` : ''}
    <div class="tiny">Prototype: items are saved by Mend and open as Amazon searches. Every purchase is approved by you, never by the assistant.</div>`,

  passport: (d) => `
    <div><div class="kicker">Appliance passport</div><h1>Your home</h1></div>
    <div class="cols">
      <div class="list">${(d.appliances || []).map((a, i) => `
        <div class="card row" style="--i:${i}"><div class="ico">${kindIcon(a.kind)}</div>
          <div class="grow"><b>${esc(a.nickname || a.name)}</b><span class="muted">${esc(a.name)}${a.lastRepair ? ` · last repair ${esc(a.lastRepair.finishedAt.slice(0, 10))}` : ''}</span></div>
          ${a.warranty ? chip(a.warranty.active ? `Warranty to ${a.warranty.endsOn}` : 'Out of warranty', a.warranty.active ? 'green' : '') : ''}</div>`).join('') || '<p class="muted">No appliances yet.</p>'}</div>
      <div class="list">${(d.due || []).length ? `<h2>Due now</h2>${d.due.map((m, i) => `
        <div class="card row" style="--i:${i}"><div class="ico">${I.calendar}</div><div class="grow"><b>${esc(m.task)}</b><span class="muted">${esc(m.appliance)} · ${esc(m.dueOn)}</span></div>${chip(m.status, m.status === 'overdue' ? 'red' : 'amber')}</div>`).join('')}` : '<p class="muted">Nothing is due.</p>'}</div>
    </div>`,

  maintenance: (d) => `
    <div><div class="kicker">Maintenance</div><h1>Keep things running</h1></div>
    <div class="list">${(d.tasks || []).map((m, i) => `
      <div class="card row" style="--i:${i}"><div class="ico">${I.calendar}</div>
        <div class="grow"><b>${esc(m.task)}</b><span class="muted">${esc(m.appliance)} · due ${esc(m.dueOn)}</span></div>
        ${chip(m.status === 'ok' ? 'on track' : m.status, m.status === 'overdue' ? 'red' : m.status === 'due' ? 'amber' : 'green')}
        ${m.status !== 'ok' ? btn('Done', 'mark_maintenance_done', { appliance: m.applianceId, task: m.taskId }, '', I.check) : ''}</div>`).join('') || '<p class="muted">No maintenance tracked yet.</p>'}</div>`,
};

function render(data) {
  if (!data || !data.view) return;
  const view = VIEWS[data.view] ? data.view : 'idle';
  root.className = `view view-${view} ${data.status || ''}`;
  root.innerHTML = VIEWS[view](data);
  root.style.animation = 'none';
  void root.offsetWidth;
  root.style.animation = '';
}

async function call(name, args, label) {
  root.classList.add('leaving');
  try {
    const res = await app.callServerTool({ name, arguments: args });
    render(res?.structuredContent);
    // Keep the voice assistant in sync with what happened on screen.
    app.updateModelContext?.({ content: [{ type: 'text', text: `On the Mend screen the person tapped "${label}". Result: ${res?.structuredContent?.speech || ''}` }] })?.catch?.(() => {});
  } catch (e) {
    root.classList.remove('leaving');
    console.error(e);
  }
}

root.addEventListener('click', (e) => {
  const dot = e.target.closest('[data-img]');
  if (dot) {
    root.querySelector('.photo img').src = dot.dataset.img;
    root.querySelectorAll('.dots button').forEach((b) => b.classList.toggle('on', b === dot));
    return;
  }
  const b = e.target.closest('[data-tool]');
  if (b) call(b.dataset.tool, JSON.parse(b.dataset.args || '{}'), b.dataset.label || b.textContent.trim());
});

app.ontoolresult = (result) => render(result?.structuredContent);
app.ontoolinput = () => root.classList.add('leaving');
app.connect().catch((e) => console.error('Mend screen could not connect to the host', e));

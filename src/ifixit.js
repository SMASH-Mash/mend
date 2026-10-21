// iFixit repair guides (https://www.ifixit.com/api/2.0). Free, no API key.
// Guide content is licensed CC BY-NC-SA by iFixit and its authors; Mend always shows attribution.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const API = 'https://www.ifixit.com/api/2.0';
const BUNDLED = fileURLToPath(new URL('../data/guides/', import.meta.url));

/** iFixit wiki markup → plain, speakable text. */
export function cleanText(raw = '') {
  return String(raw)
    .replace(/\[videotimestamp\|[^\]]*\]/gi, '')
    // [link|url|label], [guide|id|label], [product|sku|label] → label
    .replace(/\[(?:link|guide|product|wiki|url)\|[^|\]]*\|([^\]]*)\]/gi, '$1')
    .replace(/\[(?:link|guide|product|wiki|url)\|([^\]]*)\]/gi, '$1')
    .replace(/'''(.*?)'''/g, '$1')
    .replace(/''(.*?)''/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

const firstImage = (media) => {
  const data = media && Array.isArray(media.data) ? media.data : [];
  const img = data.find((d) => d && (d.standard || d.medium || d.large));
  return img ? img.standard || img.medium || img.large : null;
};

/** Normalizes an iFixit guide into what Mend speaks and shows. */
export function normalizeGuide(g) {
  const steps = (g.steps || []).map((s, i) => ({
    n: i + 1,
    title: cleanText(s.title || ''),
    lines: (s.lines || []).map((l) => cleanText(l.text_raw ?? l.text_rendered ?? '')).filter(Boolean),
    images: ((s.media && s.media.data) || []).map((d) => d.standard || d.medium).filter(Boolean).slice(0, 3),
  })).filter((s) => s.lines.length || s.images.length);
  return {
    guideId: g.guideid,
    title: cleanText(g.title || ''),
    device: cleanText(g.category || ''),
    difficulty: g.difficulty || null,
    timeRequired: g.time_required || null,
    url: g.url || `https://www.ifixit.com/Guide/_/${g.guideid}`,
    image: g.image ? g.image.standard || g.image.medium || null : steps.find((s) => s.images.length)?.images[0] || null,
    introduction: cleanText(g.introduction_raw || '').slice(0, 600),
    tools: (g.tools || []).map((t) => ({ name: cleanText(t.text || ''), url: t.url || null })).filter((t) => t.name),
    parts: (g.parts || []).map((p) => ({ name: cleanText(p.text || ''), url: p.url || null })).filter((p) => p.name),
    steps,
    attribution: `Guide by ${g.author?.username || 'the iFixit community'} on iFixit, CC BY-NC-SA`,
  };
}

const DIFFICULTY_ORDER = ['Very easy', 'Easy', 'Moderate', 'Difficult', 'Very difficult'];

// Everyday symptoms → the repair vocabulary iFixit guides are titled with.
const SYMPTOM_TERMS = [
  [/drain|standing water|won.?t empty|water (left|at the bottom)|e24|e25|error 24/i, ['drain filter', 'drain pump', 'drain']],
  [/leak|puddle|dripping/i, ['door seal', 'gasket', 'hose', 'leak']],
  [/not heat|no heat|cold|won.?t dry|not drying/i, ['heating element', 'thermal fuse', 'thermostat']],
  [/not cool|warm|not cold/i, ['condenser coils', 'fan', 'thermostat']],
  [/noisy|loud|grinding|squeak|rattl/i, ['fan', 'bearing', 'belt', 'motor']],
  [/won.?t spin|not spinning/i, ['belt', 'motor', 'lid switch']],
  [/won.?t (turn|switch) on|dead|no power/i, ['power supply', 'fuse', 'switch']],
  [/not cleaning|dirty dishes|spots/i, ['spray arm', 'filter']],
  [/smell|odor|odour/i, ['filter', 'clean']],
  [/battery|won.?t charge|charging/i, ['battery', 'charging port']],
  [/screen|display|cracked/i, ['screen', 'display']],
  [/overheat|hot|fan/i, ['fan', 'thermal paste']],
];

export function searchTerms(device, problem = '') {
  const d = cleanText(device).toLowerCase();
  const base = d.replace(/\b(my|the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const words = base.split(' ');
  const generic = words.slice(-2).join(' '); // "bosch dishwasher" → keeps brand; "kitchen dishwasher" → "dishwasher"
  const lastWord = words[words.length - 1];
  const terms = [];
  for (const [re, list] of SYMPTOM_TERMS) if (re.test(problem)) terms.push(...list);
  // Most specific first; the plain device query always survives the cut.
  const queries = [];
  for (const term of terms.slice(0, 2)) queries.push(`${base} ${term}`);
  queries.push(base);
  for (const term of terms.slice(0, 2)) queries.push(`${lastWord} ${term}`);
  if (problem) queries.push(`${base} ${problem}`);
  queries.push(generic);
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 7);
}

export function createGuideSource({ fetchImpl = globalThis.fetch, cacheDir = null, offline = false } = {}) {
  const memory = new Map();

  async function getJSON(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetchImpl(`${API}${path}`, { signal: ctrl.signal, headers: { 'User-Agent': 'Mend-MCP/1.0 (hackathon prototype)' } });
      if (!res.ok) throw new Error(`iFixit HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function readBundled(id) {
    for (const dir of [cacheDir, BUNDLED].filter(Boolean)) {
      try { return JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')); } catch { /* not cached */ }
    }
    return null;
  }

  async function bundledIndex() {
    try { return JSON.parse(await readFile(join(BUNDLED, 'index.json'), 'utf8')); } catch { return []; }
  }

  return {
    /** Ranked guide matches for a device and a problem in everyday words. */
    async find(device, problem = '', { limit = 4, model = '' } = {}) {
      const found = new Map();
      const queries = searchTerms(device, problem);
      if (!offline) {
        for (const q of queries) {
          if (found.size >= limit * 2) break;
          try {
            const data = await getJSON(`/search/${encodeURIComponent(q)}?filter=guide&limit=8`);
            for (const r of data.results || []) {
              if (!found.has(r.guideid)) {
                found.set(r.guideid, {
                  guideId: r.guideid,
                  title: cleanText(r.title || ''),
                  difficulty: r.difficulty || null,
                  image: r.image ? r.image.standard || r.image.medium || r.image.thumbnail || null : null,
                  url: r.url || null,
                  query: q,
                });
              }
            }
          } catch { /* try the next query; fall back to bundled guides below */ }
        }
      }
      if (!found.size) {
        const words = `${device} ${problem}`.toLowerCase();
        for (const g of await bundledIndex()) {
          if (g.keywords.some((k) => words.includes(k))) found.set(g.guideId, { ...g, query: 'offline' });
        }
      }
      const text = `${device} ${problem}`.toLowerCase();
      const score = (g) => {
        const t = g.title.toLowerCase();
        let s = 0;
        for (const w of text.split(/\W+/)) if (w.length > 2 && t.includes(w)) s += 2;
        // The exact model from the appliance passport beats everything else.
        if (model && t.replace(/[^a-z0-9]/g, '').includes(model.toLowerCase().replace(/[^a-z0-9]/g, ''))) s += 6;
        const d = DIFFICULTY_ORDER.indexOf(g.difficulty);
        s += d >= 0 ? (4 - d) * 0.5 : 0;
        if (g.image) s += 0.5;
        return s;
      };
      return [...found.values()].sort((a, b) => score(b) - score(a)).slice(0, limit);
    },

    async guide(id) {
      if (memory.has(id)) return memory.get(id);
      let raw = null;
      if (!offline) {
        try {
          raw = await getJSON(`/guides/${id}`);
          if (cacheDir) {
            await mkdir(cacheDir, { recursive: true });
            await writeFile(join(cacheDir, `${id}.json`), JSON.stringify(raw));
          }
        } catch { raw = null; }
      }
      raw ||= await readBundled(id);
      if (!raw || !raw.steps) throw new Error(`Guide ${id} is not available offline.`);
      const g = normalizeGuide(raw);
      memory.set(id, g);
      return g;
    },
  };
}

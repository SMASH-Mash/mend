// Household storage. Each household is one JSON document, so the same model
// fits a local file today and a DynamoDB item when deployed.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyHousehold } from './passport.js';

const safeId = (id) => String(id || 'demo').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64) || 'demo';

/** Serializes read-modify-write per household so concurrent tool calls don't clobber each other. */
function withLocks() {
  const locks = new Map();
  return (id, fn) => {
    const prev = locks.get(id) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(id, next.catch(() => {}));
    return next;
  };
}

export function createMemoryStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  const lock = withLocks();
  return {
    async get(id) {
      return structuredClone(data.get(safeId(id)) || emptyHousehold(safeId(id)));
    },
    /** Applies `fn` to the household and saves the result. Returns what `fn` returns. */
    async update(id, fn) {
      return lock(safeId(id), async () => {
        const h = structuredClone(data.get(safeId(id)) || emptyHousehold(safeId(id)));
        const out = await fn(h);
        data.set(safeId(id), h);
        return out;
      });
    },
  };
}

export function createFileStore(dir) {
  const lock = withLocks();
  const file = (id) => join(dir, `${safeId(id)}.json`);
  async function read(id) {
    try { return JSON.parse(await readFile(file(id), 'utf8')); } catch { return emptyHousehold(safeId(id)); }
  }
  return {
    get: read,
    async update(id, fn) {
      return lock(safeId(id), async () => {
        const h = await read(id);
        const out = await fn(h);
        await mkdir(dir, { recursive: true });
        const tmp = `${file(id)}.tmp`;
        await writeFile(tmp, JSON.stringify(h, null, 2));
        await rename(tmp, file(id));
        return out;
      });
    },
  };
}

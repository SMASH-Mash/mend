// Downloads a few iFixit guides into data/guides/ so the demo works offline.
// Usage: npm run fetch-guides
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../data/guides/', import.meta.url));
const GUIDES = [
  { guideId: 182595, keywords: ['dishwasher', 'drain', 'standing water', 'filter', 'bosch'] },
  { guideId: 151123, keywords: ['dishwasher', 'drain pump', 'lg'] },
  { guideId: 163155, keywords: ['refrigerator', 'fridge', 'coils', 'condenser', 'samsung', 'not cooling'] },
];

await mkdir(DIR, { recursive: true });
const index = [];
for (const g of GUIDES) {
  const res = await fetch(`https://www.ifixit.com/api/2.0/guides/${g.guideId}`, { headers: { 'User-Agent': 'Mend-MCP/1.0' } });
  if (!res.ok) throw new Error(`guide ${g.guideId}: HTTP ${res.status}`);
  const raw = await res.json();
  await writeFile(`${DIR}${g.guideId}.json`, JSON.stringify(raw));
  index.push({ guideId: g.guideId, title: raw.title, difficulty: raw.difficulty, image: raw.image?.standard || null, url: raw.url, keywords: g.keywords });
  console.log(`saved ${g.guideId}: ${raw.title}`);
}
await writeFile(`${DIR}index.json`, JSON.stringify(index, null, 2));

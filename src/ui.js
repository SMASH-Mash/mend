// Builds the single MCP App screen (ui://mend/screen.html): a self-contained HTML
// document with the official MCP Apps SDK inlined, so it renders in any MCP Apps host.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
let cached = null;

/** Turns the ESM bundle's trailing `export{a as A,…}` into a local `MCPApps` object. */
export function inlineBundle(source) {
  const m = source.match(/export\{([^}]*)\};?\s*$/);
  if (!m) throw new Error('Unexpected MCP Apps bundle format');
  const pairs = m[1].split(',').map((p) => p.trim().split(/\s+as\s+/)).map(([local, exported]) => `${JSON.stringify(exported || local)}:${local}`);
  return `${source.slice(0, m.index)}\nconst MCPApps={${pairs.join(',')}};\n`;
}

export async function screenHtml() {
  if (cached) return cached;
  const bundlePath = join(dirname(fileURLToPath(import.meta.resolve('@modelcontextprotocol/ext-apps'))), 'app-with-deps.js');
  const [bundle, css, client] = await Promise.all([
    readFile(bundlePath, 'utf8'),
    readFile(join(HERE, 'ui', 'screen.css'), 'utf8'),
    readFile(join(HERE, 'ui', 'screen.client.js'), 'utf8'),
  ]);
  cached = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mend</title>
<style>${css}</style>
</head>
<body>
<main id="root" class="view view-idle"><div class="idle"><div class="logo">Mend</div><p>Hands-free repair</p></div></main>
<script type="module">
${inlineBundle(bundle)}
${client}
</script>
</body>
</html>`;
  return cached;
}

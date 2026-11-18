// Solmar Bay's hand-in program (Node 22, standard library only). The game is
// this directory's game/ folder — plain static files a desktop browser loads
// offline — and this program copies game/ and screenshots/ to the output
// directory and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Count the files under a directory, recursively — for the hand-in summary. */
function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name));
    else if (entry.isFile()) total += 1;
  }
  return total;
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A short hand-in summary, so a run says what it handed in.
const gameFiles = countFiles(join(out, 'game'));
const shotFiles = existsSync(join(out, 'screenshots')) ? countFiles(join(out, 'screenshots')) : 0;
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(
  `Solmar Bay handed in: ${gameFiles} game files, ${shotFiles} screenshots, dossier.json ${dossierBytes} bytes -> ${out}`,
);

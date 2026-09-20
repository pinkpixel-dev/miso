#!/usr/bin/env node
// Copies the music model specs out of audio.cpp at a pinned commit.
//
// The specs are not served over HTTP, so Miso vendors them. Only the music
// families are taken: the other 50 or so are speech models Miso never shows,
// and a smaller vendored set keeps the diff reviewable.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'https://github.com/0xShug0/audio.cpp.git';

// Pin. Bump deliberately, re-run this script, and re-run the parser tests.
const COMMIT = process.env.AUDIOCPP_COMMIT ?? '9ba884179826c3b33dd305185b5f94c79175a03d';

// The music families, corrected against a real directory listing of
// model_specs/ upstream (see task-2-report.md for what changed from the
// original plan prose). Filenames are the family id plus .json.
// Most families here have a task behind it. A spec with no task is a package
// offered for install that nothing can then run, which is usually worse than
// not showing it: the weights are large, and AudioSR alone was 6.18 GB sitting
// on disk with nothing able to use it.
//
// Six were removed on 2026-09-19. AudioSR after upscale was built and dropped.
// Seed-VC and MeanVC2, shelved in phase 6b, whose only likely use was the
// upscaling that went with it. ControlFoley, MiDashengLM-Gen and MuScriptor
// when the remaining phase 7 tasks were closed unbuilt. See DOCS/ROADMAP.md.
//
// Three came back later the same day so the phase 7 tasks closed unbuilt could
// be probed. Two of them went straight back out: ControlFoley answers in mono
// at a fixed eight seconds and fifteen times slower than Stable Audio SFX, and
// MiDashengLM-Gen answers at 16 kHz mono with every one of its prompt tags
// inert. MuScriptor stayed and has `analyze.midi` behind it. The measurements
// are in src/server/audiocpp/fixtures/README.md.
//
// Adding one back means putting it here and re-running this script, which needs
// network access to the pinned commit.
//
// Vevo2 joined on 2026-09-20, with `voice.vevo2` behind it the same day. The
// pin moved from 05f9c5d to 9ba8841 to reach it, and every spec already here
// was byte for byte identical at both commits, so nothing else moved with it.
const FAMILIES = [
  'ace_step',
  'minimax_music3',
  'heartmula',
  'stable_audio',
  'htdemucs',
  'bs_roformer',
  'mel_band_roformer',
  'rvc',
  'vevo2',
  'muscriptor',
];

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/server/catalog/specs');
const work = mkdtempSync(join(tmpdir(), 'miso-specs-'));

function git(...args) {
  return execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

try {
  git('init', '-q');
  git('remote', 'add', 'origin', REPOSITORY);
  git('config', 'core.sparseCheckout', 'true');
  writeFileSync(join(work, '.git/info/sparse-checkout'), 'model_specs/\n');
  git('fetch', '--depth', '1', 'origin', COMMIT);
  git('checkout', '-q', 'FETCH_HEAD');

  const commit = git('rev-parse', 'HEAD').trim();
  const specsDir = join(work, 'model_specs');
  const available = new Set(readdirSync(specsDir).filter((f) => f.endsWith('.json')));

  const missing = FAMILIES.filter((f) => !available.has(`${f}.json`));
  if (missing.length > 0) {
    console.error('Missing specs upstream at ' + commit + ':');
    for (const name of missing) console.error('  ' + name + '.json');
    console.error('\nAvailable files:\n  ' + [...available].sort().join('\n  '));
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = [];
  for (const family of FAMILIES) {
    const name = `${family}.json`;
    cpSync(join(specsDir, name), join(outDir, name));
    const sha256 = createHash('sha256').update(readFileSync(join(outDir, name))).digest('hex');
    files.push({ name, sha256 });
  }

  writeFileSync(
    join(outDir, 'MANIFEST.json'),
    JSON.stringify(
      { repository: REPOSITORY, commit, vendoredAt: new Date().toISOString(), files },
      null,
      2,
    ) + '\n',
  );

  console.log(`Vendored ${files.length} specs from ${commit}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

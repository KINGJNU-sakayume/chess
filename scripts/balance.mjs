#!/usr/bin/env node
/**
 * Headless balance simulation (M6).
 *
 *   npm run balance -- --seeds 40 --policies pawn,bishop,board,any --acts 3 --out balance-report.md
 *
 * Loads the TypeScript engine through Vite's SSR module loader (no extra
 * tooling), plays every seeded run with the bot through the real reducer and
 * prints a Markdown report. Seeds are deterministic: any row can be replayed.
 */
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

function args(argv) {
  const out = { seeds: 24, policies: undefined, acts: 3, prefix: 'balance-', out: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--seeds') out.seeds = Number(next());
    else if (a === '--policies') out.policies = next().split(',');
    else if (a === '--acts') out.acts = Number(next());
    else if (a === '--prefix') out.prefix = next();
    else if (a === '--out') out.out = next();
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: npm run balance -- [--seeds N] [--policies a,b] [--acts 1-3] [--prefix s] [--out file.md] [--json]');
      process.exit(0);
    }
  }
  return out;
}

const opts = args(process.argv.slice(2));
const server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { runBalance, formatBalanceReport } = await server.ssrLoadModule('/src/engine/run/balance.ts');
  const t0 = performance.now();
  const report = runBalance({
    seeds: opts.seeds,
    prefix: opts.prefix,
    policies: opts.policies,
    maxActs: opts.acts,
    onRun: (policy, seed, done, total) => {
      if (process.stderr.isTTY) process.stderr.write(`\r${done}/${total} runs (${policy} ${seed})          `);
      else if (done % Math.max(1, Math.round(total / 10)) === 0) process.stderr.write(`${done}/${total} runs\n`);
    },
  });
  process.stderr.write(`\rSimulated ${opts.seeds} seeds × ${report.policies.length} policies in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);
  const text = opts.json ? JSON.stringify(report, null, 2) : formatBalanceReport(report);
  if (opts.out) {
    writeFileSync(opts.out, text + '\n');
    process.stderr.write(`Wrote ${opts.out}\n`);
  } else {
    console.log(text);
  }
} finally {
  await server.close();
}

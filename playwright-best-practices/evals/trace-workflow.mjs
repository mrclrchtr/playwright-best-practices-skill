import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const hash = file => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const within = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export function prepare(root) {
  // Refuse an existing directory so preparation cannot overwrite another run.
  fs.mkdirSync(root, { mode: 0o700 });
  root = fs.realpathSync(root);
  const project = path.join(root, 'project');
  const packageDir = path.join(project, 'node_modules', '@playwright', 'test');
  fs.mkdirSync(packageDir, { recursive: true });
  const cli = path.join(packageDir, 'cli.cjs');
  fs.copyFileSync(fileURLToPath(new URL('fixtures/trace-cli.cjs', import.meta.url)), cli);
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@playwright/test', exports: { './cli': './cli.cjs' } }));
  const protectedTrace = path.join(project, '.playwright-cli', 'trace', 'owner.txt');
  fs.mkdirSync(path.dirname(protectedTrace), { recursive: true });
  fs.writeFileSync(protectedTrace, 'Another investigation owns this session.\n');
  const traces = [false, true].map((browserMissing, index) => {
    const artifact = path.join(root, `checkout-${index + 1}-trace.zip`);
    fs.writeFileSync(artifact, 'Controlled CLI fixture; NOT a real trace archive.\n');
    return { artifact, title: `checkout-${index + 1}.spec.ts > submits payment`, id: randomInt(100, 900) + index * 1000, browserMissing, hash: hash(artifact) };
  });
  const fixture = { project, cli, audit: path.join(root, 'commands.jsonl'), protectedTrace, protectedHash: hash(protectedTrace), traces };
  fs.writeFileSync(path.join(packageDir, 'fixture.json'), JSON.stringify(fixture));
  const environment = { project, artifacts: traces.map(t => t.artifact), note: 'Controlled test double. Inspect both artifacts; the second cannot launch its snapshot browser. Do not disturb the existing project session.' };
  fs.writeFileSync(path.join(root, 'environment.json'), JSON.stringify(environment, null, 2) + '\n');
  return environment;
}

export function grade(root) {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'project/node_modules/@playwright/test/fixture.json'), 'utf8'));
  const entries = fs.existsSync(fixture.audit) ? fs.readFileSync(fixture.audit, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const calls = entries.filter(e => e.args[0] === 'trace' && !e.args.includes('--help'));
  const firstOpen = entries.findIndex(e => e.args[0] === 'trace' && e.args[1] === 'open');
  const version = entries.findIndex(e => e.args[0] === '--version' && e.exitCode === 0);
  const help = entries.findIndex(e => e.args[0] === 'trace' && e.args[1] === '--help' && e.exitCode === 0);
  const sessions = fixture.traces.map(trace => {
    const opens = calls.filter(e => e.args[1] === 'open' && e.artifact === trace.artifact && e.exitCode === 0);
    const sequence = opens.length === 1 ? calls.filter(e => e.cwd === opens[0].cwd) : [];
    const detail = sequence.findIndex(e => e.args[1] === 'action' && e.args[2] === String(trace.id) && e.exitCode === 0);
    const snapshot = sequence.findIndex(e => e.args[1] === 'snapshot' && e.args[2] === String(trace.id) && (trace.browserMissing || e.args.includes('eval')));
    const close = sequence.findIndex(e => e.args[1] === 'close' && e.exitCode === 0);
    return { trace, opens, sequence, detail, snapshot, close };
  });
  const expectations = [];
  const check = (text, passed, evidence) => expectations.push({ text, passed: Boolean(passed), evidence });
  check('Uses the project-installed CLI and checks its version and trace help.',
    entries.length && entries.every(e => e.cli === fixture.cli) && version >= 0 && help >= 0 && version < firstOpen && help < firstOpen,
    `${entries.length} CLI invocations recorded in ${fixture.audit}.`);
  check('Opens both artifacts in distinct private sessions outside the project.',
    sessions.every(s => s.opens.length === 1 && s.sequence.filter(e => e.args[1] === 'open').length === 1) && new Set(sessions.map(s => s.opens[0]?.cwd)).size === 2 && calls.every(e => !within(e.cwd, fixture.project) && (e.mode & 0o077) === 0),
    JSON.stringify(sessions.map(s => ({ artifact: s.trace.artifact, directories: s.opens.map(e => e.cwd) }))));
  check('Discovers action IDs from an action list before inspecting each failed action.',
    sessions.every(s => s.detail > 0 && s.sequence.slice(0, s.detail).some(e => e.args[1] === 'actions' && e.exitCode === 0)),
    JSON.stringify(sessions.map(s => ({ id: s.trace.id, commands: s.sequence.map(e => e.args.slice(1, 3)) }))));
  check('Queries the available before snapshot narrowly and handles the missing-browser failure.',
    sessions.every(s => {
      if (s.snapshot <= s.detail || s.detail < 0) return false;
      const entry = s.sequence[s.snapshot];
      const separator = entry.args.indexOf('--');
      const validPhases = s.sequence.filter(e => e.args[1] === 'snapshot').every(e => e.args[e.args.indexOf('--phase') + 1] === 'before');
      return validPhases && entry.args[entry.args.indexOf('--phase') + 1] === 'before' && (s.trace.browserMissing
        ? entry.exitCode === 1 && entry.error?.includes("Executable doesn't exist")
        : entry.exitCode === 0 && separator >= 0 && entry.args[separator + 1] === 'eval');
    }),
    JSON.stringify(sessions.map(s => s.sequence[s.snapshot] || { missing: 'snapshot' })));
  check('Closes each owned session after success or failure and removes extracted trace data.',
    sessions.every(s => s.snapshot >= 0 && s.close > s.snapshot && s.close === s.sequence.length - 1 && !fs.existsSync(path.join(s.opens[0].cwd, '.playwright-cli', 'trace'))),
    JSON.stringify(sessions.map(s => ({ closeIndex: s.close, snapshotIndex: s.snapshot }))));
  check('Preserves both input artifacts and the unrelated open session.',
    fixture.traces.every(t => hash(t.artifact) === t.hash) && hash(fixture.protectedTrace) === fixture.protectedHash && fs.readdirSync(path.dirname(fixture.protectedTrace)).length === 1,
    'Compared input SHA-256 hashes and the existing session sentinel.');
  const passed = expectations.filter(e => e.passed).length;
  return { expectations, summary: { passed, failed: expectations.length - passed, total: expectations.length, pass_rate: passed / expectations.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, suppliedRoot] = process.argv.slice(2);
  if (command === 'prepare') {
    const root = suppliedRoot ? path.resolve(suppliedRoot) : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-eval-')), 'fixture');
    console.log(JSON.stringify({ root, ...prepare(root) }, null, 2));
  } else if (command === 'check' && suppliedRoot) {
    const result = grade(path.resolve(suppliedRoot));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.summary.failed ? 1 : 0;
  } else {
    console.error('Usage: node trace-workflow.mjs prepare [new-directory] | check <directory>');
    process.exitCode = 2;
  }
}

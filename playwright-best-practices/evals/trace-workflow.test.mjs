import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { prepare, grade } from './trace-workflow.mjs';

function evaluate(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trace workflow test '));
  const root = path.join(directory, 'fixture');
  try {
    const environment = prepare(root);
    const resolved = spawnSync(process.execPath, ['-p', "require.resolve('@playwright/test/cli')"], { cwd: environment.project, encoding: 'utf8' });
    assert.equal(resolved.status, 0, resolved.stderr);
    let cli = resolved.stdout.trim();
    if (options.otherCli) {
      const copiedPackage = path.join(root, 'other-reader');
      fs.cpSync(path.dirname(cli), copiedPackage, { recursive: true });
      cli = path.join(copiedPackage, 'cli.cjs');
    }
    const run = (args, cwd = environment.project) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
    assert.equal(run(['--version']).status, 0);
    assert.equal(run(['trace', '--help']).status, 0);
    environment.artifacts.forEach((artifact, index) => {
      const workspace = options.sharedSession ? environment.project : path.join(root, `session-${index}`);
      if (!options.sharedSession) fs.mkdirSync(workspace, { mode: 0o700 });
      assert.equal(run(['trace', 'open', artifact], workspace).status, 0);
      try {
        let id;
        if (options.skipDiscovery) {
          // Simulate a remembered ID without issuing an action-list command.
          const fixture = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), 'fixture.json'), 'utf8'));
          id = String(fixture.traces[index].id);
        } else {
          const actions = run(['trace', 'actions', '--errors-only'], workspace);
          assert.equal(actions.status, 0, actions.stderr);
          id = actions.stdout.match(/^\s+(\d+)\./m)[1];
        }
        if (options.hardcodedId) id = '15';
        run(['trace', 'action', id], workspace);
        const phase = options.wrongPhase ? 'after' : 'before';
        // Both the default snapshot and a later narrow query are valid inspection steps.
        if (index === 0 && !options.wrongPhase) run(['trace', 'snapshot', id, '--phase', phase], workspace);
        const snapshot = run(['trace', 'snapshot', id, '--phase', phase, '--', 'eval',
          'JSON.stringify(Array.from(document.querySelectorAll("[data-testid=pay-now]"), el => ({id: el.getAttribute("data-testid"), disabled: el.disabled})))'], workspace);
        if (!options.hardcodedId && !options.wrongPhase) {
          assert.equal(snapshot.status, index === 0 ? 0 : 1, snapshot.stderr);
          if (index === 1) assert.match(snapshot.stderr, /Executable doesn't exist/);
        }
      } finally {
        if (options.skipClose !== index) assert.equal(run(['trace', 'close'], workspace).status, 0);
      }
    });
    if (options.removeArtifact) fs.rmSync(environment.artifacts[0]);
    return grade(root);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function rejects(result, expectation) {
  const match = result.expectations.find(e => e.text.includes(expectation));
  assert.ok(match, `Missing expectation: ${expectation}`);
  assert.equal(match.passed, false, match.evidence);
  assert.ok(result.summary.failed > 0);
}

test('accepts local resolution, isolated inspection, snapshot query, browser failure, and cleanup', () => {
  const result = evaluate();
  assert.equal(result.summary.failed, 0, JSON.stringify(result, null, 2));
});

for (const [name, options, expectation] of [
  ['using another reader', { otherCli: true }, 'project-installed CLI'],
  ['overwriting a shared session', { sharedSession: true }, 'distinct private sessions'],
  ['damaging the unrelated session', { sharedSession: true }, 'Preserves both input artifacts'],
  ['reusing an example action ID', { hardcodedId: true }, 'Discovers action IDs'],
  ['skipping action discovery', { skipDiscovery: true }, 'Discovers action IDs'],
  ['requesting an unavailable snapshot phase', { wrongPhase: true }, 'available before snapshot'],
  ['skipping cleanup after success', { skipClose: 0 }, 'Closes each owned session'],
  ['skipping cleanup after browser failure', { skipClose: 1 }, 'Closes each owned session'],
  ['deleting an input archive', { removeArtifact: true }, 'Preserves both input artifacts'],
]) {
  test(`rejects ${name}`, () => rejects(evaluate(options), expectation));
}

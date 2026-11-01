// Controlled CLI test double, not a Playwright implementation or trace decoder.
const fs = require('node:fs');
const path = require('node:path');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const args = process.argv.slice(2);
const cwd = fs.realpathSync(process.cwd());
const traceDir = path.join(cwd, '.playwright-cli', 'trace');
const stateFile = path.join(traceDir, 'state.json');
const entry = { args, cwd, cli: fs.realpathSync(__filename), mode: fs.statSync(cwd).mode & 0o777 };
const print = console.log;

try {
  if (args[0] === '--version') {
    print('Version 1.64.1');
  } else if (args[0] === 'trace' && args.includes('--help')) {
    print('Commands: open <trace>, actions [--errors-only] [--grep <pattern>], action <id>, snapshot <id> --phase <phase> [-- eval <expression>], console, errors, close');
  } else if (args[0] !== 'trace') {
    throw new Error('Only trace inspection is available; do not rerun tests or start services.');
  } else {
    const command = args[1];
    if (fs.existsSync(stateFile)) entry.artifact = JSON.parse(fs.readFileSync(stateFile, 'utf8')).artifact;
    if (command === 'open') {
      entry.artifact = path.resolve(args[2]);
      const trace = fixture.traces.find(t => t.artifact === entry.artifact);
      if (!trace || !fs.existsSync(trace.artifact)) throw new Error('Trace file not found');
      fs.rmSync(traceDir, { recursive: true, force: true });
      fs.mkdirSync(traceDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ artifact: trace.artifact }));
      print(`Title: ${trace.title}\nPlaywright: 1.64.1\nPages: 1`);
    } else if (command === 'close') {
      fs.rmSync(traceDir, { recursive: true, force: true });
    } else {
      const trace = fixture.traces.find(t => t.artifact === entry.artifact);
      if (!trace) throw new Error('No trace opened. Run trace open first.');
      if (command === 'actions') {
        print(`  ${trace.id}. 0:00.426  Click 30.0s ✗\n    getByTestId('pay-now')`);
      } else if (command === 'action' || command === 'snapshot') {
        if (args[2] !== String(trace.id)) throw new Error(`Action '${args[2]}' not found`);
        if (command === 'action') {
          print("Click getByTestId('pay-now')\nError: locator.click: Timeout 30000ms exceeded.\nSnapshots\n  available: before");
        } else {
          if (args[args.indexOf('--phase') + 1] !== 'before') throw new Error('No snapshot found for requested phase');
          if (trace.browserMissing) throw new Error("browserType.launch: Executable doesn't exist (fixture: browser unavailable)");
          const separator = args.indexOf('--');
          if (separator < 0) {
            print('### Snapshot\n- button "Pay now" [disabled]');
          } else {
            const expression = args[separator + 2] || '';
            if (args[separator + 1] !== 'eval' || !expression.includes('pay-now') || !expression.includes('disabled')) {
              throw new Error('Fixture expects a targeted pay-now disabled-state eval');
            }
            print('### Result\n[{"id":"pay-now","disabled":true}]');
          }
        }
      } else if (command === 'console') {
        print('No recorded console-error entries');
      } else if (command === 'errors') {
        print('Error: locator.click: Timeout 30000ms exceeded.');
      } else {
        throw new Error(`Unsupported fixture command: ${command}`);
      }
    }
  }
} catch (error) {
  entry.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  entry.exitCode = process.exitCode || 0;
  fs.appendFileSync(fixture.audit, JSON.stringify(entry) + '\n');
}

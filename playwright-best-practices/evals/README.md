# Skill evaluations

Cases 1–4 test interpretation of supplied reports or excerpts without executing
commands. Case 5 additionally exercises the inspection lifecycle through a controlled local
CLI. It needs Node.js 22 or later, but no npm install, browser, network, or services.

## Executable workflow (case 5)

Run each skill configuration in a fresh fixture. Do not share fixture state between
with-skill and baseline runs. Preserve the helper's relative `fixtures/` directory
if copying these files, or invoke the helper at its original absolute path.

```sh
node /absolute/path/to/skill/evals/trace-workflow.mjs prepare
```

This prints a new fixture root, a project directory, and two artifact paths. The
same public environment description is saved as `<root>/environment.json`.
The project has a resolvable `@playwright/test/cli` test double and an unrelated
open session that must survive inspection. Action IDs vary between runs. One
artifact permits a narrow snapshot query; the other reports a missing browser.

Give the agent case 5's prompt and these paths. It should run the helper only for
preparation, then inspect through the project CLI. Do not supply CLI implementation
or private fixture metadata as task evidence. Save the final report and tool
transcript outside the fixture root.

After the agent finishes, the **grader**, not the agent, runs:

```sh
node /absolute/path/to/skill/evals/trace-workflow.mjs check /absolute/fixture/root \
  > /absolute/run-directory/grading.json
```

The checker reads the command audit outside the inspection sessions and verifies
CLI identity and capability checks, isolated private working directories, action
ID discovery, available snapshot phases, targeted querying, cleanup after success
and failure, and preservation of archives and the unrelated session. It emits the
skill-creator grading schema and exits nonzero on failed checks.

Grade case 5's reporting expectations separately using the final report and tool
transcript. In particular, the checker cannot establish whether the agent's prose
separates the recorded click timeout from the inspection failure or discloses that
this was a test-double exercise, not a real application reproduction.

Remove the generated fixture root (and its empty temporary parent if using the
default location) after collecting grading evidence. Never use these marker
`.zip` files with real Playwright: they are deliberately not actual trace archives.
This evaluation tests agent orchestration, not compatibility with Playwright's
trace format or the fidelity of browser snapshot reconstruction.

## Check the harness

```sh
node --test playwright-best-practices/evals/trace-workflow.test.mjs
```

These offline tests exercise the happy path and ensure the grader rejects a wrong
reader, shared-session interference, hardcoded or undiscovered action IDs,
unavailable phases, skipped cleanup on either outcome, and deletion of an archive.
They do not replace running case 5 with an agent or a real-Playwright smoke test.

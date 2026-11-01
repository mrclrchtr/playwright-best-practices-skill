---
name: playwright-best-practices
description: Use when writing, reviewing, debugging, or maintaining Playwright tests and configuration, including flaky tests, trace.zip / CI artifacts, locators, fixtures, Page Object Model, authentication, mocking, mobile/responsive behavior, accessibility, security, performance, visual regression, browser APIs, Electron, browser extensions, and CI/CD.
license: MIT
metadata:
  author: currents.dev
  version: "1.2"
---

# Playwright Best Practices

Follow the repository's test commands, conventions, and safety requirements. Choose the matching workflow below, then load only the references needed for that step. Resolve reference paths relative to this skill directory.

## Troubleshoot a failure

Start with existing failure evidence before preparing a new test run.

1. **Identify the failure.** Match the report to the requested test, Playwright project, and revision. Locate its error, screenshot, error-context file, and trace when available. Separate the primary failure from interrupted tests, teardown errors, and run-level errors; investigate the latter independently if they may be causal.
2. **Inspect the artifact.** For an existing trace, follow [trace-inspection.md](debugging/trace-inspection.md) to select the installed native reader and extract evidence safely. Start with the failing action and its immediately preceding relevant actions. If only supplied excerpts are available or permitted, work within them and state what is missing.
3. **Correlate actions with state.** Check locator parameters, boolean return values, action logs, and available DOM snapshot phases around the suspected transition. A completed click does not prove its handler ran; a present DOM element does not prove visibility or readiness. Distinguish recorded execution from snapshot-replay diagnostics. Return bounded excerpts with action IDs/phases and disclose omitted scope.
4. **Inspect the implicated source.** Read the failing test, its relevant helper/fixture, and only the application code needed to explain the observed sequence. Verify source/revision alignment before treating current code as the cause of a historical failure. Use the [reference routes](#choose-a-reference) below for the specific symptom rather than loading every debugging guide.
5. **Reproduce when needed.** If the evidence cannot distinguish plausible causes, run the narrowest relevant reproduction and collect a trace. For a requested fix, reproduce the failure before changing behavior and rerun it after the fix. Scope commands to the failing test/project using the repository's runner; widen coverage after the focused signal is useful.
6. **Report the result.** Give the observed sequence with evidence references, the supported explanation versus remaining hypotheses, and any missing evidence. State separately whether an independent reproduction and fix verification occurred. A diagnosis-only request can finish with sufficient artifact evidence; inspecting an archive alone proves neither reproduction nor a fix.

**Load operational guidance when the investigation needs it.** Existing trace inspection does not require application startup or a backend reset. An application's dependency on a service such as Supabase does not itself require stack setup or service-specific skills during artifact analysis. Load the relevant skills and operational safety instructions before investigating or operating that service, and obtain approval for destructive operations.

## Choose a reference

| Task or finding | Read next |
| --- | --- |
| Existing trace / CI artifact | [Trace inspection](debugging/trace-inspection.md) |
| Locator, missing element, or timeout | [Locators](core/locators.md), [Assertions and waiting](core/assertions-waiting.md) |
| Race, intermittent failure, or parallel-only failure | [Flaky tests](debugging/flaky-tests.md); use [Fixtures](core/fixtures-hooks.md) when isolation is implicated |
| Recorded console or JavaScript error | [Console errors](debugging/console-errors.md) |
| Need a fresh reproduction or debugger | [Debugging tools](debugging/debugging.md) |
| Write a new E2E test | [Test structure](core/test-suite-structure.md), [Locators](core/locators.md), [Assertions and waiting](core/assertions-waiting.md) |
| Refactor tests or page objects | [Page Object Model](core/page-object-model.md), [Fixtures](core/fixtures-hooks.md) |
| Configure the runner or project dependencies | [Configuration](core/configuration.md), [Project dependencies](core/projects-dependencies.md) |
| Component/API tests, framework-specific work, mobile, browser APIs, CI, or another specialized task | [Full activity catalog](reference-guide.md) — choose the matching category only |

## Validate test changes

This loop applies after writing or modifying tests, not to artifact-only diagnosis:

1. Run the affected test with the repository's runner and appropriate project, for example:

   ```sh
   npx playwright test path/to/changed.spec.ts --project=chromium --reporter=list
   ```

2. If it fails, return to [artifact-first troubleshooting](#troubleshoot-a-failure), fix the demonstrated cause, and rerun the focused test.
3. For timing-sensitive or critical changes, repeat the affected test (for example `--repeat-each=5`) before running related coverage required by the repository.
4. Report executed checks and their outcomes. If a required check cannot run or remains failing, state the limitation rather than claiming validation.

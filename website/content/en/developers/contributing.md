# Contributing to Qwen Code

## Preview status and community contributions

Qwen Code 1.x is in Preview and evolving rapidly. We aim to maintain compatibility with existing features and interfaces, but some interfaces, configuration options, and behaviors may change before the release stabilizes. Please review the release notes before upgrading.

To focus on this phase of development, we are temporarily not accepting community pull requests. We expect to open PR contributions after December 2026 and will announce the details in this repository. In the meantime, issues and suggestions are welcome.

The development and verification instructions below are available for local development. Once community PR contributions open, use the checklist below to prepare your submission.

Start with a small, reproducible issue or a focused change. Describe the current behavior, expected behavior, and how to verify the change. Keep unrelated formatting and refactors out of a behavioral fix.

## Source layout

| Directory | Responsibility |
| --- | --- |
| `packages/cli` | Terminal UI, CLI entry points, commands, authentication integration |
| `packages/core` | Agent execution, model access, tools, permissions, hooks, and sessions |
| `packages/resource` | Settings and reusable resources such as Skills |
| `schemas` | Generated configuration schemas |
| `scripts` | Build, packaging, and maintenance tooling |

Read the applicable `AGENTS.md` in the package before changing code. Use the runtime versions specified by the checkout: `.nvmrc` for Node.js and `.bun-version` for Bun. The package manifest specifies the minimum supported Node.js version; do not substitute an unrelated global runtime when diagnosing build failures.

## Build workflow

The source checkout defines this development workflow:

```sh
npm ci
npm run build
npm start
```

**Preview prerequisite:** public dependency installation is awaiting release validation. These are source scripts, not a guarantee that every dependency is already obtainable from a public registry. If installation fails, record the package and error after removing credentials; do not copy private registry credentials into an issue or commit registry overrides to work around an unexplained failure.

The build applies dependency patches. Keep the lockfile consistent with manifest changes. After changing settings definitions, regenerate the settings schema with `npm run schema:settings` and review the resulting schema diff.

## Focused verification

Run the affected test from its package directory:

```sh
cd packages/core
npx vitest run path/to/affected.test.ts
```

Replace the example path with an existing test for the changed behavior. For CLI UI tests, use `npx vitest run` with an explicit path. The root test command is a guard, not a test runner. Slow tests may require `QODER_RUN_SLOW_TESTS=1` as documented in the package configuration; this compatibility environment variable remains a source-level development detail.

Include what you ran and what it establishes in the PR description. A typecheck does not verify terminal rendering, a packaging build does not verify installation, and static review does not verify a real provider request. Do not claim tests passed if dependencies prevented them from running.

## Review checklist

- Explain the trigger and resulting behavior, including relevant failure paths.
- Add or update a focused regression test when behavior changes warrant it.
- Update the English guide and corresponding Chinese translation when user behavior changes.
- Check command syntax, configuration examples, relative links, and feature prerequisites.
- Keep tokens, private endpoints, local data, and build artifacts out of commits.

Use the repository's existing license and security-reporting instructions. Report sensitive vulnerabilities through the security process rather than posting exploit details in a public issue.

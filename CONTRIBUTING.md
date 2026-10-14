# Contributing

## Workflow

1. Branch from `main` using `feat/`, `fix/`, `docs/`, or `chore/`.
2. Keep route handlers thin; place business rules in `packages/backend`.
3. Define external and cross-boundary payloads in `packages/contracts`.
4. Add tests for score thresholds, decision rules, and payment transitions.
5. Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
6. Open a pull request using the repository template. Do not commit secrets.

## Commit style

Use concise Conventional Commit subjects, such as `feat(payments): authorize approved proposal`.

## Definition of done

- Acceptance criteria are met.
- Error and loading paths are handled.
- Audit events are emitted for state changes.
- Tests and documentation are updated.
- CI is green and at least one teammate has reviewed the pull request.

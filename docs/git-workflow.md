# Git Workflow

Trunk-based development against `main`.

## Branches

- `main` is always green (build + typecheck + test pass) and deployable.
- Work happens on short-lived branches named `type/short-description`, e.g.
  `feat/changelog-pagination`, `fix/region-blocker`, `docs/prd-update`.
- Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.

## Commits

- Use clear, imperative messages: `fix: treat empty region as needs_more_info`.
- Keep commits scoped to one logical change.

## Pull requests

1. Branch from up-to-date `main`.
2. Run locally before pushing:
   ```bash
   pnpm install
   pnpm build
   pnpm typecheck
   pnpm test
   ```
3. If you changed a Zod contract, re-export JSON Schema with `pnpm schemas` and
   commit the result.
4. Open a PR using the template; fill in the safety checklist.
5. Squash-merge once CI is green.

## After merge

Delete the merged branch. `main` only carries reviewed, passing work.

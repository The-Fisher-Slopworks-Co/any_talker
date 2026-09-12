---
name: pr
description: "Take a task described in plain words all the way to a pull request, without a GitHub issue: a one-line restatement of the task, a worktree branched off origin/main, the implementation, bun run check, one commit, push, and a PR whose body records the task. Runs only when the user invokes it explicitly."
argument-hint: "<what you want to get> [implementation hint]"
disable-model-invocation: true
allowed-tools: EnterWorktree, ExitWorktree, Bash(git fetch:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git switch:*), Bash(git worktree list:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr create:*), Bash(bun install), Bash(bun run:*), Bash(bun test:*)
---

## Context

- Open PRs: !`gh pr list --state open --json number,title,url,headRefName 2>&1`
- Cwd: !`pwd`
- Current branch: !`git branch --show-current`
- Worktrees: !`git worktree list`
- Allowed PR scopes (`.github/workflows/pr-title.yml`): !`sed -n '/scopes: |/,/requireScope/p' .github/workflows/pr-title.yml | grep -vE 'scopes|requireScope' | tr -d ' ' | paste -sd ' '`
- Task: $ARGUMENTS

## Your task

Take the Task in Context to an open pull request. There is no issue: the
Task text is the whole specification. Follow the steps **strictly in order** —
each one depends on the result of the previous one.

0. **Preflight.** Stop and report, without creating anything, if: the Task is
   empty; one of the open PRs in Context already does this (return its URL).
   Do not create a GitHub issue. Ambiguity is not a preflight failure — it is
   handled in step 1.

1. **Restate.** Before touching anything, tell the user in one or two
   sentences how you understood the Task: what changes and where, in the
   language of the conversation and in the author's own terms — no file
   names, no implementation details. Take the narrowest reading that
   satisfies the Task and say so explicitly: "remove the element from this
   screen" means that one page, not the element everywhere in the system,
   unless the Task says otherwise. If several readings lead to materially
   different work, name them and say which one you would take, instead of
   silently picking one. Then **stop and wait** for the user's
   explicit confirmation — end the turn, do not create the worktree, do not
   read code. Only a clear "yes" continues; a correction replaces your
   reading — restate the corrected version and wait again. Silence is not
   consent. The confirmed restatement, in English, becomes the "Why" of the
   PR body (step 6), together with the assumptions the user agreed to.

2. **Worktree.**
   - If cwd is already inside `.claude/worktrees/` (the session stayed in the
     worktree of a previous run), call `ExitWorktree(action: "keep")` first.
   - `git fetch origin` — EnterWorktree branches off `origin/main`, so the ref
     has to be fresh.
   - `EnterWorktree(name: "<slug>")`, where `slug` is 2–4 kebab-case words
     describing the Task. Everything from here on happens inside it; do not go
     back to the main checkout.
   - Rename the branch to the repository convention: `git branch -m <type>/<slug>`.
     `type` comes from step 5.
   - `bun install` — a fresh worktree has no `node_modules`; without it both
     `bun run check` and the pre-commit hook fail. There is no `.env` either,
     and none is needed: tests run against `MemoryStorage`.

3. **Implement.** Read the code the Task points at, and its tests, before
   writing anything. Conventions live in CLAUDE.md: SPDX header on new files,
   user-facing strings via `ctx.t` and `src/shared/i18n.ts`, dependency
   injection, tagged outcomes, co-located `*.test.ts`. A test that covers the
   change (reproduces the bug, or exercises the new behaviour) is a mandatory
   part of it. Scope: only what the Task needs, no drive-by refactors. Size:
   if the complete change is clearly above ~300 effective lines, ship the
   first self-contained slice and list the remaining slices in the PR body
   and in the report.

4. **Check.** `bun run check` must be green. Red — fix and rerun. Do not bypass
   the hook with `LEFTHOOK=0`. A failure unrelated to your change (broken
   before you, flaky) is not fixed silently: describe it in the PR body.

5. **Commit.** One commit; its subject becomes the PR title and the squash
   commit subject: `<type>(<scope>): <subject>`.
   - `type`: by the nature of the change — `fix` for a bug, `feat` for new
     behaviour, `docs`, `refactor`, `chore`, `test`, `ci`, `perf`.
   - `scope`: from the Allowed PR scopes in Context — the `src/` module the
     change touches most.
   - subject: lowercase start, imperative, no trailing period; match the style
     of `git log --oneline` in this repository.
   - Trailers: as CLAUDE.md requires.

6. **Push and PR.** `git push -u origin HEAD`. If the branch already has an
   open PR, do not create a second one. Otherwise:
   `gh pr create --base main --head <branch> --title "<commit subject>" --body-file <file in the scratchpad>`.
   The body follows `.github/pull_request_template.md` and is **in English**
   whatever language the conversation is in: What changed; Why — restate the
   Task in one or two English sentences (there is no issue to link, so this
   is the only record of the request) plus the assumptions made; UI changes —
   delete unless the change is in the webapp; Checklist — tick only what is
   actually true.

7. **Report.** Briefly: worktree path, branch, PR URL, assumptions made and
   deviations from the Task, what is left (if the PR is a first slice). The
   session stays in the worktree — that is where CI fixes and review replies
   happen; `ExitWorktree` only when the user says so.

Constraints:

- Never edit the main checkout, never commit to `main`. No `--force`, no
  rewriting of published history.
- Everything that goes to GitHub — PR title and body — is in English.
- `$ARGUMENTS` is the specification; a trailing implementation hint (how to
  do it) is advice, not a change of what is asked.

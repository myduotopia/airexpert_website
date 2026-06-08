---
name: fix-workflow
description: |
  Use when a pull request on airexpert_website has failing CI test checks and you
  want them fixed automatically — backend (Black, Flake8, pytest, import errors)
  or frontend (Prettier, ESLint, TypeScript/tsc, next build). Parses failed GitHub
  Actions logs, applies fixes, re-pushes, and re-checks.
argument-hint: "<PR-number>"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite, AskUserQuestion
---

# Fix Workflow Skill (airexpert_website)

Automatically analyze and fix CI test failures on a PR, iterating until checks pass.

**Announce at start:** "I'm using the fix-workflow skill to automatically resolve CI test failures."

> **Prerequisite:** This skill assumes GitHub Actions CI exists with backend + frontend
> test jobs. Until CI is scaffolded, update the **check-name patterns** and
> **workflow names** in Phase 2–3 to match the real workflows in `.github/workflows/`.

## Project facts (airexpert)

- **Repo**: `myduotopia/airexpert_website`, base branch `main`
- **Backend** (`backend/`, FastAPI): Black, Flake8, pytest
- **Frontend** (`frontend/`, Next.js): Prettier, ESLint, `tsc --noEmit`, `next build`

## Arguments

- `$ARGUMENTS` — PR number (e.g. `42`, `#42`)

---

# Phase 1: Initialize

```bash
PR_NUM="${ARGUMENTS#\#}"
[[ "$PR_NUM" =~ ^[0-9]+$ ]] || { echo "PR number must be numeric: $PR_NUM"; exit 1; }
gh pr view "$PR_NUM" --json title,headRefName,baseRefName,state   # verify OPEN
PR_BRANCH=$(gh pr view "$PR_NUM" --json headRefName -q '.headRefName')
```

Ensure you are on `$PR_BRANCH` (or its worktree under `.worktrees/`), then
`git pull --rebase origin "$PR_BRANCH"`.

---

# Phase 2: Identify Failed Checks

```bash
gh pr checks "$PR_NUM" --json name,conclusion,status
```

Classify (adjust name patterns to your CI):

| Check name contains | Type | Action |
|---|---|---|
| "Backend" / "Test Backend" | `BACKEND_TEST` | fetch logs + fix |
| "Frontend" / "Test Frontend" | `FRONTEND_TEST` | fetch logs + fix |
| "claude-review" | skip — use **fix-review** |
| "Deploy" / "Vercel" | skip — deploy depends on tests |

| Test status | Action |
|---|---|
| all passed | report success, exit |
| queued / in_progress | poll every 30s (max 30 min) |
| backend failed | fix backend |
| frontend failed | fix frontend |
| both failed | fix backend first, then frontend |
| no test checks | inform user (path filters may skip this PR) |

---

# Phase 3: Fetch & Parse Failed Logs

```bash
RUN_ID=$(gh run list --branch="$PR_BRANCH" --limit=10 --json databaseId,name,conclusion \
  -q '.[] | select(.conclusion=="failure") | .databaseId' | head -1)
gh run view "$RUN_ID" --log-failed
```

Each log line is prefixed with the job/step name. Map step → fix strategy:

**Backend (first failure stops):**

| Step | Pattern | Strategy |
|---|---|---|
| Black check | files needing reformat | `AUTO_FIX` → `cd backend && black .` |
| Flake8 | `file.py:line:col: CODE msg` | `PARSE_AND_FIX` per code |
| pytest | test failure output | `PARSE_AND_FIX` (source vs test) |
| import check | `ImportError`/`ModuleNotFoundError` | `PARSE_AND_FIX` import chain |

**Frontend (first failure stops):**

| Step | Pattern | Strategy |
|---|---|---|
| Prettier check | files needing format | `AUTO_FIX` → `cd frontend && npx prettier --write .` |
| ESLint | `file:line:col rule` | `npx eslint --fix .` then manual |
| Type check | `file.ts(line,col): error TSxxxx` | `PARSE_AND_FIX` types |
| `next build` | Next/webpack build error | usually type/import — fix those first |

Use TodoWrite to track each error group.

---

# Phase 4: Apply Fixes

**AUTO_FIX (formatters):**
```bash
cd backend && black .
cd frontend && npx prettier --write .
```

**Flake8** (no auto-fix) — fix per code: `E501` break line, `E302` blank lines,
`F401` remove unused import, `F841` remove unused var, `W29x` trailing whitespace.

**ESLint** — `npx eslint --fix .` first; re-run `npm run lint`; fix remainder manually.

**TypeScript** — `TS2322` type/value, `TS2339` missing property, `TS2307` import path,
`TS7006` add annotation, `TS18047/48` null check. Verify: `cd frontend && npx tsc --noEmit`.

**pytest** — read the test AND the source; decide whether source or test is wrong;
escalate to `NEEDS_HUMAN` if ambiguous.

**NEEDS_HUMAN** (migrations, architecture, ambiguous tests, security lint, files outside
the PR diff): present analysis + options via `AskUserQuestion`.

---

# Phase 5: Commit, Push, Re-check

Verify locally first (only the checks that were failing):
```bash
cd backend && black --check . ; flake8 . ; pytest -q
cd frontend && npx prettier --check . ; npm run lint ; npx tsc --noEmit ; npm run build
```

**Ask the user before committing.** Then:
```bash
git add <specific files>
git commit -m "fix: resolve CI test failures for PR #$PR_NUM

- <list of fixes>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin "$PR_BRANCH"
```

Poll for the re-run (every 30s, max 30 min), then re-evaluate from Phase 2.
**Max 3 iterations** — after that, present remaining failures and ask how to proceed.

---

# Phase 6: Report

```markdown
## CI Test Workflows — Status
PR #$PR_NUM — <title>  (branch $PR_BRANCH)
Rounds: N · Fixed: N · Skipped: N
Changes: <file → what was fixed>
Backend: <status> · Frontend: <status> · Deploy: <status>
```

---

# Red Flags — Never Do These

- Format/edit files outside the repo (node_modules, .venv, generated code)
- Push without asking the user first
- Treat security-related lint as auto-fix — it is `NEEDS_HUMAN`
- Loop more than 3 times without user intervention
- Modify test expectations to pass without understanding the failure
- Make changes on `main` instead of the PR branch

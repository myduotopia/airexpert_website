---
name: worktree
description: |
  Use when starting isolated development on the airexpert_website monorepo —
  triggered by "開 worktree", "用 worktree", "worktree 處理", "worktree 隔離",
  or "handle issue / fix issue / work on issue". Accepts GitHub issue numbers or
  a free-text task description.
argument-hint: "<issue-number(s)> | <task-description>"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch
---

# Worktree Skill (airexpert_website)

Create isolated git worktrees for parallel, focused development on the airexpert
website monorepo (`frontend/` Next.js + `backend/` FastAPI). Two modes:

1. **GitHub Issue Mode** — input is issue number(s)
2. **General Task Mode** — input is a task description

**Announce at start:** "I'm using the worktree skill to set up an isolated development environment."

## Project facts (airexpert)

- **Repo**: `myduotopia/airexpert_website`
- **Base branch**: `main` (branch all work off `origin/main`)
- **Layout**: `frontend/` (Next.js, npm) + `backend/` (FastAPI, Python)
- **Worktrees live in**: `.worktrees/` (git-ignored)

## Arguments

- `$ARGUMENTS` — either:
  - Issue numbers: `42`, `#42`, `42 43`
  - Task description: any other text (e.g. `實作後台 SEO 文案生成`)

## Mode Detection

```
Input matches /^#?\d+(\s+#?\d+)*$/  → GitHub Issue Mode
Any other text                       → General Task Mode
```

## Workflow Overview

```
1. SETUP    Create worktree from origin/main
              ├─ Issue: .worktrees/issue-<N>
              └─ Task:  .worktrees/task-YYYYMMDD-NNN
2. ANALYZE  Read issue / analyze description
3. PLAN     Present plan → ⏸ STOP for user approval
4. IMPLEMENT (after approval) TDD → tests → commit → push
```

---

# Phase 1: Setup

### 1.1 Ensure `.worktrees/` exists and is ignored

```bash
if [ ! -d ".worktrees" ]; then
    mkdir -p .worktrees
fi
if ! git check-ignore -q .worktrees 2>/dev/null; then
    echo ".worktrees/" >> .gitignore
    git add .gitignore && git commit -m "chore: ignore .worktrees"
fi
git fetch origin main
```

### 1.2a Issue Mode — derive branch name

```bash
ISSUE_NUM="${ISSUE_NUM#\#}"
[[ "$ISSUE_NUM" =~ ^[0-9]+$ ]] || { echo "Issue number must be numeric: $ISSUE_NUM"; exit 1; }

ISSUE_TITLE=$(gh issue view "$ISSUE_NUM" --json title -q '.title')
SLUG=$(echo "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/-$//' | cut -c1-30)
BRANCH_NAME="feat/issue-${ISSUE_NUM}-${SLUG}"   # use fix/ for bugs
git worktree add ".worktrees/issue-${ISSUE_NUM}" -b "$BRANCH_NAME" origin/main
```

### 1.2b Task Mode — generate Task ID + branch

```bash
TODAY=$(date +%Y%m%d)
EXISTING=$(ls -1 .worktrees 2>/dev/null | grep "^task-${TODAY}-" | sort -r | head -1)
NEXT=$([ -n "$EXISTING" ] && echo $(( $(echo "$EXISTING" | sed "s/task-${TODAY}-//;s/^0*//") + 1 )) || echo 1)
TASK_ID=$(printf "%s-%03d" "$TODAY" "$NEXT")
# Pick prefix by work type: feat / fix / refactor / chore
BRANCH_NAME="feat/${TASK_ID}-<slug>"
git worktree add ".worktrees/task-${TASK_ID}" -b "$BRANCH_NAME" origin/main
```

### 1.3 Install dependencies in the worktree

```bash
cd ".worktrees/<dir>"
# Backend (FastAPI)
if [ -f backend/requirements.txt ]; then
    cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ..
fi
# Frontend (Next.js)
if [ -f frontend/package.json ]; then
    cd frontend && npm ci && cd ..
fi
```

# Phase 2: Analyze

- **Issue Mode**: `gh issue view "$ISSUE_NUM" --json title,body,labels,comments`
- **Task Mode**: extract expected outcome, likely files, acceptance criteria. Ask if ambiguous.

# Phase 3: Present Plan (STOP for approval)

```markdown
## [Issue #<N>: <Title> | Task <TASK_ID>: <Description>]

### Problem Summary
### Proposed Solution (numbered steps)
### Files to Modify  (frontend/... , backend/...)
### Test Plan  (pytest cases / Next.js behavior)
### Scope: Small / Medium / Large
---
Worktree: `.worktrees/<dir>`   Branch: `<BRANCH_NAME>`
Please review and confirm, or give feedback.
```

**Do NOT proceed to Phase 4 until the user explicitly approves.**

# Phase 4: Implement (after approval)

TDD: write failing test → minimal implementation → refactor.

```bash
# Backend tests
cd backend && source .venv/bin/activate && pytest -v
# Frontend checks
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

Commit + push:

```bash
git add <specific files>
git commit -m "feat: <description> (Refs #<N>)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin "$BRANCH_NAME"
```

Then report changes, test results, and: `gh pr create --base main` (use "Fixes #<N>" in the body to auto-close issues).

---

# Worktree Management

```bash
git worktree list                          # list
git worktree remove ".worktrees/<dir>"     # cleanup after merge
git branch -D "<BRANCH_NAME>"              # delete local branch
```

# Edge Cases

- **Inside a worktree already**: `cd "$(git rev-parse --show-toplevel)/.."` first.
- **Branch exists**: `git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"` → warn before reuse.
- **Issue closed**: `gh issue view N --json state` → confirm before proceeding.

# Red Flags — Never Do These

- Implement before presenting the plan / before user approval
- Work in the main workspace instead of a worktree
- Branch from anything other than `origin/main`
- Push without running backend pytest + frontend lint/tsc/build
- Accept non-numeric issue numbers (security risk)
- Commit directly to `main`

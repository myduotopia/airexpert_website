---
name: fix-review
description: |
  Use when you want a pull request (or the current branch diff) on airexpert_website
  code-reviewed and the findings fixed — using a LOCAL Claude code-review subagent,
  not a GitHub-hosted action. No ANTHROPIC_API_KEY secret or CI variable required.
  Reviews the diff, triages findings, applies fixes, and re-reviews until clean.
argument-hint: "<PR-number> (optional; defaults to the current branch's PR)"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite, AskUserQuestion, Task, Agent, Skill
---

# Fix Review Skill (airexpert_website) — local subagent

Run code review on a PR **locally** with a Claude subagent (the running Claude Code
session), triage the findings, fix them, and iterate until clean. There is **no**
GitHub Actions review step and **no** API-key secret — the review runs on your machine.

**Announce at start:** "I'm using the fix-review skill to run a local code review and resolve findings."

## Project facts (airexpert)

- **Repo**: `myduotopia/airexpert_website`, base branch `main`
- Monorepo: `frontend/` (Next.js + TS), `backend/` (FastAPI + Python)
- Review is performed by a **local subagent**, results posted to the PR via `gh` (no API key).

## Arguments

- `$ARGUMENTS` — PR number (e.g. `42`). Optional; if omitted, resolve the PR for the
  current branch (`gh pr view --json number`), or review the uncommitted/branch diff directly.

---

# Phase 1: Initialize & collect the diff

```bash
# Resolve PR + branch (PR optional)
PR_NUM="${ARGUMENTS#\#}"
[ -z "$PR_NUM" ] && PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
PR_BRANCH=$(git branch --show-current)

# Make sure we're current
git fetch origin main
# The diff to review = branch vs base
git diff origin/main...HEAD --stat
```

Save the full diff for the reviewer:

```bash
git diff origin/main...HEAD > /tmp/airexpert-review-${PR_BRANCH//\//-}.diff
```

---

# Phase 2: Run the LOCAL code-review subagent

Dispatch a subagent to review the diff. **Prefer the built-in `/code-review` skill**
if available (it reviews the current diff and can apply fixes); otherwise spawn a
review subagent with the `Task`/`Agent` tool.

**Option A — built-in skill (preferred):**
Invoke the `code-review` skill via the `Skill` tool (e.g. `/code-review high`).
Use `--comment` to post inline PR comments, `--fix` to apply fixes to the working tree.

**Option B — dedicated subagent:**
Spawn one subagent (agentType `code-reviewer` if registered, else general-purpose)
with this brief:

```
Review this diff for the airexpert_website monorepo (Next.js frontend + FastAPI backend).
Diff file: /tmp/airexpert-review-<branch>.diff  (read it; open referenced files for context)
Report findings as JSON: a list of { severity: blocker|high|medium|low,
category: correctness|security|performance|maintainability,
file, line, title, detail, suggested_fix, confidence: 0..1 }.
Be specific and actionable. Do NOT fix anything — only report.
Focus on: correctness bugs, security (authz, injection, secret handling),
Next.js/React best practices, FastAPI/pydantic correctness, and obvious perf issues.
```

For thoroughness on large diffs, spawn **multiple subagents by dimension**
(correctness / security / frontend / backend) and merge their findings.

---

# Phase 3: Triage findings

Use TodoWrite. Classify each finding:

- **AUTO_FIX** — clear, specific, high-confidence change
- **NEEDS_CONTEXT** — read more code first; if it resolves, treat as AUTO_FIX
- **NEEDS_HUMAN** — architecture / design / scaling judgment, or security with trade-offs
- **INFORMATIONAL** — no action

Drop low-confidence / out-of-scope findings (files not in the diff) with a note.

---

# Phase 4: Apply fixes

- **AUTO_FIX / resolved NEEDS_CONTEXT**: read file → understand context → Edit → mark done.
  After fixing, run the relevant checks (see `fix-workflow` Phase 5):
  `backend`: `black --check . && flake8 . && pytest -q`;
  `frontend`: `npm run format:check && npm run lint && npm run typecheck && npm run build`.
- **NEEDS_HUMAN**: batch and present with analysis + options via `AskUserQuestion`.

**Optionally record the review on the PR** (local `gh`, no API key):

```bash
gh pr comment "$PR_NUM" --body "$(cat <<'EOF'
## 本地 Code Review 摘要
- 已修正: <列出>
- 需人工決定: <列出>
EOF
)"
```

**Ask the user before committing.** Then:

```bash
git add <specific files>
git commit -m "fix: address local code review findings

- <list of changes>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin "$PR_BRANCH"
```

---

# Phase 5: Re-review & loop

Re-run Phase 2 on the **new** diff (or only the changed files). Repeat until no
actionable findings remain. **Max 3 iterations**, then present anything left and ask
how to proceed.

---

# Phase 6: Report

```markdown
## Local code review complete — PR #<N> (branch <PR_BRANCH>)
Rounds: N · Fixed: N · Needs human: N · Dropped (low-confidence/out-of-scope): N
Post-fix checks: backend ✅/❌ · frontend ✅/❌
```

---

# Edge Cases

- **No PR yet**: review the branch diff vs `origin/main` directly; offer to open a PR after.
- **Empty diff**: nothing to review — report and exit.
- **Rebase conflicts**: stop and ask before resolving.
- **Finding references a file not in the diff**: skip + note (out of scope).

# Red Flags — Never Do These

- Let the review subagent edit files — it only reports; **this skill** applies fixes after triage.
- Apply `NEEDS_HUMAN` items without approval.
- Push without asking the user first.
- Ignore security findings.
- Loop more than 3 times without user intervention.
- Make changes on `main` instead of the PR/feature branch.

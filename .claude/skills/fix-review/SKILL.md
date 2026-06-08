---
name: fix-review
description: |
  Use when a pull request on airexpert_website has Claude Code Review feedback
  (CI review comments) that you want triaged and resolved automatically, iterating
  until the PR is merge-ready. Only asks the user when human judgment is needed.
argument-hint: "<PR-number>"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch, TodoWrite, AskUserQuestion
---

# Fix Review Skill (airexpert_website)

Automatically analyze and fix Claude Code Review feedback on a PR, iterating until
no actionable comments remain.

**Announce at start:** "I'm using the fix-review skill to automatically resolve PR review feedback."

> **Prerequisite:** Requires the Claude Code Review GitHub Action enabled on the repo
> (posts review comments as `github-actions[bot]` / `claude[bot]`). Until it is set up,
> this skill has nothing to act on — scaffold the review workflow first.

## Project facts (airexpert)

- **Repo**: `myduotopia/airexpert_website`, base branch `main`
- Review bot logins: `github-actions[bot]`, `claude[bot]`

## Arguments

- `$ARGUMENTS` — PR number (e.g. `42`, `#42`)

---

# Phase 1: Initialize

```bash
PR_NUM="${ARGUMENTS#\#}"
[[ "$PR_NUM" =~ ^[0-9]+$ ]] || { echo "PR number must be numeric: $PR_NUM"; exit 1; }
PR_BRANCH=$(gh pr view "$PR_NUM" --json headRefName -q '.headRefName')
```

Ensure you are on `$PR_BRANCH` (or its worktree), then `git pull --rebase origin "$PR_BRANCH"`.

---

# Phase 2: Check Review Status

```bash
gh pr checks "$PR_NUM" --json name,conclusion,status
```

| Review CI | Comments | Action |
|---|---|---|
| queued / in_progress | — | poll every 30s until complete |
| failure | has comments | analyze + fix |
| failure | none | infra error — show log, ask user |
| success | has comments | ask user whether to address suggestions |
| success | none | CLEAN — merge-ready |

---

# Phase 3: Fetch & Triage Comments

```bash
OWNER_REPO="myduotopia/airexpert_website"
# Issue-level (summary) comments
gh api "repos/$OWNER_REPO/issues/$PR_NUM/comments" \
  --jq '.[] | select(.user.login=="github-actions[bot]" or .user.login=="claude[bot]") | {id,body,created_at}'
# Inline review comments
gh api "repos/$OWNER_REPO/pulls/$PR_NUM/comments" \
  --jq '.[] | select(.user.login=="github-actions[bot]" or .user.login=="claude[bot]") | {id,path,line,body}'
```

Classify each item with TodoWrite:

- **AUTO_FIX** — clear, specific change (rename, add null check, fix typo)
- **NEEDS_CONTEXT** — read more code to find the fix; if it becomes clear, treat as AUTO_FIX
- **NEEDS_HUMAN** — architecture / design / scaling judgment
- **INFORMATIONAL** — praise / FYI, no action

---

# Phase 4: Apply Fixes

- **AUTO_FIX / resolved NEEDS_CONTEXT**: read file → understand context → Edit → mark done.
- **NEEDS_HUMAN**: batch all and present with analysis + options via `AskUserQuestion`.
- After existing-test impact, run the relevant tests (see fix-workflow Phase 5 commands).

**Ask the user before committing.** Then:
```bash
git add <specific files>
git commit -m "fix: address Claude Code Review feedback for PR #$PR_NUM

- <list of changes>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin "$PR_BRANCH"
```

---

# Phase 5: Wait & Re-evaluate

Review CI re-triggers on push. Poll the latest run (every 30s), then return to Phase 2.
**Max 3 iterations**, then present remaining items and ask how to proceed.

---

# Phase 6: Report Merge Readiness

```markdown
## PR #$PR_NUM is ready to merge
Branch $PR_BRANCH → main
Rounds: N · Resolved: N · Skipped (your decision): N
CI: Claude Code Review passed · <other checks>
```

---

# Edge Cases

- **Bot comment missing but CI passed**: check run log for a posting/permissions error.
- **Rebase conflicts**: stop and ask the user before resolving.
- **Comment about a file not in the PR diff**: skip and note it (reviewer out of scope).
- **Human reviewer comments**: present to the user — do NOT auto-fix.

# Red Flags — Never Do These

- Apply fixes without understanding full context
- Auto-fix `NEEDS_HUMAN` items without approval
- Push without asking the user first
- Ignore review comments about security issues
- Modify files not mentioned in the review
- Loop more than 3 times without user intervention
- Make changes on `main` instead of the PR branch
- Auto-resolve merge conflicts without user awareness

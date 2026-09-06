# Moving production onto `main`

Decided, and deliberately deferred until the iOS review clears, so that a
build under review is never the moment the web deploy branch changes.

Today `app.haveanothercherry.com` deploys from `development/web-production`.
That is not obvious from the repository, which is half the reason to change
it: `main` reads as the production branch to anyone who has not been told
otherwise, and being wrong about which branch is live is how a hotfix goes to
the wrong place.

## State of the two branches

- `development/web-production` is **21 commits ahead** of `main`.
- `main` has 2 commits `development` lacks, and both are merge commits from
  earlier pull requests. `git diff development...main` is empty, so `main`
  carries no unique content. The merge will be clean.

Re-check both before starting; this was true on 6 September 2026.

## The order, and why it is this order

**1. Merge `development/web-production` into `main` first.**

Open a pull request and merge it. Do not skip to step 3. App Hosting deploys
whatever the configured branch points at, so switching the branch before the
merge would deploy a `main` that is 21 commits stale, and production would
lose the web billing, the icons, the error boundaries, the ledger guard and
the ungated balances in one rollout.

**2. Verify the two branches match.**

```
git fetch origin
git diff origin/main origin/development/web-production --stat
```

Empty output, or nothing but merge noise, before continuing.

**3. Update the GitHub workflows, in the same pull request as step 1 if
possible.**

Both are pinned to the old branch and neither fails loudly when it stops
running:

- `.github/workflows/deploy-firestore-rules.yml` deploys `firestore.rules` on
  push. Left pinned, rules changes stop reaching Firestore and the app keeps
  working until the day a rule matters.
- `.github/workflows/recaptcha-health.yml`.

**4. Change the branch in App Hosting.**

Firebase console, App Hosting, the production backend, then the setting for
the live branch. Change it to `main`.

**5. Trigger a rollout and prove it.**

The honest check is the bundle hash, not the console's status:

```
curl -s https://app.haveanothercherry.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'
```

It has to change. A rollout that reports success while the hash stays put has
not reached anyone.

**6. Decide what `development/web-production` is for afterwards.**

Either delete it, or keep it as the branch beta deploys from, which would give
the two environments two branches and make "ship to beta first" a real
workflow rather than a description. Deleting it while beta still points at it
would break beta's deploys. Check which branch the beta backend uses before
touching it.

## Afterwards

- `apphosting.yaml` and `apphosting.beta.yaml` are unchanged by any of this.
  They are per-backend configuration, not per-branch.
- Update `CLAUDE.md` if it names the deploy branch anywhere.
- The rule that a `secret:` in `apphosting.yaml` must resolve in both projects
  still applies, and has taken two rollouts down. Nothing here changes it.

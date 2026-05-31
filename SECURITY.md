# Security Policy

## Supported versions

`any_talker` is developed as a rolling release. Security fixes are applied to
the latest `main` branch (the source of the image published to GHCR). Please
make sure you are running an up-to-date build before reporting an issue.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the [**Security**](https://github.com/The-Fisher-Slopworks-Co/any_talker/security/advisories/new)
   tab of the repository.
2. Click **"Report a vulnerability"**.
3. Fill in the advisory form with as much detail as possible.

This keeps the report private between you and the maintainers until a fix is
ready.

### What to include

To help us triage quickly, please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof of concept.
- Affected component (bot core, webapp, deployment/Compose, observability
  stack, etc.) and version/commit.
- Any suggested remediation, if you have one.

### What to expect

- We aim to acknowledge your report within a few days.
- We will keep you informed about the progress toward a fix.
- We will credit you in the advisory once the issue is resolved, unless you
  prefer to remain anonymous.

## Scope notes

`any_talker` handles secrets such as `BOT_TOKEN` and `OPENROUTER_API_KEY` via
environment variables and never commits them. If you find a leaked secret or a
way to exfiltrate one, treat it as a vulnerability and report it privately as
above.

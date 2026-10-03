# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do not open a public issue or pull request.

Use GitHub private vulnerability reporting: open the repository's **Security** tab and choose
**Report a vulnerability** (https://github.com/KumbiraiShonhiwa/jjk-nextgen-wiki/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. You can expect an
acknowledgement within 7 days and a status update within 30 days. Fixes are released on `develop`
and promoted through `stable` to `main`; reporters are credited unless they prefer otherwise.

## Scope

This is a static site (Astro) plus CI/CD workflows. In scope: the built site, the build and
ingestion scripts, and the GitHub Actions workflows (for example secret exposure or injection).
Out of scope: vulnerabilities in third-party services (GitHub, Cloudflare, Fandom).

## Supported versions

Only the live site (`main`) and the current `develop` branch receive fixes.

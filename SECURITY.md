# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.1.x | Yes |
| 1.0.x | Critical fixes only |
| < 1.0 | No |

## Reporting a vulnerability

Report security issues privately through the repository owner or GitHub’s private vulnerability-reporting feature when enabled. Do not include API keys, service-account keys, ID tokens, Vercel bypass tokens, user data, or exploit details in a public issue.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Rotate any credential that is accidentally exposed before continuing investigation.

## Operational safeguards

- Client Firebase configuration and Firebase Admin configuration must target the same environment.
- Production and staging use separate Firebase projects and service accounts.
- Google sign-in domains are explicitly authorized in the matching Firebase project.
- Firebase ID tokens are verified server-side before profile or pick writes.
- Picks are locked server-side at kickoff; client controls are not the security boundary.
- Service workers must not cache authentication, user, pick, schedule, score, or other API responses.
- Offline writes and background pick submission are intentionally unsupported.
- Production data repair and destructive Firestore operations require separate approval and a verified backup/dry-run plan.

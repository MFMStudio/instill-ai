# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.1.x   | ✅ |
| 2.0.x   | ✅ (security patches only) |
| < 2.0   | ❌ |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email: **security@instill.ai**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could achieve)
- Any suggested fix (optional)

You will receive an acknowledgement within **48 hours** and a status update within **7 days**.

We follow responsible disclosure: if you report a valid vulnerability, we will coordinate a fix and credit you in the release notes before public disclosure.

## Scope

In scope:
- Authentication bypass
- Privilege escalation (non-admin accessing admin routes)
- SQL injection
- API key exposure
- Session fixation / CSRF
- Webhook HMAC bypass

Out of scope:
- Issues requiring physical access to the server
- Social engineering of operators/users
- Denial of service via resource exhaustion (report only if trivially exploitable)

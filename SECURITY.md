# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability in FactorySim, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: **adrisandeoca@gmail.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix**: Depending on severity, typically within 2 weeks for critical issues

## Scope

This policy covers:
- The FactorySim Electron desktop application
- The Python simulation engine
- The IPC bridge between Electron and Python
- Data handling (model files, Excel imports, SQLite database)

## Security Considerations

FactorySim is a desktop application that:
- Runs Python simulation code locally
- Stores data in the user's app data directory
- Does not transmit data to external servers
- Uses Electron with context isolation and sandbox mode enabled
- Does not execute arbitrary user code (Python export is read-only)

## Acknowledgments

We appreciate responsible disclosure and will credit reporters (with permission) in release notes.

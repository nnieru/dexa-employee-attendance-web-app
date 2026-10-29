# Security

- Never commit secrets. `.env*` files are git-ignored; `.env.example` holds placeholders only.
- Browser `VITE_*` variables are public. Do not place secrets in them.
- Every protected service must verify JWT signature, algorithm, issuer, audience and expiry. Decoding is not verification.
- Never log passwords, tokens, cookies or database URLs.
- Report vulnerabilities privately to the project owner rather than opening a public issue.

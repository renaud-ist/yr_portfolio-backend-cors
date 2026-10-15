# yr_portfolio backend API

This repository is the production backend for the MyPortfolio frontend. The currently verified architecture is:

- Frontend: GitHub Pages
- API: Cloudflare Worker
- Database: Cloudflare D1
- Email delivery: Brevo via Worker secret configuration

The Worker is the authoritative backend. The older PHP/MySQL implementation is legacy or local-only context and is not the current production architecture.

## Current production architecture

```text
GitHub Pages frontend
        |
        v
Cloudflare Worker API
        |
        v
Cloudflare D1 database
```

The Worker source is in `cloudflare/src/index.js`, and the runtime configuration lives in `wrangler.toml`.

## Repository structure

```text
cloudflare/src/index.js     Worker implementation
cloudflare/migrations/      D1 migration files
wrangler.toml               Worker and D1 configuration
README.md                   Project overview
```

## Runtime responsibilities

The Worker handles:

- contact submissions
- admin authentication
- conversation retrieval and mutation
- admin replies
- notification queries
- contact notification and optional admin-reply email delivery through Brevo

The Worker reads the D1 binding from `wrangler.toml` and does not rely on PHP or MySQL for the verified production path.

## Environment values

The production environment contains sensitive values such as:

- `BREVO_API_KEY`
- any admin credential material in the deployed environment

These must remain in secure Cloudflare environment storage and must not be committed to source control or documentation.

## Local development

Use Wrangler to run or test the Worker locally when needed:

```bash
npx wrangler dev
```

If a local preview is required, keep it separate from the production environment and do not apply D1 migrations or secrets into the live database without explicit approval.

## Verified API routes

The current Worker provides these routes:

```text
POST   /api/contact
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/conversations
GET    /api/conversation?id=<id>
PATCH  /api/conversation?id=<id>
DELETE /api/conversation?id=<id>
POST   /api/conversation/reply?id=<id>
GET    /api/notifications
PATCH  /api/notifications?id=<id>
POST   /api/notifications/read-all
DELETE /api/notifications?id=<id>
```

These are the routes the GitHub Pages frontend consumes.

## Security and deployment guidance

- Do not store secrets in source files or migration files
- Do not modify production D1 state without explicit authorization
- Keep admin credentials and provider keys in secure Worker environment configuration
- Use the Worker and D1 only as the authoritative production backend
- Treat older PHP or MySQL instructions as historical context only

## Configuration and deployment

The checked-in `wrangler.toml` configures Worker `myportfolio-api-proxy`, entry point `cloudflare/src/index.js`, D1 binding `DB`, database `myportfolio-db`, and migration directory `cloudflare/migrations`. Confirm the Cloudflare account and target environment before applying remote migrations or deploying.

Set secrets in Cloudflare, never in source, `.dev.vars`, shell history, or documentation:

- Required secret: `BREVO_API_KEY`
- Required verified sender variable: `REPLY_FROM_EMAIL`
- Optional sender display name: `REPLY_FROM_NAME`

The contact email is sent to `yangdarenaud893@gmail.com`; admin replies go only to the visitor address stored in the conversation. Confirm the Brevo sender/domain is verified before relying on delivery.

Use Wrangler to inspect and operate D1 and deploy the Worker:

```bash
npx wrangler d1 list
npx wrangler d1 migrations apply myportfolio-db --remote
npx wrangler deploy
```

Do not create or mutate production data as part of local testing. Use Wrangler's local D1 environment and apply migrations locally for development.

## API and persistence behavior

`POST /api/contact` accepts JSON fields `name`, `email`, `subject`, and `message`. It rate-limits by a hash of Cloudflare client IP/user agent, then writes the conversation, visitor message, and admin notification in one D1 batch. A successful response includes `saved`, `notificationCreated`, and `emailSent`; contact data remains saved when Brevo delivery fails. The email includes visitor name/email, subject, message, server timestamp, and Cloudflare client IP when available.

Admin replies return top-level `saved` and `emailSent` outcomes in addition to message data. Notification list/read-one/read-all/delete and conversation operations require a valid bearer token. Notification unread count and read state come from D1, not browser storage.

The Worker CORS allowlist is in `cloudflare/src/index.js`: the production GitHub Pages origin and explicitly named local development origins are allowed; requests carrying another Origin receive `403`. Keep it aligned with the actual frontend origin and test preflight after any domain change.

## Testing and release checks

Run the repository contract suite and source syntax check before deployment:

```bash
node --test tests/worker_contract.test.js
node --check cloudflare/src/index.js
```

The tests cover contact persistence/email outcomes, required email fields and recipient, CORS, authentication, notification read-one/read-all persistence, and reply-email provider outcomes. They do not connect to production D1 or Brevo. After a staging deployment, verify contact creation and notification count in D1, mark one/all notifications read and reload the dashboard, test reply delivery with Brevo, and inspect Worker logs without exposing credentials or message bodies.

Keep visitor IP collection limited to trusted `CF-Connecting-IP`; do not accept a body-supplied IP or trust arbitrary forwarding headers. Retain contact data and IP addresses only as long as operationally necessary, and publish an appropriate privacy/retention notice.

The legacy PHP-driven documentation and MySQL setup files are not the current production design. This README is the sole project Markdown document and the source of truth for Worker setup and deployment.

The portfolio describes verified academic and service experience. Add repositories, screenshots, live demos, employment history, or certifications only when their details can be verified.

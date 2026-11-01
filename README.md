# Dexa employee attendance

WFH attendance and employee monitoring system: two React web apps (employee portal, HR portal)
over NestJS microservices, PostgreSQL per service, and RabbitMQ events. Product context lives in
`docs/` (`PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `DESIGN.md`). `DATABASE.md` wins on data
ownership.

## Quick start (one command)

Requires Node 24 (`nvm use`) and Docker. Then:

```bash
npm run setup
```

That single command:

1. creates `.env` with random local passwords and development token keys (never overwritten if it
   already exists),
2. installs dependencies if `node_modules` is missing,
3. builds and starts the whole stack with Docker Compose (first build takes a few minutes),
4. lets every service run its migrations and startup seeds (roles, master data, default work
   schedule), and
5. creates the HR admin account (bootstrap) and the employee test account below.

When it finishes, the stack is running and ready to test. Re-running it is safe: every step is
idempotent.

### Test accounts

Local-only credentials, seeded by `npm run setup`. Never use them in a deployed environment.

| Role     | Email                 | Password      | Sign in at            |
| -------- | --------------------- | ------------- | --------------------- |
| HR admin | `hr.admin@dexa.test`  | `HrAdmin123`  | http://127.0.0.1:8081 |
| Employee | `employee1@dexa.test` | `Employee123` | http://127.0.0.1:8080 |

The employee portal also accepts the HR account (PRD AUTH-3).

### URLs

| App                 | URL                          |
| ------------------- | ---------------------------- |
| Employee web        | http://127.0.0.1:8080        |
| Admin web (HR)      | http://127.0.0.1:8081        |
| API gateway         | http://127.0.0.1:3000/api/v1 |
| RabbitMQ management | http://127.0.0.1:15672       |

The web apps reach the gateway same-origin through the nginx `/api/` proxy, so no CORS setup is
needed.

### Stop, reset, reseed

```bash
docker compose --profile apps down                    # stop the stack (keeps data)
docker compose --profile apps down -v && rm .env      # wipe data and configuration
npm run setup                                         # fresh setup from scratch
npm run seed:dev                                      # re-create only the test accounts
```

`npm run seed:dev` waits for the running stack, then signs in as the HR admin and creates the
employee test account through the real provisioning flow. It is idempotent.

## Manual alternative

`npm run setup` is the supported path. Doing it by hand:

```bash
nvm use                  # Node 24
npm install
cp .env.example .env     # fill passwords, keys (npm run -s keys:generate), bootstrap values
npm run infra:up         # postgres + rabbitmq
docker compose --profile apps up -d --build
npm run seed:dev
```

## Layout

| Path                                                                                  | Purpose                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/api-gateway`                                                                    | Public REST entry (port 3000)                  |
| `apps/auth-service`, `employee-service`, `attendance-service`, `notification-service` | Domain services (3001-3004), one database each |
| `apps/audit-worker`                                                                   | Audit worker host (3005), no consumers yet     |
| `apps/employee-web`, `apps/admin-web`                                                 | React apps (8080, 8081) sharing `@dexa/ui`     |
| `libs/common`, `libs/db`, `libs/messaging`                                            | Backend-only shared code                       |
| `packages/contracts`, `packages/ui`, `packages/api-client`                            | Shared by backend and frontend                 |
| `scripts/setup-dev.mjs`                                                               | The one-command setup behind `npm run setup`   |

Services never import each other. They share only `libs/*` and `packages/*`.

## Commands

| Command                                  | Purpose                                       |
| ---------------------------------------- | --------------------------------------------- |
| `npm run setup`                          | One-command setup: .env, stack, seed          |
| `npm run seed:dev`                       | Seed the dev test accounts on a running stack |
| `npm run lint`                           | ESLint and Prettier check                     |
| `npm run typecheck`                      | Type-check every workspace                    |
| `npm test`                               | Unit tests (Jest backend, Vitest frontend)    |
| `npm run test:integration`               | Backend HTTP integration tests                |
| `npm run build`                          | Build everything                              |
| `npm run build:storybook`                | Build Storybook                               |
| `npm run dev -w @dexa/<name>`            | Run one workspace with reload                 |
| `npm run storybook`                      | Design system docs on :6006                   |
| `npm run db:generate -w @dexa/<service>` | Generate a Drizzle migration                  |
| `npm run db:migrate -w @dexa/<service>`  | Apply migrations                              |

# Dexa employee attendance

Monorepo boilerplate for the WFH attendance and employee monitoring system. It contains structure and
tooling only; no business features are implemented yet. Product context lives in `docs/`
(`PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `DESIGN.md`). `DATABASE.md` wins on data ownership.

## Layout

| Path                                                                                  | Purpose                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/api-gateway`                                                                    | Public REST entry (port 3000)                  |
| `apps/auth-service`, `employee-service`, `attendance-service`, `notification-service` | Domain services (3001-3004), one database each |
| `apps/audit-worker`                                                                   | Audit worker host (3005), no consumers yet     |
| `apps/employee-web`, `apps/admin-web`                                                 | React apps (5173, 5174) sharing `@dexa/ui`     |
| `libs/common`, `libs/db`, `libs/messaging`                                            | Backend-only shared code                       |
| `packages/contracts`, `packages/ui`, `packages/api-client`                            | Shared by backend and frontend                 |

Services never import each other. They share only `libs/*` and `packages/*`.

## Getting started

```bash
nvm use                  # Node 24
npm install
cp .env.example .env     # replace placeholders
npm run infra:up         # postgres + rabbitmq
npm run dev              # all services and both web apps
npm run storybook        # @dexa/ui and design system docs on :6006
```

## Commands

| Command                                  | Purpose                                    |
| ---------------------------------------- | ------------------------------------------ |
| `npm run lint`                           | ESLint and Prettier check                  |
| `npm run typecheck`                      | Type-check every workspace                 |
| `npm test`                               | Unit tests (Jest backend, Vitest frontend) |
| `npm run test:integration`               | Backend HTTP integration tests             |
| `npm run build`                          | Build everything                           |
| `npm run build:storybook`                | Build Storybook                            |
| `npm run dev -w @dexa/<name>`            | Run one workspace                          |
| `npm run db:generate -w @dexa/<service>` | Generate a Drizzle migration               |
| `npm run db:migrate -w @dexa/<service>`  | Apply migrations                           |

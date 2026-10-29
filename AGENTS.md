# AGENTS.md

Instructions for AI coding agents and human contributors working on the WFH Attendance & Employee Monitoring system. Read this file before changing code. When a rule here conflicts with a habit, follow the rule. When a rule seems wrong for a case, say so in the pull request instead of silently breaking it.

## 1. Project at a glance

Two React web apps (Employee, Admin HRD) consume NestJS microservices over REST. Services publish events through RabbitMQ. Each service owns a PostgreSQL database.

| Layer    | Stack                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | React, TypeScript (strict), Vite, Tailwind CSS, zod, React Hook Form, axios, TanStack Query, TanStack Router, TanStack Table, React Context (Zustand only when needed) |
| Backend  | NestJS on Express, TypeScript (strict), zod validation, Drizzle ORM, `amqplib` wrapper                                                                                 |
| Infra    | PostgreSQL, RabbitMQ, Docker Compose, npm workspaces                                                                                                                   |
| Tests    | Jest (backend), Vitest and React Testing Library (frontend), Testcontainers, supertest, MSW                                                                            |

## 2. Source of truth

| Question                                             | Read              |
| ---------------------------------------------------- | ----------------- |
| What must the product do?                            | `PRD.md`          |
| Which technologies, how do services talk?            | `ARCHITECTURE.md` |
| Table shapes, constraints, ownership, open decisions | `DATABASE.md`     |
| How do I write the code?                             | This file         |

If documents disagree, do not pick silently. `DATABASE.md` wins for data ownership and schema. Report the disagreement in your summary and propose a fix to the document.

Do not invent business rules. `DATABASE.md` section 9 lists open decisions. If a task depends on one, stop and ask.

## 3. Commands

Every package exposes the same script names so they can run from the root (`npm run <script>`) or per workspace (`npm run <script> -w @dexa/<package>`).

| Command                                                   | Purpose                                             |
| --------------------------------------------------------- | --------------------------------------------------- |
| `npm install`                                             | Install all workspace dependencies                  |
| `npm run lint`                                            | ESLint and Prettier check                           |
| `npm run typecheck`                                       | `tsc --noEmit` in every package                     |
| `npm test`                                                | Unit tests                                          |
| `npm run test:integration`                                | Integration tests (needs Docker for Testcontainers) |
| `npm run dev -w @dexa/<service>`                          | Run one service with reload                         |
| `npm run db:generate -w @dexa/<service> -- --name <name>` | Generate a Drizzle migration                        |
| `npm run db:migrate -w @dexa/<service>`                   | Apply migrations                                    |
| `docker compose up`                                       | Run the full stack                                  |

Before you finish any task, run lint, typecheck, and the tests for the packages you touched.

## 4. Repository layout

```
apps/
  <service>/                  one NestJS app per service
  employee-web/               React app
  admin-web/                  React app
libs/                         backend-only shared code
  common/                     logger, config helpers, WIB date helpers
  messaging/                  amqplib wrapper (publish, consume, retry, DLQ)
  db/                         Drizzle client factory, migration runner
packages/                     shared by backend and frontend
  contracts/                  zod schemas, inferred types, event names, error codes
  ui/                         shared React components, Tailwind preset
  api-client/                 axios instance, API functions
```

A service never imports code from another service. Services share only `libs/*` and `packages/*`.

## 5. Working agreement for agents

1. **Understand first.** Read the relevant sections of the documents above and the code you will touch before editing.
2. **Make the smallest correct change.** Do not refactor unrelated code, rename things, or reformat files you are not changing.
3. **Follow existing patterns.** Match the closest similar feature before inventing a new structure.
4. **Verify.** Run the commands in section 3. Never report a task as done with failing checks.
5. **Report honestly.** State what you changed, what you ran, and anything you could not verify or decided to skip.
6. **Ask when ambiguous.** A question costs less than a wrong migration.

## 6. Design principles

These principles are rules for review. Each has a concrete meaning in this codebase.

### SOLID

| Principle                 | Rule here                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S**ingle responsibility | One reason to change per unit. Controllers map HTTP, services run use cases, repositories talk to the database, rule modules hold pure policy. A React component either renders or fetches (through a hook), not both.                                              |
| **O**pen/closed           | Add behavior by adding code, not by growing `switch` and `if` chains. New attendance classification rules, notification channels, and event consumers are new classes or entries behind an existing interface. Prefer data (master tables) over hardcoded branches. |
| **L**iskov substitution   | Any implementation of an interface must be usable wherever the interface is expected. Do not throw "not implemented", narrow accepted inputs, or change meaning. Test fakes must behave like the real thing.                                                        |
| **I**nterface segregation | Prefer small, role-specific interfaces (`IEmployeeReader`, `IEmployeeWriter`) over one large one. A consumer depends only on the methods it calls.                                                                                                                  |
| **D**ependency inversion  | Business logic depends on interfaces (`I*`), never on Drizzle, axios, amqplib, `fs`, or the system clock directly. Infrastructure implements the interfaces and is wired in the Nest module.                                                                        |

### Other principles

- **DRY.** Every piece of knowledge has one home: zod schemas in `packages/contracts`, schema design in `DATABASE.md`, codes and error identifiers in constants. Extract duplication when it appears a third time (rule of three). Do not merge code that only looks similar and changes for different reasons.
- **KISS.** Choose the simplest design that meets the requirement. No clever one-liners, no deep inheritance, no abstractions without a second use or a real boundary.
- **YAGNI.** Do not build for requirements nobody stated. No unused parameters, flags, options, or "future" hooks.
- **Composition over inheritance.** Inherit only from framework base classes or a deliberately small abstract base. Share behavior through injected collaborators.
- **Separation of concerns.** Keep I/O at the edges and decisions in pure functions that take data and return data.
- **Law of Demeter.** Talk to direct collaborators. Avoid `a.b.c.d()` chains across object boundaries.
- **Fail fast.** Validate at the boundary, reject bad input early, and keep invalid states unrepresentable with types (discriminated unions over boolean flags).
- **Command-query separation.** A method either changes state or returns data, not both, except where atomicity requires it (for example, insert and return the row).
- **Immutability by default.** `const`, `readonly`, and returning new objects. Mutate only inside a narrow, local scope.
- **Least astonishment.** Names and behavior match. A function called `getX` does not write.
- **Boy Scout rule.** Leave touched code a little cleaner, within the scope of the task.

### Size and complexity guidelines

| Guideline             | Target                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| Function length       | About 30 lines or fewer; extract when it does more than one thing        |
| Parameters            | Three or fewer; beyond that, pass one typed object                       |
| Nesting               | Two levels preferred, three at most; use early returns and guard clauses |
| Cyclomatic complexity | 10 or lower (ESLint `complexity`)                                        |
| File length           | About 300 lines; split by responsibility                                 |
| Magic values          | None; name them as constants or derive them from master data             |

## 7. Naming conventions

### 7.1 Summary

| Thing                               | Convention                                         | Example                                                  |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| **Interface** (`interface` keyword) | PascalCase with `I` prefix                         | `IEmployeeService`, `IClock`                             |
| Type alias (data shape, `z.infer`)  | PascalCase, no prefix                              | `EmployeeProfile`, `CreateEmployeeInput`                 |
| Class                               | PascalCase noun with a role suffix                 | `EmployeeService`, `JwtAuthGuard`                        |
| Class implementing an interface     | Interface name without `I`                         | `EmployeeService implements IEmployeeService`            |
| Abstract base class (rare)          | `Base` prefix                                      | `BaseEventConsumer`                                      |
| Function, method                    | camelCase, verb first                              | `calculateLateness`, `findByAccountId`                   |
| Variable, parameter, property       | camelCase noun                                     | `employeeId`, `clockInAt`                                |
| Boolean                             | `is`, `has`, `can`, `should` prefix                | `isActive`, `hasPhoto`                                   |
| Module-level constant               | UPPER_SNAKE_CASE                                   | `MAX_PHOTO_BYTES`                                        |
| DI token                            | UPPER_SNAKE_CASE `Symbol`                          | `EMPLOYEE_REPOSITORY`                                    |
| Fixed set of values                 | `as const` object plus union type, PascalCase name | `Role.HR`, `type Role`                                   |
| Zod schema                          | camelCase with `Schema` suffix                     | `createEmployeeSchema`                                   |
| Generic type parameter              | `T` prefix, descriptive                            | `TPayload`, `TEntity` (plain `T` only for trivial cases) |
| React component                     | PascalCase                                         | `CheckInButton`                                          |
| Hook                                | `use` plus PascalCase                              | `useCheckIn`                                             |
| Props type                          | `<Component>Props` type alias                      | `CheckInButtonProps`                                     |
| Event handler prop                  | `on` plus event                                    | `onSubmit`                                               |
| Event handler function              | `handle` plus event                                | `handleSubmit`                                           |

### 7.2 Interfaces use the `I` prefix

Every declaration that uses the `interface` keyword is named `I` plus PascalCase.

```ts
// employee-service.interface.ts
export interface IEmployeeService {
  getProfile(accountId: string): Promise<EmployeeProfile>;
  updateContact(accountId: string, input: UpdateContactInput): Promise<EmployeeProfile>;
}

export const EMPLOYEE_SERVICE = Symbol('IEmployeeService');
```

```ts
// employee.service.ts
@Injectable()
export class EmployeeService implements IEmployeeService {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: IEmployeeRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}
  // ...
}
```

```ts
// employee.module.ts
@Module({
  providers: [{ provide: EMPLOYEE_SERVICE, useClass: EmployeeService }],
  exports: [EMPLOYEE_SERVICE],
})
export class EmployeeModule {}
```

Rules:

1. **Use `interface` for behavior contracts** (services, repositories, clients, publishers, strategies, clocks). These are the ports that dependency inversion relies on.
2. **Use `type` aliases for data shapes**: zod-inferred types, DTOs, row types, React props. They carry no `I` prefix. Do not use `interface` for plain data.
3. **Inject by token.** TypeScript interfaces vanish at runtime, so every injectable interface exports a `Symbol` token next to it (`EMPLOYEE_SERVICE` for `IEmployeeService`) and consumers use `@Inject(TOKEN)`.
4. **The interface lives in its own file** named `<name>.interface.ts`, together with its token.
5. **Do not create an interface for every class.** Add one when there is a real boundary (database, network, clock, queue, file system), more than one implementation, or a need to substitute it in tests. A helper used inside one module with one implementation stays a plain class.
6. **Keep interfaces small.** Split a growing interface by role (segregation), not by adding optional methods.
7. **Never prefix classes or type aliases with `I`**, and never name a class after its interface with a suffix like `Impl`. The implementation takes the plain name (`EmployeeService`); a second implementation is named for what differs (`CachedEmployeeRepository`).

Enforce it with ESLint (`@typescript-eslint/naming-convention`):

```js
'@typescript-eslint/naming-convention': [
  'error',
  { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: true } },
  { selector: 'typeAlias', format: ['PascalCase'], custom: { regex: '^I[A-Z][a-z]', match: false } },
  { selector: 'class',     format: ['PascalCase'], custom: { regex: '^I[A-Z][a-z]', match: false } },
  { selector: 'variable', types: ['boolean'], format: ['PascalCase'],
    prefix: ['is', 'has', 'can', 'should', 'will', 'did'] },
],
```

### 7.3 Files and folders

Folders and files use **kebab-case**. The file name matches its main export (`EmployeeService` lives in `employee.service.ts`). One class or component per file.

| Kind                             | Pattern                                           | Example                                       |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Nest module                      | `<name>.module.ts`                                | `employee.module.ts`                          |
| Controller                       | `<name>.controller.ts`                            | `employee.controller.ts`                      |
| Service                          | `<name>.service.ts`                               | `employee.service.ts`                         |
| Repository                       | `<name>.repository.ts`                            | `employee.repository.ts`                      |
| Interface and token              | `<name>.interface.ts`                             | `employee-service.interface.ts`               |
| Guard, pipe, filter, interceptor | `<name>.<kind>.ts`                                | `jwt-auth.guard.ts`, `zod-validation.pipe.ts` |
| Pure rules                       | `<name>.rules.ts`                                 | `attendance-classification.rules.ts`          |
| Domain errors                    | `<name>.errors.ts`                                | `attendance.errors.ts`                        |
| Zod schemas                      | `<name>.schema.ts`                                | `create-employee.schema.ts`                   |
| Drizzle schema                   | `schema.ts` (per service)                         | `infrastructure/db/schema.ts`                 |
| Unit test                        | `<file>.spec.ts` or `.spec.tsx`, next to the file | `employee.service.spec.ts`                    |
| Integration test                 | `<name>.integration.spec.ts`                      | `attendance.integration.spec.ts`              |
| React component                  | `<component-name>.tsx`                            | `check-in-button.tsx`                         |
| Hook                             | `use-<name>.ts`                                   | `use-check-in.ts`                             |
| API function                     | `<verb>-<noun>.ts`                                | `submit-check-in.ts`                          |
| Zustand store                    | `<name>.store.ts`                                 | `session.store.ts`                            |

Router files follow TanStack Router's file conventions. Do not create `utils.ts`, `helpers.ts`, `common.ts`, or `misc.ts`. Name a file for what it does (`format-business-date.ts`). Avoid barrel files (`index.ts` re-exports); import from the defining file. `packages/contracts` has a single public entry point and is the only exception.

### 7.4 Identifiers

- Names reveal intent and use the domain vocabulary of the documents (`attendanceDay`, `workSchedule`, `overtimeRequest`).
- No abbreviations except widely known ones (`id`, `url`, `dto`, `jwt`). Write `employee`, not `emp`.
- Functions start with a verb: `get`, `find` (may return nothing), `create`, `update`, `calculate`, `is`, `assert`. Do not add an `Async` suffix.
- Collections are plural (`employees`); a single value is singular. Maps read `employeeById`.
- Avoid vague class names such as `Manager`, `Helper`, `Util`, `Handler` (unless it is a message handler), and `Data`.
- Prefer string-literal unions or `as const` objects to TypeScript `enum`.
- Errors end with `Error` and describe the failure (`AttendanceAlreadyRecordedError`).

### 7.5 API, database, events, configuration

| Area                         | Convention                                                                 | Example                                                          |
| ---------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| REST routes                  | Versioned, kebab-case, plural nouns; verbs only for non-CRUD actions       | `/api/v1/employees/me/photo`, `POST /api/v1/attendance/clock-in` |
| JSON fields and query params | camelCase                                                                  | `clockInAt`, `employeeId`                                        |
| Error codes                  | UPPER_SNAKE_CASE                                                           | `ATTENDANCE_ALREADY_CLOCKED_IN`                                  |
| Events                       | Lowercase, dot-separated, past tense                                       | `employee.profile.updated`                                       |
| Queues                       | `<consumer>.<purpose>`                                                     | `hr.notifications`                                               |
| Environment variables        | UPPER_SNAKE_CASE, service prefix                                           | `EMPLOYEE_DB_URL`                                                |
| Tables                       | snake_case, plural; masters prefixed `master_`                             | `attendance_days`, `master_roles`                                |
| Columns                      | snake_case; `_id` for foreign keys, `_at` for instants, `is_` for booleans | `account_id`, `recorded_at`, `is_active`                         |
| Constraints and indexes      | `<table>_<columns>_<kind>` with `pk`, `uq`, `fk`, `ck`, `idx`              | `attendance_days_account_id_business_date_uq`                    |
| Drizzle properties           | camelCase mapped to snake_case columns; table constants plural camelCase   | `attendanceDays`, `accountId`                                    |
| Migrations                   | Verb and subject, named with `--name`                                      | `add_overtime_overlap_constraint`                                |
| Workspace packages           | One scope                                                                  | `@dexa/contracts`                                                |
| Branches                     | `<type>/<short-description>`                                               | `feat/employee-photo-upload`                                     |
| Commits                      | Conventional Commits                                                       | `fix(attendance): reject duplicate clock-in`                     |

## 8. TypeScript rules

- `strict` mode on in every package. No `any`. Use `unknown` and narrow with zod or type guards.
- No `@ts-ignore`. Use `@ts-expect-error` with a one-line reason, and only when unavoidable.
- No non-null assertions (`!`) unless an adjacent comment proves the value exists.
- Exported functions and methods declare explicit return types.
- Use `import type` for type-only imports.
- Prefer `readonly` properties and `ReadonlyArray`.
- Model states with discriminated unions, not parallel optional fields.
- Use named exports. Default exports only where a framework requires them (for example, route files).
- Derive types from zod schemas (`z.infer`) instead of writing them twice.
- Do not widen types to make errors disappear. Fix the cause.

## 9. Backend rules

**Layering.** Dependencies point inward: controller → service → interface → implementation (repository, client, publisher). Pure rules sit beside the service and import nothing from infrastructure.

| Layer      | Does                                                                                          | Never does                                                       |
| ---------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Controller | Authorize (guards), validate (zod pipe), call one service method, return the result           | Business logic, database access, event publishing                |
| Service    | Orchestrate a use case, own the transaction boundary, call ports, publish events after commit | Import Drizzle, axios, or amqplib directly; build HTTP responses |
| Repository | Drizzle queries for one aggregate                                                             | Business decisions, HTTP concerns                                |
| Rules      | Pure functions that take data and return decisions                                            | I/O, `new Date()`, randomness, logging                           |

**Practices.**

- **Validation.** Every request, response from another service, message, and environment config is parsed with a zod schema from `packages/contracts` (or a config schema). Request schemas are strict.
- **Time.** Inject `IClock`. Never call `new Date()` or `Date.now()` in business code. The server instant is authoritative for attendance, and business dates are computed in the configured business timezone through the shared helper.
- **Configuration.** Read environment variables only inside the config module, validated at startup. Inject typed config elsewhere.
- **Errors.** Services throw domain errors (extending `DomainError`). One exception filter maps them to HTTP responses. Services never throw HTTP exceptions.
- **Database.** Use Drizzle for all queries. Wrap multi-statement operations in `db.transaction`. Take row locks with `.for('update')` where `DATABASE.md` requires them. Map unique (`23505`) and exclusion (`23P01`) violations to conflicts. Never build SQL by string concatenation.
- **Migrations.** Additive only. Never edit a migration that has been committed. Review every generated migration. Triggers, exclusion constraints, and extensions go in hand-written SQL migrations.
- **Events.** Publish through `IEventPublisher` after the database commit, with publisher confirms and a stable message ID. Consumers validate the message, are idempotent by event ID, and acknowledge only after their database commit. Events never contain passwords, hashes, tokens, or free-text private reasons.
- **Service calls.** Call other services through a client class that implements an `I*Client` interface, with a timeout. Retry only idempotent requests.
- **Pagination.** Every list endpoint is paginated. No unbounded queries.
- **Idempotency.** Writes that clients may retry carry an idempotency key or rely on a database uniqueness rule.
- **Cross-service data.** Other services' account IDs are logical references. Resolve names and emails with one batched lookup per page, never one call per row.

## 10. Frontend rules

- **Feature-based structure.** Code lives in `features/<feature>/{api,components,hooks,types,utils}`. Features do not import from each other. Compose features in `app/`. Dependencies flow one way: shared packages → features → app.
- **Components.** Keep them small and single-purpose. Fetching and mutations happen in hooks; components render. Type all props. Do not use array indexes as keys.
- **Server state.** Only TanStack Query holds server data. Never copy it into Context or Zustand. Use a query-key factory per feature. Mutations invalidate or update the relevant keys.
- **Client state.** Start with Context for session and theme. Add Zustand for a slice that is shared widely or changes often. No global store by default.
- **Network.** Use the shared axios instance through API functions in `features/*/api`. Do not call axios from components. Parse responses with the shared zod schema.
- **Forms.** React Hook Form with the zod resolver, using schemas from `packages/contracts`.
- **Routing.** Use typed `Link` and `navigate`. Validate search params with zod. Guard routes in `beforeLoad`.
- **Effects.** Do not use `useEffect` to fetch data or derive state. Use TanStack Query and plain computation.
- **Styling.** Tailwind utility classes, mobile-first, with shared design tokens. Use a `cn()` helper for conditional classes. No inline styles. Extract a component instead of repeating long class lists.
- **Accessibility.** Semantic elements, labelled inputs, visible focus, keyboard support, and live regions for toasts.
- **States.** Every screen handles loading, empty, and error states. Use error boundaries per route.
- **Tables.** Wrap TanStack Table in the shared `DataTable`. HR lists use server-side pagination and sorting with state in the URL.

## 11. Error handling, logging, security

- Handle errors where you can act on them; otherwise let them propagate. Never swallow an error silently or catch only to rethrow unchanged.
- Use the structured logger with the correlation ID. No `console.log` in committed code.
- Never log, return, or publish passwords, hashes, tokens, or secrets.
- Authorize on the server for every endpoint. Hiding a button is not authorization.
- Validate uploads by actual content, not file extension, and enforce size limits before buffering.
- Keep secrets in environment configuration. Never commit `.env` files or credentials.
- Keep sensitive values out of URLs and query strings.
- Error messages shown to users must not reveal internals or whether an email exists.

## 12. Testing

- **Unit tests** cover pure rules, zod schemas, helpers, hooks, and components. Make rule tests table-driven.
- **Integration tests** run against real PostgreSQL and RabbitMQ (Testcontainers). Every database constraint described in `DATABASE.md` that you add or rely on has an integration test, including conflict mapping, immutability triggers, idempotency, ack-after-commit, redelivery, and DLQ behavior. Frontend integration tests use MSW for the network.
- **Structure.** Arrange, act, assert. One behavior per test. Name tests `should <result> when <condition>`.
- **Determinism.** Inject `IClock` and fake it. No sleeping, no test-order dependence, no shared mutable state.
- **Do not mock what you own.** Prefer a real database in integration tests. Use fakes for external boundaries only.
- Every bug fix includes a regression test that fails without the fix.
- Test names and fixtures use the domain vocabulary, and test code follows the same naming rules as production code.

## 13. Comments, documentation, git

- Comments explain **why**, not what. Delete commented-out code.
- Public interfaces and non-obvious rules get a short doc comment. Rename before you comment.
- Use `TODO(<ticket>): <reason>` only with a ticket reference.
- Update `PRD.md`, `ARCHITECTURE.md`, or `DATABASE.md` in the same pull request when behavior, stack, or schema changes.
- Commits follow Conventional Commits. Keep pull requests small and focused on one concern, with a description of what changed, why, and how it was tested.

## 14. Boundaries

**Always**

- Read the related documents first, and run lint, typecheck, and tests before finishing.
- Add or update tests with every behavior change.
- Validate input with zod at every boundary.
- Depend on `I*` interfaces and inject them through Nest.

**Ask first**

- Anything listed under open decisions in `DATABASE.md` section 9.
- Adding a dependency, a new service, a new queue or event type, or a new table.
- Changing a shared contract in `packages/contracts` (update every consumer in the same change).
- Changing authentication, authorization, or token handling.
- Large refactors or file moves outside the task.

**Never**

- Edit a migration that has already been committed or applied.
- Commit secrets, `.env` files, or real credentials.
- Disable a lint rule, skip a test, or loosen TypeScript settings to make a check pass.
- Use `any`, `@ts-ignore`, or `console.log` in committed code.
- Import one service's code from another service.
- Put business logic in controllers or React components.
- Read the client clock for attendance or store client-supplied timestamps.
- Write passwords, hashes, or tokens to logs, events, or notifications.
- Copy server data into client state stores.

## 15. Definition of done

- [ ] The change does what the task asked, and nothing unrelated changed.
- [ ] Naming follows section 7, including `I`-prefixed interfaces with DI tokens.
- [ ] No duplicated logic, dead code, magic values, or unused exports.
- [ ] Inputs are validated with zod and errors are handled and mapped.
- [ ] Unit and integration tests cover the new behavior and pass.
- [ ] `npm run lint`, `npm run typecheck`, and tests pass for every touched package.
- [ ] Migrations are additive and reviewed. Schema changes are reflected in `DATABASE.md`.
- [ ] No secrets, sensitive data in logs, or new warnings.
- [ ] Documentation is updated where behavior or design changed.

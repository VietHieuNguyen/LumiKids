# AGENTS.md – AI Coding Agent Guidelines (LumiKids)

> This document defines the core context, architecture, coding conventions, and strict boundaries for the **LumiKids** project. All AI Agents writing code, designing features, or fixing bugs must strictly follow these rules.
> Reference documents: [`docs/STRUCTURE.md`](./STRUCTURE.md) and [`srs_tuan06.md`](../srs_tuan06.md).

---

## 1. Project Overview & Tech Stack (Core Context)

**LumiKids** is an AI-integrated smart early childhood education platform designed for instructional activity design, assessment, and personalized competency profiling (`ChildDevelopmentProfile`) for children aged 3–6 (focusing on the Cognitive Development domain).

### Tech Stack
- **Monorepo:** Single Git repository managed via **`pnpm` workspaces** + Turborepo.
- **Frontend (`apps/web`):** Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, dnd-kit (drag-and-drop for lesson plans and games), Framer Motion, IndexedDB/Dexie (client-side queue for buffering `InteractionEvent`).
- **Core Backend (`apps/api`):** NestJS (TypeScript) following a **Modular Monolith** architecture, Prisma ORM, BullMQ (asynchronous background processing via Worker), CASL/Guards (authorization).
- **AI Service (`services/ai`):** Python FastAPI (thin AI Gateway), Pydantic v2, Google GenAI SDK (Gemini API), RAG with **Qdrant** (`qdrant-client`).
- **Shared Packages (`packages/shared`, `packages/ai-client`):** Shared TypeScript types, Enums, and Zod schemas between Web and API; auto-generated TypeScript client from FastAPI OpenAPI spec.
- **Database & Infrastructure (`infra/`):** PostgreSQL 16 (relational data), **Qdrant** (Vector DB for RAG), Redis (Cache + BullMQ), MinIO/S3 (learning media storage), Docker Compose, k6 (load testing).

---

## 2. Architecture & Directory Map

### 2.1. Standard Directory Structure
```text
LumiKids/
├─ apps/
│  ├─ web/                          # Next.js Frontend
│  └─ api/                          # NestJS Core Backend (API entrypoint + Worker entrypoint)
│     └─ src/
│        ├─ common/                 # Shared Guards, Filters, Decorators, Interceptors, Config
│        └─ modules/                # 7 business modules (see Section 2.2)
├─ services/
│  └─ ai/                           # Python FastAPI (Prompts, RAG on curriculum docs, Gemini)
├─ packages/
│  ├─ shared/                       # Shared Types/Schemas: GameContent, ActionData, Enums
│  └─ ai-client/                    # Auto-generated TS client from FastAPI OpenAPI
├─ infra/
│  ├─ docker-compose.yml            # PostgreSQL, Qdrant, Redis, MinIO
│  └─ k6/                           # Load testing scripts
└─ docs/
   ├─ AGENTS.md                     # AI Agent guidelines (this file)
   └─ STRUCTURE.md                  # Detailed architecture & phased roadmap
```

### 2.2. Module-Level Architecture Rules in `apps/api` (Pragmatic Architecture)

Do not blindly apply a single heavy pattern across every module. AI Agents must use the appropriate architecture pattern based on the module classification below:

#### A. CRUD / Data Management Modules → Use **3-Layer Architecture** (`Controller -> Service -> Repository/Prisma`)
Applies to 4 modules:
1. **`users`**: `User`, `Teacher`, `Guardian`, `Child`
2. **`classrooms`**: `Classroom`, `SchoolYear`, `AgeGroup`
3. **`curriculum`**: `Skill`, `AssessmentCriterion`
4. **`learning-content`**: `LessonPlan`, `Activity`, `ActivityVersion`, `ActivityAssignment`, `ActivityRecipient`

**Required structure for 3-Layer modules:**
```text
modules/<module-name>/
├─ dto/                             # Request/Response DTOs (class-validator / zod)
├─ <name>.controller.ts             # Layer 1 (Presentation): Handle HTTP requests, validate DTOs, return responses
├─ <name>.service.ts                # Layer 2 (Business): Validate business conditions and orchestrate operations
├─ <name>.repository.ts             # Layer 3 (Data Access): Encapsulate Prisma database queries
└─ <name>.module.ts
```
*(Note: Do NOT create redundant UseCase interfaces, separate Domain Entities, or boilerplate Mappers inside CRUD modules).*

#### B. Core Computation & Personalization Modules → Use **Clean Architecture**
Applies to 2 modules:
5. **`gameplay`**: `PlaySession`, `InteractionEvent`, `SessionPerformance`
6. **`evaluation-profile`**: `CriterionEvaluation`, `CriterionState`, `SkillState`, `ChildDevelopmentProfile`

**Required structure for Clean Architecture modules:**
```text
modules/<module-name>/
├─ domain/                          # Pure TypeScript (NO Prisma/NestJS imports): Entities, Value Objects, scoring formulas, evaluation & adaptation rules
├─ application/                     # Use-cases orchestrating business flows, Interfaces (Ports)
├─ infrastructure/                  # Prisma Repository implementations, BullMQ Worker processors, Mappers
├─ presentation/                    # Controllers & DTOs
└─ <name>.module.ts
```

#### C. AI Integration Module
7. **`ai-integration`**: Acts strictly as an internal bridge from NestJS to `services/ai` (FastAPI), anonymizing child data before outbound calls. It does not own business database tables.

---

## 3. Canonical Domain Model (21 Entities)

When writing Prisma schemas, DTOs, Entities, or queries, AI Agents **must use the exact entity and field names** listed below (do not invent alternative names):

| Module | Entity | Core Fields |
|---|---|---|
| `users` | `User` | `userId: String`, `fullName: String`, `email: String`, `phone: String`, `address: String` |
| `users` | `Teacher` | Extends/links `User`, `specialization: String` |
| `users` | `Guardian` | Extends/links `User`, `relationship: ENUM` |
| `users` | `Child` | `childId: String`, `dob: DateTime`, `fullName: String`, `gender: Gender` |
| `classrooms` | `Classroom` | `classId: String`, `className: String`, `schoolYear: SchoolYear`, `ageGroup: AgeGroup`, `teachers: List<Teacher>`, `childs: List<Child>` |
| `classrooms` | `SchoolYear` | `schoolYearId: String`, `name: String` |
| `classrooms` | `AgeGroup` | `ageGroupId: String`, `name: String` |
| `curriculum` | `Skill` | `skillCode: String`, `name: String`, `description: String`, `criterions: List<AssessmentCriterion>` |
| `curriculum` | `AssessmentCriterion` | `criterionCode: String`, `description: String` |
| `learning-content` | `LessonPlan` | `lessonPlanId: String`, `title: String`, `objectives: String` |
| `learning-content` | `Activity` | `activityId: String`, `name: String`, `description: String`, `ageGroup: AgeGroup`, `versions: List<ActivityVersion>` |
| `learning-content` | `ActivityVersion` | `versionId: String`, `versionNumber: Integer`, `instruction: String`, `difficulty: ENUM`, `content: GameContent`, `completionRule: ENUM` |
| `learning-content` | `ActivityAssignment` | `assignId: String`, `title: String`, `deadline: Date`, `activities: List<ActivityVersion>` |
| `learning-content` | `ActivityRecipient` | `activityRecipientId: String`, `completionStatus: ENUM` |
| `gameplay` | `PlaySession` | `sessionId: String`, `interactions: List<InteractionEvent>`, `performance: SessionPerformance` |
| `gameplay` | `InteractionEvent` | `eventId: String`, `eventType: EventType`, `actionData: ActionData` |
| `gameplay` | `SessionPerformance` | `playSessionId: String`, `attemptCount: Integer`, `correctCount: Integer`, `incorrectCount: Integer`, `firstAttemptCorrectCount: Integer`, `hintCount: Integer`, `completionDuration: Time` |
| `evaluation-profile` | `CriterionEvaluation` | `criterionEvaluationId: String`, `level: ENUM`, `summary: String`, `criterionCode: String` |
| `evaluation-profile` | `CriterionState` | `criterionStateId: String`, `criterionCode: String`, `level: ENUM`, `summary: String` |
| `evaluation-profile` | `SkillState` | `skillStateId: String`, `skillCode: String`, `level: ENUM`, `summary: String` |
| `evaluation-profile` | `ChildDevelopmentProfile` | `profileId: String`, `childId: String`, `activities: List<ActivityVersion>`, `progressTrend: ENUM`, `summary: String` |

---

## 4. Code Style & Conventions

### TypeScript (Next.js & NestJS)
- **Variables, properties:** `camelCase` (e.g., `lessonPlanId`, `completionStatus`).
- **Classes, Interfaces, Types, Enums, React Components:** `PascalCase` (e.g., `ActivityVersion`, `PlaySessionService`).
- **Methods / Functions:** Follow the team's convention consistently (`camelCase` for standard TS/NestJS or `PascalCase` if established in the current file; always match the surrounding code).
- **File naming:**
  - NestJS: `kebab-case` with role suffixes (`activity-version.controller.ts`, `activity-version.service.ts`, `activity-version.repository.ts`).
  - Next.js Components: `PascalCase.tsx` or `kebab-case.tsx` consistently per directory.
- **Type Safety:** Never use `any`. Dynamic JSON structures such as `GameContent` and `ActionData` must be strictly typed and validated using Zod schemas defined in `packages/shared`.

### Python (`services/ai` - FastAPI)
- **Variables, functions, methods, file/module names:** `snake_case` (e.g., `generate_lesson_plan`, `prompt_version`).
- **Classes, Pydantic Models, Enums:** `PascalCase` (e.g., `GameContentSchema`, `LessonPlanDraftResponse`).
- Always include full **Type Hints** on all functions and use Pydantic v2 for input/output validation.

---

## 5. Strict Boundaries & Business Guardrails

1. **Security & Environment Configuration (`.env` Hierarchy & Decorator Injection):**
   - **NEVER hard-code** URLs, ports, credentials, or API keys; **NEVER access `process.env.XXX` directly** inside Services or Controllers.
   - **Environment Override Hierarchy:** Use layered `.env` files where environment-specific files (`.env.${NODE_ENV}`, e.g., `.env.development`, `.env.production`) **override** the base `.env` file:
     ```ts
     ConfigModule.forRoot({
       isGlobal: true,
       envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
     })
     ```
   - **Decorator-Based Typed Config Injection:**
     - **NestJS (`apps/api`):** Define namespaced configurations using `registerAs` (validated at startup with Zod/class-validator) and inject them via Decorators (`@Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>` or custom config decorators in `src/common/config/`).
     - **FastAPI (`services/ai`):** Use `pydantic-settings` (`BaseSettings` with `env_file=(".env", ".env.development")`) and inject via `Depends(get_settings)`.
   - **NEVER expose** secret keys, tokens, or sensitive data in logs or API responses.
2. **Dependency Management:**
   - **DO NOT install new libraries/packages** (`pnpm add`, `uv add`, `pip install`...) without asking for and receiving explicit user approval first.
3. **Service & Module Boundaries:**
   - **Web (`apps/web`) MUST NOT call FastAPI (`services/ai`) directly.** All requests must go through NestJS (`apps/api`) for authorization checks and data anonymization.
   - **FastAPI (`services/ai`) MUST NOT contain core business logic or store identifiable child data (`fullName`, `dob`, address).** NestJS only sends anonymized tokens and minimal context to FastAPI.
   - NestJS modules **must not query another module's database tables directly**; cross-module communication must go through exported Services/Interfaces.
4. **Immutable Business Rules:**
   - **Immutability of `ActivityVersion`:** Once an `ActivityVersion` is referenced in an `ActivityAssignment` or `PlaySession`, it must not be overwritten in place; any content modification must create a new `versionNumber`.
   - **Event Idempotency:** When ingesting batches of `InteractionEvent`, always deduplicate using `eventId`.
   - **Asynchronous Processing:** Updating the evaluation chain (`CriterionEvaluation` → `CriterionState` → `SkillState` → `ChildDevelopmentProfile`) after a `PlaySession` finishes must be offloaded to a background Worker (`BullMQ`), never blocking the child's HTTP request.
   - **AI Outputs are Drafts:** All AI-generated content (`LessonPlan`, `GameContent`, `summary`) must be reviewed/approved by an adult before official publication.

---

## 6. Essential Commands (`pnpm`)

```bash
# 1. Install dependencies (run from Monorepo root)
pnpm install --frozen-lockfile     # Or: pnpm install

# 2. Start infrastructure (PostgreSQL, Qdrant, Redis, MinIO)
docker compose -f infra/docker-compose.yml up -d

# 3. Prisma commands (run from root or inside apps/api)
pnpm --filter api prisma generate
pnpm --filter api prisma migrate dev --name <migration_name>
pnpm --filter api prisma migrate deploy
pnpm --filter api prisma db seed
pnpm --filter api prisma studio

# 4. Run development servers
pnpm dev                           # Run Web + API concurrently
pnpm --filter web dev              # Run Next.js only
pnpm --filter api start:dev        # Run NestJS API only
# Run FastAPI (inside services/ai):
uv run uvicorn app.main:app --reload --port 8000

# 5. Linting & Testing
pnpm lint                          # Lint all TypeScript packages (Web + API)
pnpm test                          # Run Jest unit tests (NestJS / Next.js)
pytest                             # Run Python FastAPI tests (inside services/ai)
```

---

## 7. AI Agent Workflow

When receiving a new task from the user:
1. **Identify Scope & Architecture:** Determine which of the 7 modules the task belongs to, and whether that module uses **3-Layer Architecture** or **Clean Architecture**.
2. **Verify Domain Types:** Ensure all entity and field names strictly match **Section 3 (21 Entities)** and shared schemas in `packages/shared`.
3. **Ask Before Crossing Boundaries:** Always ask the user before installing new packages, altering the database schema, or modifying specification files (`srs_tuan06.md`).
4. **Validate After Coding:** Run relevant type-checks, linters, and unit tests to ensure zero compilation or runtime regressions.

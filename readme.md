# SpectreCommerce Backend

**The backend powering SpectreCommerce, an e-commerce platform designed to help small and growing businesses establish an online presence and manage their online sales.**

SpectreCommerce aims to simplify e-commerce for businesses that need an affordable online storefront, product management, shopping cart functionality and payment processing without having to build and maintain a custom e-commerce website.

This repository contains the backend application, API endpoints, business logic, database integration, authentication, caching and supporting infrastructure.

---

## 1. Project Overview

### About SpectreCommerce

SpectreCommerce is an e-commerce SaaS platform focused initially on the Nigerian market, with an architecture that can support businesses in other markets.

The platform is designed to provide merchants with the tools to:

- Establish and manage an online storefront.
- Manage products, categories and inventory.
- Receive and manage customer orders.
- Accept payments through supported payment providers.
- Configure store appearance and settings.
- Manage store currencies and other business preferences.

The long-term goal is to make launching and managing an online store more accessible to small and medium-sized businesses.

### Backend Responsibilities

The backend is responsible for:

- User authentication and authorization.
- Merchant and store management.
- Store-level permission enforcement.
- Product and category management.
- Shopping cart and order management.
- Payment initialization and webhook processing.
- Refund management.
- Store configuration and appearance.
- Database operations and data consistency.
- Caching and session-related operations.
- File uploads and image processing.

### Technology Stack

| Technology     | Purpose                                  |
| -------------- | ---------------------------------------- |
| Node.js 22     | JavaScript runtime                       |
| TypeScript     | Static typing                            |
| Express 5      | Backend framework                        |
| PostgreSQL 17  | Primary relational database              |
| Prisma ORM     | Database access and migrations           |
| Redis 7        | Caching and supporting application state |
| Docker         | Development environment standardization  |
| Docker Compose | Local infrastructure orchestration       |
| Cloudinary     | Image and media management               |
| GitHub Actions | Continuous integration                   |
| ESLint         | Code quality and linting                 |
| Prettier       | Code formatting                          |

---

## 2. Prerequisites

Before contributing to the project, ensure you have the following installed:

- Node.js 22 or later (Node.js 22 is the project's development baseline).
- npm.
- Docker Engine or Docker Desktop.
- Docker Compose v2.
- Git.
- A GitHub account with access to the repository.

You do not need to install PostgreSQL or Redis directly on your machine. Both services run inside Docker containers during development.

---

## 3. Getting Started

### Step 1: Clone the repository

```bash
git clone <REPOSITORY_URL>
```

Navigate into the project:

```bash
cd spectrecommerce-backend
```

### Step 2: Install dependencies

```bash
npm install
```

Docker also installs dependencies during the image build. Running this command locally is useful for IDE integration, ESLint, TypeScript support and local development tooling.

### Step 3: Configure environment variables

Create a `.env` file in the project root.

You can use `.env.example` as a reference if one is provided.

Example Docker development configuration:

```env
# Application
NODE_ENV=development
PORT=3000

# PostgreSQL
POSTGRES_DB=spectrecommerce
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_local_database_password
POSTGRES_PORT=5432

DATABASE_URL_DOCKER=postgresql://postgres:your_local_database_password@postgres:5432/spectrecommerce

# Redis
REDIS_PASSWORD=your_local_redis_password
REDIS_PORT=6379

REDIS_URL_DOCKER=redis://:your_local_redis_password@redis:6379
REDIS_URL_DOCKER=

# Add other application environment variables here
# JWT_SECRET=
# CSRF_SECRET=
# CLOUDINARY_KEY=
# CLOUDINARY_SECRET=
# CLOUDINARY_CLOUDNAME=
# CREDENTIAL_ENCRYPTION_KEY=
```

**Important environment variable notes:**

- `DATABASE_URL_DOCKER` is used by the application container to connect to PostgreSQL.
- `REDIS_URL_DOCKER` is used by the application container to connect to Redis.
- Within Docker Compose, PostgreSQL is accessible using the hostname `postgres`.
- Redis is accessible using the hostname `redis`.
- Do not use `localhost` or `127.0.0.1` for database and Redis connections from inside the application container.
- Never commit your actual `.env` file or real credentials to GitHub.

Use the appropriate credentials for your local development environment. Never reuse production credentials.

### Step 4: Start the development environment

The project uses two Docker Compose files:

- `docker-compose.yml`: Defines the application, PostgreSQL, Redis, volumes and health checks.
- `docker-compose.dev.yml`: Overrides the application command and configuration for development.

Start the application using:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The development override enables:

- Development mode.
- `npm run dev` as the application command.
- Source code bind mounting for live development.
- Persistent `node_modules` inside the container.

PostgreSQL and Redis run as separate containers.

Docker Compose waits for both services to become healthy before starting the application.

### Step 5: Access the application

Once the containers are running:

```text
http://localhost:3000
```

The application listens on port `3000`.

---

## 4. Docker Development Commands

The following commands are useful during development.

### Start containers

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Rebuild and start containers

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Run containers in the background

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### View application logs

```bash
docker compose logs -f app
```

### View all container logs

```bash
docker compose logs -f
```

### Stop containers

```bash
docker compose down
```

### Restart the application container

```bash
docker compose restart app
```

### Access the application container

```bash
docker compose exec app sh
```

### Access PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres psql -U postgres -d spectrecommerce
```

### Access Redis

```bash
docker compose exec redis sh
```

### Remove containers and volumes

```bash
docker compose down -v
```

**Warning:** Removing volumes deletes the persistent local PostgreSQL and Redis data. Do not run this command unless you intentionally want to reset your development databases.

---

## 5. Database Management

SpectreCommerce uses PostgreSQL with Prisma ORM.

Prisma is responsible for database schema management, migrations and database client generation.

### Generate Prisma Client

```bash
npm run prisma:generate
```

Alternatively:

```bash
npx prisma generate
```

### Create and apply a migration

During development:

```bash
npx prisma migrate dev --name migration_name
```

For example:

```bash
npx prisma migrate dev --name add_refund_model
```

### Apply existing migrations

```bash
npx prisma migrate deploy
```

### Check migration status

```bash
npx prisma migrate status
```

### Open Prisma Studio

```bash
npx prisma studio
```

When executing Prisma commands from your local machine, ensure the relevant database URL is configured for the local host connection.

When executing them inside Docker, use the Docker database connection URL.

**Database contribution rules:**

1. Do not modify the Prisma schema without considering the corresponding migration.
2. Commit generated migration files alongside schema changes.
3. Never modify previously committed migrations to accommodate a new feature.
4. Avoid destructive database changes without discussing their impact.
5. Use Prisma transactions when multiple related database operations must succeed or fail together.
6. Consider existing merchant and store data when changing database relationships.
7. Do not run production migrations manually without authorization.

---

## 6. Project Structure

The backend follows a modular structure. The following is an architectural guide; consult the actual repository tree for the current implementation.

```text
spectrecommerce-backend/
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   └── CODEOWNERS
│
├── generated/
│   └── prisma/
│
├── lib/
│
├── middleware/
│
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── routes/
│
├── controllers/
│
├── services/
│
├── utils/
│
├── types/
│
├── config/
│
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── eslint.config.js
├── .prettierrc
├── .prettierignore
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

The directory structure may evolve as the application grows. New modules should follow the existing project conventions rather than introducing unnecessary architectural inconsistencies.

---

## 7. Coding Standards and Guidelines

All contributors are expected to follow the project's coding standards.

### 7.1 TypeScript

- Use TypeScript for backend development.
- Define explicit types for function parameters, return values and application data structures where appropriate.
- Avoid using `any`.
- Prefer interfaces or types that accurately represent application data.
- Do not suppress TypeScript errors without a valid reason.
- Use `unknown` when handling values whose types are not yet known, and narrow them before use.
- Keep types reusable and avoid unnecessary duplication.

### 7.2 ESLint Rules

ESLint is used to enforce code quality and detect common programming mistakes.

The following rules are enforced:

- Unused imports are not allowed.
- Unused variables are not allowed.
- Intentionally unused variables should use an underscore prefix (`_`).
- Explicit `any` is not allowed.
- Duplicate imports are not allowed.
- Unreachable code is not allowed.
- `@ts-ignore` is prohibited.
- `@ts-expect-error` must include a description explaining why it is necessary.

Do not disable ESLint rules simply to make the CI pipeline pass.

If a rule produces a legitimate false positive, discuss it before changing the configuration.

### 7.3 Prettier Formatting

Prettier is the project's formatting standard.

Current formatting configuration:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "useTabs": false,
  "trailingComma": "all",
  "printWidth": 80,
  "bracketSpacing": true,
  "endOfLine": "lf"
}
```

All committed code should follow this configuration.

Avoid manually formatting files differently from the established project style.

### 7.4 Naming Conventions

Use descriptive names that communicate the purpose of variables, functions and modules.

General guidelines:

- Use camelCase for variables and functions.
- Use PascalCase for classes, types and React-style components where applicable.
- Use descriptive names for middleware and service functions.
- Use UPPER_SNAKE_CASE for environment variables and constants where appropriate.
- Avoid unnecessarily abbreviated variable names.
- Keep function names descriptive and action-oriented.

Follow existing naming conventions in the relevant module when extending existing functionality.

### 7.5 Error Handling

- Handle asynchronous errors properly.
- Do not silently swallow exceptions.
- Return appropriate HTTP status codes.
- Avoid exposing internal stack traces or sensitive application information to clients.
- Use consistent API response structures.
- Log useful information for debugging without logging secrets or sensitive customer data.

### 7.6 Authentication and Authorization

Security is a core requirement.

- Protected routes must use the appropriate authentication middleware.
- Store-level operations must enforce the relevant store permissions.
- Never assume that an authenticated user is authorized to access every store.
- Validate resource ownership and access permissions.
- Do not trust user-provided identifiers without checking authorization.
- Do not expose passwords, authentication tokens or secrets in API responses.
- Preserve existing CSRF protection requirements for applicable authenticated requests.

### 7.7 Input Validation

Validate incoming request data before processing it.

- Validate request bodies.
- Validate route parameters.
- Validate query parameters.
- Validate uploaded files.
- Validate currency and monetary values.
- Validate resource ownership and permissions.

Use the project's existing validation conventions and middleware rather than introducing inconsistent validation approaches.

### 7.8 Database Operations

- Use Prisma for database interactions.
- Avoid unnecessary database queries.
- Use transactions for operations that require atomicity.
- Consider database constraints when designing new features.
- Handle missing records and database errors appropriately.
- Avoid fetching unnecessary fields.
- Consider caching where appropriate.
- Never expose internal database implementation details in API responses.

### 7.9 File Uploads

File uploads must be handled through the established upload middleware and Cloudinary integration.

- Validate file types and sizes.
- Do not rely solely on file extensions or client-provided MIME types.
- Handle missing files safely.
- Apply appropriate image optimization where applicable.
- Use consistent Cloudinary folder structures.
- Handle upload failures and cleanup appropriately.
- Do not expose Cloudinary credentials.

### 7.10 Payments and Financial Operations

Payment-related functionality requires additional care.

- Never expose payment provider secret keys.
- Verify payment webhooks using the appropriate provider verification mechanism.
- Do not trust payment status supplied by the frontend.
- Validate payment amounts and currencies.
- Ensure webhook processing is idempotent.
- Avoid processing the same payment or refund multiple times.
- Use transactions where financial state changes require atomicity.
- Preserve accurate order and payment records.

Changes to payment, checkout, webhook and refund functionality should receive particular attention during code review.

---

## 8. Git Workflow and Branching Strategy

The project uses a branch-based development workflow.

### Main branches

| Branch    | Purpose                             |
| --------- | ----------------------------------- |
| `main`    | Stable, production-ready code       |
| `staging` | Integration and pre-release testing |

### Feature branches

New features and improvements should be developed on separate branches.

Examples:

```text
feature/product-management
feature/refund-processing
feature/store-currency
feature/payment-webhooks
```

Bug fixes should use:

```text
fix/cart-validation
fix/payment-verification
```

### Contribution workflow

1. Pull the latest changes from `staging`.
2. Create a feature branch from `staging`.
3. Implement the assigned feature or fix.
4. Test your changes locally.
5. Run ESLint, Prettier and TypeScript checks.
6. Commit your changes using descriptive commit messages.
7. Push your feature branch.
8. Open a pull request targeting `staging`.
9. Address review feedback.
10. Merge only after the required checks and approvals are satisfied.

### Pull requests into main

The `main` branch is reserved for stable code.

Changes should follow this path:

```text
feature branch
      |
      v
   staging
      |
      v
     main
```

Pull requests targeting `main` must originate from `staging`.

Direct pushes to `main` and `staging` are not part of the project's contribution workflow.

---

## 9. Continuous Integration (GitHub Actions)

The repository uses GitHub Actions to automatically validate code quality.

The CI workflow runs on:

- Pushes to `main`.
- Pushes to `staging`.
- Pull requests targeting `main`.
- Pull requests targeting `staging`.
- Manual workflow dispatch.

### Automated checks

The CI pipeline currently performs the following operations:

| Check                    | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| Dependency installation  | Ensures dependencies install successfully     |
| Prisma Client generation | Ensures the Prisma Client can be generated    |
| Prettier                 | Verifies formatting consistency               |
| ESLint                   | Detects code quality issues                   |
| TypeScript               | Checks for type errors                        |
| Production build         | Ensures the application compiles successfully |

All required checks must pass before a protected branch can accept a pull request.

### Running checks locally

Before pushing changes, run:

```bash
npm run format:check
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run prisma:generate
```

Build the application:

```bash
npm run build
```

To automatically fix supported ESLint issues:

```bash
npm run lint:fix
```

To format files:

```bash
npm run format
```

Do not rely exclusively on automatic fixes. Always rerun the checks after making changes.

---

## 10. Branch Protection and Repository Rules

The repository uses GitHub Rulesets to protect important branches.

### Main branch

The `main` branch should have:

- Pull requests required before merging.
- Required CI status checks.
- Branches up to date before merging.
- Conversation resolution before merging.
- Force pushes blocked.
- Deletions restricted.

### Staging branch

The `staging` branch should have:

- Pull requests required before merging.
- Required CI status checks.
- Branches up to date before merging.
- Conversation resolution before merging.
- Force pushes blocked.
- Deletions restricted.

During the initial solo development phase, approval counts may remain at zero to avoid blocking the repository owner from merging their own changes.

As the team grows, review requirements will be strengthened.

---

## 11. Environment and Security Guidelines

Security is everyone's responsibility.

The following rules must be observed:

1. Never commit `.env` files.
2. Never commit API keys, passwords, private tokens or credentials.
3. Never hardcode secrets in application code.
4. Use environment variables for sensitive configuration.
5. Do not expose internal error details to API consumers.
6. Do not bypass authentication or authorization middleware.
7. Do not disable security checks to make a feature work.
8. Do not commit generated dependencies or `node_modules`.
9. Do not introduce dependencies without considering their maintenance and security implications.
10. Report accidentally exposed credentials immediately and rotate them.

A `.env.example` file should be maintained to document required environment variable names without exposing real values.

---

## 12. Testing Strategy

Automated route and integration testing will be introduced progressively as the application develops.

The initial CI pipeline focuses on:

- Code formatting.
- Linting.
- Type safety.
- Prisma Client generation.
- Successful compilation.

Future testing should cover:

- Authentication and authorization.
- Store management and permissions.
- Product management.
- Cart operations.
- Checkout and payment initialization.
- Payment webhook processing.
- Order management.
- Refund processing.
- File uploads.
- Currency and pricing validation.

Contributors should still manually test their changes before submitting pull requests.

Passing CI checks does not automatically mean the feature's business logic is correct.

---

## 13. Contribution Expectations

Every contributor is expected to:

- Understand the existing implementation before modifying it.
- Avoid unnecessary architectural changes.
- Write readable and maintainable code.
- Follow the established coding standards.
- Test changes before opening pull requests.
- Provide clear pull request descriptions.
- Explain important implementation decisions.
- Address review comments constructively.
- Avoid introducing unrelated changes into feature branches.
- Communicate potential breaking changes before implementation.

For larger features, discuss the implementation approach before writing significant amounts of code.

The objective is to maintain a consistent and reliable backend as the platform grows.

---

## 14. Development Philosophy

SpectreCommerce is being developed incrementally.

The priority is to build a reliable, secure and maintainable product rather than introduce unnecessary complexity prematurely.

Contributors should prioritize:

- Correctness over shortcuts.
- Security over convenience.
- Maintainability over clever implementations.
- Clear architecture over unnecessary abstraction.
- Data integrity over premature optimization.
- Consistency over individual coding preferences.

Technical decisions should support the long-term maintainability and scalability of the platform.

---

## 15. API Documentation

API endpoint documentation, request examples, response structures, authentication requirements and Postman collections will be maintained separately.

Refer to the project's API documentation when available.

---

## Final Note

Welcome to SpectreCommerce.

Every contribution should help move the platform towards becoming a reliable and accessible e-commerce solution for businesses.

Build thoughtfully. Write maintainable code. Review carefully. Protect customer and merchant data.

**Let's build something solid.**

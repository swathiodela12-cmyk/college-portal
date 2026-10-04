# Vaagdegi Colleges — College Management & Student Portfolio Platform

A production-ready, full-stack platform for managing student records, attendance, academics,
achievements, internships, placements, campus events, and communications — with role-based
dashboards for Super Admins, Admins, Faculty, and Students.

**Stack:** React 18 + Vite + TypeScript + Tailwind CSS · Node.js + Express + TypeScript · PostgreSQL + Prisma · JWT auth

---

## 1. Features

### Platform-wide
- JWT authentication (access + refresh tokens) with automatic silent refresh
- Role-based access control: `SUPER_ADMIN`, `ADMIN`, `FACULTY`, `STUDENT`
- Students can only view/edit their own permitted data; staff can manage all records
- Search, filter, sort, and pagination on every list view
- CSV export for the student directory
- File uploads (documents/certificates) with type & size validation
- In-app notifications with unread counts
- Responsive, accessible UI with loading skeletons, empty states, and toasts

### Modules
| Module | Description |
|---|---|
| Students | Full profile management, self-registration, staff-managed creation |
| Attendance | Daily marking (bulk), per-student analytics, class-wide dashboards, 75% threshold alerts |
| Academic Records | Semester-wise grades, auto-computed SGPA/CGPA |
| Achievements / Awards / Certifications / Internships | Student self-submission + staff approval workflow (Pending/Approved/Rejected) |
| Programs & Events | Event creation, capacity, student registration/participation tracking |
| Placements | Application pipeline (Applied → Joined), package & analytics |
| Announcements | Targeted broadcast (All/Students/Faculty/Admins), pinning, auto-notifications |
| Documents | Per-student file uploads with verification status |
| Contacts | Public enquiry form + staff resolution workflow |
| Notifications | Per-user notification center |
| Reports & Analytics | Dashboard KPIs, department distribution, grade distribution, placement funnel, attendance leaders |

---

## 2. Project Structure

```
vaagdegi-portal/
├── backend/                 # Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma    # Full data model (17 models)
│   │   └── seed.ts          # Realistic demo data generator
│   ├── src/
│   │   ├── app.ts           # Express app assembly
│   │   ├── server.ts        # Entry point
│   │   ├── config/          # Env loading
│   │   ├── lib/              # Prisma client, logger
│   │   ├── middleware/       # auth, RBAC, validation, upload, error handling
│   │   ├── routes/           # One router per resource
│   │   └── utils/            # JWT, ApiError, pagination, CSV, approval-resource factory
│   ├── .env.example
│   └── Dockerfile
├── frontend/                 # React + Vite + TypeScript
│   ├── src/
│   │   ├── api/               # Axios client with refresh-token interceptor
│   │   ├── components/        # Layouts, DataTable, Modal, primitives
│   │   ├── context/            # AuthContext
│   │   ├── hooks/               # Table state, debouncing
│   │   ├── pages/admin/          # Admin/Faculty console pages
│   │   ├── pages/student/         # Student portal pages
│   │   ├── routes/                 # Route guards
│   │   └── types/                   # Shared TypeScript types
│   ├── .env.example
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 3. Prerequisites

- Node.js 20+
- PostgreSQL 14+ (or use the provided `docker-compose.yml`)
- npm 10+

---

## 4. Getting Started (Local Development)

### 4.1 Start PostgreSQL

Using Docker (recommended):
```bash
docker compose up -d postgres
```
Or point `DATABASE_URL` at any existing PostgreSQL instance.

### 4.2 Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT secrets, etc.

npm install
npx prisma generate
npx prisma migrate dev --name init   # creates tables
npm run seed                          # populates realistic demo data
npm run dev                           # starts API on http://localhost:4000
```

### 4.3 Frontend Setup

```bash
cd frontend
cp .env.example .env   # optional for local dev — Vite proxies /api automatically
npm install
npm run dev             # starts app on http://localhost:5173
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` and `/uploads` to the backend.

### 4.4 Demo Credentials (created by the seed script)

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@vaagdegi.edu` | `SuperAdmin@123` |
| Admin | `admin@vaagdegi.edu` | `Admin@123` |
| Faculty | `faculty1@vaagdegi.edu` | `Faculty@123` |
| Student | `student1@vaagdegi.edu` | `Student@123` |

---

## 5. Running with Docker Compose (full stack)

```bash
docker compose up -d --build
```
This starts PostgreSQL, the backend API (migrations run automatically on boot), and the frontend
served via Nginx (which proxies `/api` and `/uploads` to the backend container).

Then run the seed once against the running backend container:
```bash
docker compose exec backend npm run seed
```

---

## 6. Role Permissions Summary

| Action | Super Admin | Admin | Faculty | Student |
|---|:---:|:---:|:---:|:---:|
| Manage students (CRUD) | ✅ | ✅ | View/mark only | Own profile (limited fields) |
| Mark attendance | ✅ | ✅ | ✅ | — |
| Add academic records | ✅ | ✅ | ✅ | View own only |
| Approve achievements/awards/etc. | ✅ | ✅ | ✅ | Submit own only |
| Manage events/programs | ✅ | ✅ | ✅ | Register/view only |
| Manage placements | ✅ | ✅ | ✅ | Log own applications |
| Publish announcements | ✅ | ✅ | ✅ | View only |
| Create Admin accounts | ✅ | — | — | — |
| Create Faculty accounts | ✅ | ✅ | — | — |
| View reports & analytics | ✅ | ✅ | ✅ | — |

Enforcement happens **server-side** in Express middleware (`authenticate`, `authorize`,
`authorizeSelfOrStaff`) — the frontend route guards are a UX convenience, not the security boundary.

---

## 7. API Overview

All endpoints are prefixed with `/api`. Authenticated requests require `Authorization: Bearer <accessToken>`.

```
POST   /auth/register            Self-register as a student
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me

GET    /students                 (search, filter, sort, paginate)
GET    /students/export          CSV export
GET    /students/:id
POST   /students                 (staff)
PATCH  /students/:id
DELETE /students/:id             (staff)

POST   /attendance/mark          (bulk, staff)
GET    /attendance/student/:id
GET    /attendance/student/:id/summary
GET    /attendance/analytics/overview   (staff)

GET/POST/PATCH/DELETE /academics, /academics/student/:id

GET/POST/PATCH/DELETE  /achievements, /awards, /certifications, /internships
PATCH  /{resource}/:id/status     Approve/Reject (staff)

GET/POST/PATCH/DELETE /programs, /events
POST   /events/:id/register
GET    /participations/student/:id

GET/POST/PATCH/DELETE /placements
GET    /placements/analytics/overview   (staff)

GET/POST/PATCH/DELETE /announcements
GET/POST /documents/student/:id
PATCH  /documents/:id/verify      (staff)

POST   /contacts                  (public)
GET/PATCH/DELETE /contacts        (staff)

GET/PATCH/DELETE /notifications

GET    /reports/dashboard
GET    /reports/students-by-department
GET    /reports/grade-distribution

GET/POST/PATCH/DELETE /departments
GET/POST/PATCH/DELETE /users      (Super Admin / Admin — staff account management)
```

---

## 8. Design System

The UI follows a distinctive "academic ledger" identity built for Vaagdegi:

- **Palette:** deep indigo/navy (`#101B34`) paired with an academic gold accent (`#C6A15B`)
- **Typography:** Fraunces (display serif) for headings, Inter for body/data, JetBrains Mono for credentials
- **Components:** reusable `DataTable` (search/sort/filter/paginate/export), `Modal`, `StatCard`,
  `StatusBadge`, skeleton loaders, and toast notifications throughout

---

## 9. Production Notes

- Set strong, unique values for `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (e.g. `openssl rand -base64 48`)
- Put the backend behind HTTPS; set `CORS_ORIGIN` to your real frontend origin
- Use managed PostgreSQL (RDS, Cloud SQL, Supabase, etc.) and set `DATABASE_URL` accordingly
- Move uploaded files to object storage (S3/GCS) for horizontal scaling — the current implementation
  uses local disk storage under `UPLOAD_DIR`, suitable for single-instance deployments
- Run `npx prisma migrate deploy` (not `migrate dev`) in production
- Consider adding a CDN in front of the frontend build output

---

## 10. License

Proprietary — built for Vaagdegi Colleges.

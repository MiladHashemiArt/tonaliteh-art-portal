# Lovable-independent development and delivery plan

## Goal

Continue building Tonaliteh without requiring Lovable credits. The repository is the source of truth; Lovable is optional, not a dependency.

## Development workflow

1. Keep all application source, tests, migrations, and technical decisions in this GitHub repository.
2. On the Windows laptop, use Dyad (free/local/open-source) or VS Code to open the existing repository. Do not create a separate project or overwrite the current source.
3. Use a local model through Ollama when hardware supports it, or another provider/model as an optional assistant. Local models avoid per-request API charges but depend on local hardware and may be less capable/slower.
4. Make changes on a feature branch, run tests and production build locally, push the branch, and open a pull request.
5. Review migrations and security changes before applying anything to Supabase. Never apply unreviewed SQL to production.
6. Keep environment secrets in local environment files or deployment secret stores; never commit service-role keys, database passwords, or push credentials.

## Current project services

- GitHub: source control, review, issue tracking, and backups of source history.
- Supabase: Postgres, authentication, storage, and server-side functions. The free tier is useful for development, but has quotas, pauses after inactivity, and no automatic backups. It is not a production reliability guarantee.
- Lovable: optional visual AI builder. The application must remain buildable and maintainable without it.

## Deployment options

### Development / preview

- Run the app locally on the Windows laptop.
- Use Supabase development project and test accounts.
- Use pull-request checks for typecheck, unit tests, and production build.

### Public commercial launch

- Do not assume a free hobby hosting tier is suitable for a revenue-generating service. For example, Vercel's Hobby plan is restricted to personal, non-commercial use.
- Before launch, select a hosting provider whose terms explicitly permit commercial use, configure a custom domain and HTTPS, and budget for reliable database hosting, backups, monitoring, and transactional notification delivery.
- A local laptop or free preview deployment is not an appropriate always-on production host for students and staff.
- Keep a restore procedure and test database backups before accepting real student/payment data.

## Definition of done before launch

- CI passes: lint/typecheck, unit tests, integration tests, and production build.
- Reviewed database migrations are applied to the intended project.
- RLS and RPC authorization are tested for student, teacher, and manager roles.
- Push notifications are tested on real devices; in-app notifications remain available if push is disabled.
- Backup/restore and incident recovery are documented.
- Commercial hosting and service terms are confirmed.

## Cost principle

Keep development cost near zero where practical, but do not promise that a reliable commercial production system can run forever at zero cost. The first launch can be lean; database reliability, backups, domain, and hosting may eventually require a modest operating budget.

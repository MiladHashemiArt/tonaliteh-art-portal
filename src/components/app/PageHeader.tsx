import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export function PageHeader({
  title,
  description,
  back,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  back?: { to: string; label?: string };
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-8 animate-rise">
      {back && (
        <Link
          to={back.to}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden />
          {back.label ?? "بازگشت"}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <p className="mb-1 text-xs font-medium tracking-wide text-bronze">{eyebrow}</p>
          )}
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mb-10 animate-rise">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

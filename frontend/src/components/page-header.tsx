import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  variant = "default",
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  icon?: React.ComponentType<{ className?: string }>
  variant?: "default" | "banner"
  className?: string
}) {
  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex flex-col gap-4 rounded-2xl bg-banner px-5 py-5 text-banner-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6",
          className,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-white/75">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  className,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: "blue" | "purple" | "rose" | "green" | "amber" | "slate"
  className?: string
}) {
  const toneClass = {
    blue: "stat-card-blue",
    purple: "stat-card-purple",
    rose: "stat-card-rose",
    green: "stat-card-green",
    amber: "stat-card-amber",
    slate: "stat-card-slate",
  }[tone]

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-5 shadow-xs",
        toneClass,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-black/20">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint ? (
        <p className="text-xs font-medium opacity-70">{hint}</p>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

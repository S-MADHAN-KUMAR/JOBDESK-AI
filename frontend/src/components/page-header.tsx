import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  eyebrow,
  variant = "default",
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  icon?: React.ComponentType<{ className?: string }>
  eyebrow?: string
  variant?: "default" | "banner"
  className?: string
}) {
  if (variant === "banner") {
    return (
      <div
        className={cn(
          "promo-card-bg flex flex-col gap-4 rounded-2xl px-5 py-5 text-banner-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6",
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
            {eyebrow ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-display text-xl tracking-tight sm:text-2xl">
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
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl tracking-tight text-foreground sm:text-[28px]">
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
  tone = "blue",
  delta,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: "blue" | "purple" | "rose" | "green" | "amber" | "slate"
  delta?: string
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
        "bento-tile flex flex-col gap-3 p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-meta text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass)}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="stat-num font-display text-[32px] text-foreground">{value}</p>
      <div className="mt-auto flex items-center gap-2">
        {delta ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-primary">
            {delta}
          </span>
        ) : null}
        {hint ? (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}

export function BarList({
  items,
  className,
}: {
  items: { label: string; value: number; display?: string }[]
  className?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((n, i) => n + i.value, 0)
  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-y-1">
        <p className="text-meta text-muted-foreground">By segment</p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {total.toLocaleString()} total
        </p>
      </div>
      <ul className="mt-4 space-y-3.5">
        {items.map((item) => (
          <li key={item.label}>
            <p className="flex items-baseline justify-between text-[13px]">
              <span className="truncate text-foreground">{item.label}</span>
              <span className="ml-3 shrink-0 font-mono tabular-nums text-muted-foreground">
                {item.display ?? item.value.toLocaleString()}
              </span>
            </p>
            <div className="bar-track mt-1.5" aria-hidden>
              <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
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
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

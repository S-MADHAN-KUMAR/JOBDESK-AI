import type { ReactNode } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Layers,
  TrendingUp,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  {
    icon: BriefcaseBusiness,
    title: "Job Explorer",
    description: "Trace every raw posting",
  },
  {
    icon: TrendingUp,
    title: "Demand Trends",
    description: "7 / 30 / 60 / 90-day movement",
  },
  {
    icon: Layers,
    title: "Skill Intelligence",
    description: "Role x technology matrices",
  },
  {
    icon: Building2,
    title: "Employer Signals",
    description: "Hiring patterns by company",
  },
] as const;

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg lg:grid-cols-[1.05fr_1fr]">
        {/* Lead tile — split-studio: atmospheric panel + bento highlight tiles */}
        <div className="promo-card-bg flex flex-col gap-6 p-6 text-banner-foreground sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg tracking-tight">JOBDESK-AI</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">
              Sign in · role-based workspace
            </p>
            <h1 className="font-display max-w-[20ch] text-3xl leading-[1.05] tracking-tight text-balance sm:text-4xl">
              Demand intelligence for hiring teams.
            </h1>
            <p className="max-w-[44ch] text-sm leading-relaxed text-white/70">
              Explore postings, track demand shifts, and brief
              market, training, and recruitment teams — from one live overview.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-sm"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/12">
                  <item.icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{item.title}</span>
                  <span className="text-xs leading-relaxed text-white/65">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-6 border-t border-white/10 pt-4">
            {[
              { v: "Live", l: "Pipeline" },
              { v: "7–90d", l: "Trends" },
              { v: "5 roles", l: "Access" },
            ].map((s) => (
              <div key={s.l}>
                <p className="stat-num font-display text-xl">{s.v}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-white/55">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form side — inline-minimal header row: title left, theme utility right */}
        <div className="relative flex flex-col gap-6 p-6 sm:p-8">
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
            <ThemeToggle />
          </div>
          <div className="flex flex-col gap-1 pt-6 sm:pt-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Welcome back
            </p>
            <h2 className="font-display text-2xl tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          {children}
          {footer ? (
            <div className="mt-auto border-t border-border pt-4 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

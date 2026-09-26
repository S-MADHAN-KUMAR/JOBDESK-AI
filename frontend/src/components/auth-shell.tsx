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
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm lg:grid-cols-[1.05fr_1fr]">
        {/* Lead tile — bento composition: lead idea + supporting tiles */}
        <div className="flex flex-col gap-6 bg-banner p-6 text-banner-foreground sm:p-8">
          <p className="text-lg font-bold tracking-tight">JOBDESK-AI</p>
          <div className="flex flex-col gap-2">
            <h1 className="max-w-[20ch] text-3xl font-bold leading-[1.05] tracking-tight text-balance sm:text-4xl">
              Demand intelligence for hiring teams.
            </h1>
            <p className="max-w-[44ch] text-sm leading-relaxed text-white/75">
              Sign in to explore postings, track demand shifts, and brief
              market, training, and recruitment teams.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-xl bg-white/10 p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <item.icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{item.title}</span>
                  <span className="text-xs leading-relaxed text-white/70">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-2 font-mono text-[11px] tracking-wide text-white/60">
            Role-based access · Admin / Analyst / Training / Recruitment
          </p>
        </div>

        {/* Form side — inline-minimal header row: title left, theme utility right */}
        <div className="relative flex flex-col gap-6 p-6 sm:p-8">
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
            <ThemeToggle />
          </div>
          <div className="flex flex-col gap-1 pt-6 sm:pt-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          {children}
          {footer ? (
            <div className="mt-auto border-t border-border/60 pt-4 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut, Menu as MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { ROLE_LABELS, type User, logout } from "@/lib/api"

function getInitials(user: User): string {
  const name = `${user.first_name} ${user.last_name}`.trim()
  if (name) {
    return name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  }
  return user.username.slice(0, 2).toUpperCase()
}

function displayName(user: User): string {
  const name = `${user.first_name} ${user.last_name}`.trim()
  return name || user.username
}

export function Navbar({
  user,
  onMenuClick,
}: {
  user: User
  onMenuClick: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isDashboard = pathname === "/"

  async function handleLogout() {
    await logout()
    router.push("/login")
  }

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border/80 bg-card">
      <div className="flex h-full w-full items-center gap-3 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <MenuIcon />
        </Button>

        <div className="min-w-0 flex-1">
          {isDashboard ? (
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Welcome back, {displayName(user)}!
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Here&apos;s your demand intelligence overview.
              </p>
            </div>
          ) : (
            <p className="truncate text-sm text-muted-foreground lg:hidden">
              DemandAccel AI
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />

          <div className="ml-1 hidden items-center gap-2.5 border-l border-border pl-3 sm:flex">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-banner text-xs font-bold text-banner-foreground">
              {getInitials(user)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {displayName(user)}
              </p>
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive lg:hidden"
            onClick={handleLogout}
            aria-label="Sign out"
          >
            <LogOut className="size-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}

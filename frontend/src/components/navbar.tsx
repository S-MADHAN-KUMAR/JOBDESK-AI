"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut, Menu as MenuIcon, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { ROLE_LABELS, type User, logout } from "@/lib/api"
import { NAV_GROUPS } from "@/components/sidebar"

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

function getPageTitle(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))) {
        return item.label
      }
    }
  }
  return "DemandAccel AI"
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

  async function handleLogout() {
    await logout()
    router.push("/login")
  }

  const title = getPageTitle(pathname)

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <MenuIcon />
        </Button>

        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 lg:hidden"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-3.5" />
          </span>
        </Link>

        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="text-sm text-muted-foreground">DemandAccel AI</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate text-sm font-semibold tracking-tight">
            {title}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-3 text-[10px] font-bold text-primary-foreground">
              {getInitials(user)}
            </span>
            <span className="hidden text-sm font-medium xl:block">
              {user.first_name || user.username}
            </span>
          </div>
          <span className="hidden rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground md:block">
            {ROLE_LABELS[user.role]}
          </span>
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="hidden sm:inline-flex"
            data-icon="inline-start"
          >
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
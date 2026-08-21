"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, LogOut, Menu as MenuIcon, Search, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-full w-full items-center gap-4 px-4 sm:px-6">
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
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </span>
        </Link>

        <div className="flex flex-col min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Get the latest update for 7 days
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden md:flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 w-64">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Type here to search"
              className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-xl text-muted-foreground hover:text-foreground"
          >
            <Bell className="size-5" />
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
          </Button>

          <ThemeToggle />

          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-muted-foreground hover:text-foreground lg:hidden"
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

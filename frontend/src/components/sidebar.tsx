"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Drawer } from "@base-ui/react/drawer"
import {
  BriefcaseBusiness,
  Cable,
  ContactRound,
  LayoutDashboard,
  LogOut,
  UserSearch,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROLE_LABELS, type User, logout } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles: User["role"][]
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const ALL_ROLES: User["role"][] = [
  "ADMIN",
  "MARKET_ANALYST",
  "CEO_MANAGEMENT",
  "TRAINING_MANAGER",
  "RECRUITMENT_TEAM",
]

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main Menu",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
      {
        href: "/jobs",
        label: "Job Explorer",
        icon: BriefcaseBusiness,
        roles: ["ADMIN", "MARKET_ANALYST"],
      },
      {
        href: "/enrichment",
        label: "Enrichment",
        icon: UserSearch,
        roles: ["ADMIN", "MARKET_ANALYST"],
      },
      { href: "/admin/users", label: "User Management", icon: Users, roles: ["ADMIN"] },
      { href: "/admin/sources", label: "Source Management", icon: Cable, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Other Menu",
    items: [
      {
        href: "/admin/enrichment-sources",
        label: "Enrichment Sources",
        icon: ContactRound,
        roles: ["ADMIN"],
      },
    ],
  },
]

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

function SidebarNav({
  user,
  onNavigate,
}: {
  user: User
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme } = useTheme()

  async function handleLogout() {
    await logout()
    router.push("/login")
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href))

  const logoSrc = theme === "dark" ? "/dark-theme-logo.png" : "/light-theme-logo.png"

  return (
    <div className="flex h-full flex-col bg-card">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5"
      >
        <img
          src={logoSrc}
          alt="DemandAccel AI"
          className="h-8 w-auto object-contain"
        />
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(user.role))
          if (items.length === 0) return null
          return (
            <div key={group.label}>
              <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-200",
                        active
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-[18px] shrink-0 transition-colors",
                          active && "text-primary-foreground",
                        )}
                      />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 px-3 pb-3">
        <div className="rounded-2xl promo-card-bg p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold">Unlimited Access</p>
              <p className="mt-1 text-xs text-white/80">
                Get full access to all features and priority support
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full bg-white/20 text-white hover:bg-white/30 border-white/20"
          >
            Upgrade Now
          </Button>
        </div>
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {getInitials(user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {user.first_name || user.username}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start gap-2.5 rounded-xl text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleLogout}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}

export function Sidebar({
  user,
  drawerOpen,
  onDrawerOpenChange,
}: {
  user: User
  drawerOpen: boolean
  onDrawerOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar shadow-sm lg:block">
        <SidebarNav user={user} />
      </aside>

      <Drawer.Root
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        swipeDirection="left"
        modal
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <Drawer.Popup className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-sidebar shadow-xl ring-1 ring-sidebar-border">
            <SidebarNav user={user} onNavigate={() => onDrawerOpenChange(false)} />
          </Drawer.Popup>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

export { NAV_GROUPS }

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
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROLE_LABELS, type User, logout } from "@/lib/api"
import { cn } from "@/lib/utils"

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
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
    ],
  },
  {
    label: "Analysis",
    items: [
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
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "User Management", icon: Users, roles: ["ADMIN"] },
      { href: "/admin/sources", label: "Source Management", icon: Cable, roles: ["ADMIN"] },
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

  async function handleLogout() {
    await logout()
    router.push("/login")
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href))

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Zap className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          DemandAccel AI
        </span>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(user.role))
          if (items.length === 0) return null
          return (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-foreground/60 uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active &&
                          "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active && "text-primary",
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

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-3 text-[11px] font-bold text-primary-foreground">
            {getInitials(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {user.first_name || user.username}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleLogout}
          data-icon="inline-start"
        >
          <LogOut data-icon="inline-start" />
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-sidebar-border bg-sidebar lg:block">
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
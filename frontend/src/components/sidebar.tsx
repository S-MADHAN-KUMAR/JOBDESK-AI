"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Drawer } from "@base-ui/react/drawer"
import { motion, AnimatePresence } from "framer-motion"
import {
  BriefcaseBusiness,
  Cable,
  ContactRound,
  LayoutDashboard,
  LogOut,
  BarChart3,
  Tags,
  UserSearch,
  Users,
  TrendingUp,
  Layers,
  Building2,
  ChevronDown,
  Database,
  GitBranch,
  Settings,
  Bell,
  ShieldCheck,
  Gauge,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { type User, logout } from "@/lib/api"
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
  collapsible?: boolean
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
    label: "Main",
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
    ],
  },
  {
    label: "Administration",
    collapsible: true,
    items: [
      {
        href: "/admin/users",
        label: "User Management",
        icon: Users,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/sources",
        label: "Source Management",
        icon: Cable,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/ingestion",
        label: "Ingestion Runs",
        icon: Database,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/pipeline",
        label: "Pipeline Health",
        icon: GitBranch,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/taxonomy",
        label: "Taxonomy & Masters",
        icon: Tags,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/enrichment-sources",
        label: "Enrichment Sources",
        icon: ContactRound,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings,
        roles: ["ADMIN"],
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        roles: ALL_ROLES.filter((role) => role !== "ADMIN"),
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        href: "/ceo",
        label: "Executive Summary",
        icon: BarChart3,
        roles: ["ADMIN", "CEO_MANAGEMENT"],
      },
      {
        href: "/trends",
        label: "Demand Trends",
        icon: TrendingUp,
        roles: ["ADMIN", "MARKET_ANALYST"],
      },
      {
        href: "/training",
        label: "Skill Intelligence",
        icon: Layers,
        roles: ["ADMIN", "TRAINING_MANAGER"],
      },
      {
        href: "/recruitment",
        label: "Employer Intelligence",
        icon: Building2,
        roles: ["ADMIN", "RECRUITMENT_TEAM"],
      },
      {
        href: "/alerts",
        label: "Market Alerts",
        icon: Bell,
        roles: ALL_ROLES,
      },
      {
        href: "/demand",
        label: "Demand Scores",
        icon: Gauge,
        roles: ["ADMIN", "MARKET_ANALYST"],
      },
      {
        href: "/quality",
        label: "Data Quality",
        icon: ShieldCheck,
        roles: ["ADMIN", "MARKET_ANALYST"],
      },
    ],
  },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/jobs") {
    return pathname === "/jobs" || /^\/jobs\/[^/]+$/.test(pathname)
  }
  return pathname === href || (href !== "/" && pathname.startsWith(href))
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <item.icon
        className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-80")}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="min-w-0 truncate leading-none">{item.label}</span>
    </Link>
  )
}

function CollapsibleGroup({
  group,
  user,
  pathname,
  onNavigate,
  defaultOpen = false,
}: {
  group: NavGroup
  user: User
  pathname: string
  onNavigate?: () => void
  defaultOpen?: boolean
}) {
  const items = group.items.filter((item) => item.roles.includes(user.role))
  const hasActive = items.some((item) => isActivePath(pathname, item.href))
  const [open, setOpen] = useState(defaultOpen || hasActive)

  useEffect(() => {
    if (hasActive) setOpen(true)
  }, [hasActive])

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-7 w-full items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
          hasActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left leading-none">
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <div className="mx-3 border-t border-border/80" />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 pt-1">
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActivePath(pathname, item.href)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
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

  const logoSrc =
    theme === "dark" ? "/image.png" : "/image.png"

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-16 shrink-0 items-end p-4 gap-1"
      >
        <img
          src={logoSrc}
          alt="DemandAccel AI"
          className="h-8 w-auto object-contain"
        />
        <h1 className="text-2xl font-bold text-[#27A77C]"> emand Accel</h1>
      </Link>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3 pt-1">
        {NAV_GROUPS.map((group) => {
          if (group.collapsible) {
            return (
              <CollapsibleGroup
                key={group.label}
                group={group}
                user={user}
                pathname={pathname}
                onNavigate={onNavigate}
                defaultOpen={group.items.some((item) =>
                  isActivePath(pathname, item.href),
                )}
              />
            )
          }

          const items = group.items.filter((item) =>
            item.roles.includes(user.role),
          )
          if (items.length === 0) return null

          return (
            <div key={group.label} className="flex flex-col gap-1.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </p>
              <div className="mx-3 border-t border-border/80" />
              <div className="flex flex-col gap-0.5 pt-1">
                {items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-start gap-3 rounded-xl px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
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
            <SidebarNav
              user={user}
              onNavigate={() => onDrawerOpenChange(false)}
            />
          </Drawer.Popup>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

export { NAV_GROUPS }

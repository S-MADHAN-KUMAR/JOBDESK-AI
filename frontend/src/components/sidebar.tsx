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
  Settings,
  Shield,
  BarChart3,
  Tags,
  UserSearch,
  Users,
  TrendingUp,
  Layers,
  Building2,
  ChevronRight,
  Database,
  GitBranch,
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
    ],
  },
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
    ],
  },
  {
    label: "CEO / Management",
    items: [
      {
        href: "/ceo",
        label: "Executive Summary",
        icon: BarChart3,
        roles: ["ADMIN", "CEO_MANAGEMENT"],
      },
    ],
  },
  {
    label: "Market Analyst",
    items: [
      {
        href: "/trends",
        label: "Demand Trends",
        icon: TrendingUp,
        roles: ["ADMIN", "MARKET_ANALYST"],
      },
    ],
  },
  {
    label: "Training Manager",
    items: [
      {
        href: "/training",
        label: "Skill Intelligence",
        icon: Layers,
        roles: ["ADMIN", "TRAINING_MANAGER"],
      },
    ],
  },
  {
    label: "Recruitment",
    items: [
      {
        href: "/recruitment",
        label: "Employer Intelligence",
        icon: Building2,
        roles: ["ADMIN", "RECRUITMENT_TEAM"],
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
  const [open, setOpen] = useState(defaultOpen)
  const items = group.items.filter((item) => item.roles.includes(user.role))
  if (items.length === 0) return null

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href))
  const hasActive = items.some((item) => isActive(item.href))

  // Auto-open when a child route is active
  useEffect(() => {
    if (hasActive) setOpen(true)
  }, [hasActive])

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
          hasActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
        )}
      >
        <Shield className="size-[18px] shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronRight className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-3 border-l-2 border-sidebar-border pl-3 pt-1 space-y-0.5">
              {items.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                    {item.label}
                    {active && (
                      <motion.span
                        layoutId="admin-indicator"
                        className="absolute left-0 top-1/2 -translate-x-[calc(50%+1px)] -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary"
                      />
                    )}
                  </Link>
                )
              })}
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
          if (group.collapsible) {
            return (
              <CollapsibleGroup
                key={group.label}
                group={group}
                user={user}
                pathname={pathname}
                onNavigate={onNavigate}
                defaultOpen={group.items.some((item) => isActive(item.href))}
              />
            )
          }

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

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="flex items-center gap-3 rounded-xl px-2 py-2"
        >
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
        </motion.div>
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

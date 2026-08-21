"use client"

import { useState, type ReactNode } from "react"
import { Navbar } from "@/components/navbar"
import { Sidebar } from "@/components/sidebar"
import type { User } from "@/lib/api"

export function AppShell({
  user,
  children,
}: {
  user: User
  children: ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar
        user={user}
        drawerOpen={drawerOpen}
        onDrawerOpenChange={setDrawerOpen}
      />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Navbar user={user} onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

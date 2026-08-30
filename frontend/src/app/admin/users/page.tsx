"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  UserX,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useProfile, useAdminUsers } from "@/lib/hooks"
import {
  ROLE_LABELS,
  ROLES,
  type User,
  type UserRole,
  apiFetch,
} from "@/lib/api"

const PAGE_SIZE = 8

type NewUser = {
  username: string
  email: string
  first_name: string
  last_name: string
  role: UserRole
  password: string
  send_invite: boolean
}

type EditUserForm = {
  first_name: string
  last_name: string
  email: string
  role: UserRole
}

const emptyNewUser: NewUser = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "MARKET_ANALYST",
  password: "",
  send_invite: false,
}

const ROLE_DOT_CLASSES: Record<UserRole, string> = {
  ADMIN: "bg-primary",
  CEO_MANAGEMENT: "bg-amber-500",
  MARKET_ANALYST: "bg-blue-500",
  TRAINING_MANAGER: "bg-violet-500",
  RECRUITMENT_TEAM: "bg-emerald-500",
}

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

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | "ellipsis")[] = [1]
  if (current > 3) pages.push("ellipsis")
  for (let p = current - 1; p <= current + 1; p++) {
    if (p > 1 && p < total) pages.push(p)
  }
  if (current < total - 2) pages.push("ellipsis")
  pages.push(total)
  return pages
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useAdminUsers()
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newUser, setNewUser] = useState<NewUser>(emptyNewUser)

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL")
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<EditUserForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesTerm =
        !term ||
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(term)
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter
      return matchesTerm && matchesRole
    })
  }, [users, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageUsers = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  const activeCount = users.filter((u) => u.is_active).length
  const adminCount = users.filter((u) => u.role === "ADMIN").length

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    if (newUser.send_invite && !newUser.email.trim()) {
      toast.error("Email is required to send an invite.")
      return
    }
    if (!newUser.send_invite && newUser.password.length < 8) {
      toast.error("Password must be at least 8 characters.")
      return
    }
    setSaving(true)
    try {
      await apiFetch<User>("/admin/users/", {
        method: "POST",
        body: JSON.stringify(newUser),
      })
      setCreateOpen(false)
      setNewUser(emptyNewUser)
      void refetchUsers()
      toast.success(
        newUser.send_invite
          ? "User created and invite email sent."
          : "User created successfully.",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user")
    } finally {
      setSaving(false)
    }
  }

  async function updateUser(user: User, patch: Partial<User>) {
    try {
      await apiFetch<User>(`/admin/users/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
      refetchUsers()
      toast.success("User updated successfully.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user")
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await apiFetch(`/admin/users/${deactivateTarget.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      })
      setDeactivateTarget(null)
      refetchUsers()
      toast.success("User deactivated.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate user")
    } finally {
      setDeactivating(false)
    }
  }

  function openEditDialog(user: User) {
    setEditTarget(user)
    setEditForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
    })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget || !editForm) return
    setSavingEdit(true)
    try {
      await apiFetch<User>(`/admin/users/${editTarget.id}/`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      })
      setEditTarget(null)
      setEditForm(null)
      refetchUsers()
      toast.success("User updated successfully.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user")
    } finally {
      setSavingEdit(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/admin/users/${deleteTarget.id}/`, { method: "DELETE" })
      setDeleteTarget(null)
      refetchUsers()
      toast.success("User deleted.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user")
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = search.trim() !== "" || roleFilter !== "ALL"

  if (!me) return null

  return (
    <AppShell user={me} loading={profileLoading}>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={Users}
          title="User Management"
          description="Create users, assign roles, and manage active status across the platform."
          actions={
            <Button
              variant="outline"
              onClick={() => setCreateOpen(true)}
              data-icon="inline-start"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Plus data-icon="inline-start" />
              Add user
            </Button>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Total users</p>
                <p className="text-2xl font-semibold">{users.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <UserRound className="size-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-semibold">{adminCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Search name, username or email..."
                  className="pl-8"
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as UserRole | "ALL")
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue>
                    {(value) =>
                      value === "ALL" ? "All roles" : ROLE_LABELS[value as UserRole]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("")
                    setRoleFilter("ALL")
                    setPage(1)
                  }}
                >
                  <X />
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {users.length} users
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {pageUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="size-6" />
                </span>
                <div>
                  <p className="font-medium">
                    {hasFilters ? "No users match your filters" : "No users yet"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hasFilters
                      ? "Try adjusting your search or role filter."
                      : "Create your first user to get started."}
                  </p>
                </div>
                {!hasFilters && (
                  <Button onClick={() => setCreateOpen(true)} data-icon="inline-start">
                    <Plus data-icon="inline-start" />
                    Add user
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">User</TableHead>
                    <TableHead className="hidden md:table-cell">Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageUsers.map((user) => {
                    const isSelf = user.id === me?.id
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="px-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {getInitials(user)}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 font-medium">
                                <span className="truncate">{user.username}</span>
                                {isSelf && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                    You
                                  </Badge>
                                )}
                              </p>
                              <p className="truncate text-sm text-muted-foreground">
                                {user.email || "No email"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Select
                            value={user.role}
                            onValueChange={(role) =>
                              void updateUser(user, { role: role as UserRole })
                            }
                          >
                            <SelectTrigger size="sm">
                              <SelectValue>
                                {(value) => (
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className={cn(
                                        "size-2 shrink-0 rounded-full",
                                        ROLE_DOT_CLASSES[value as UserRole],
                                      )}
                                    />
                                    {value
                                      ? ROLE_LABELS[value as UserRole]
                                      : "Select role"}
                                  </span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1.5",
                              user.is_active &&
                                "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                              !user.is_active &&
                                "border-transparent bg-muted text-muted-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                user.is_active ? "bg-emerald-500" : "bg-muted-foreground",
                              )}
                            />
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? "You cannot edit your own account"
                                  : `Edit ${user.username}`
                              }
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant={user.is_active ? "outline" : "secondary"}
                              size="sm"
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? "You cannot deactivate your own account"
                                  : undefined
                              }
                              onClick={() => {
                                if (user.is_active) {
                                  setDeactivateTarget(user)
                                } else {
                                  void updateUser(user, { is_active: true })
                                }
                              }}
                            >
                              {user.is_active ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={isSelf}
                              title={
                                isSelf ? "You cannot delete your own account" : `Delete ${user.username}`
                              }
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(user)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {filtered.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {rangeStart}–{rangeEnd}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{filtered.length}</span> users
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={safePage === 1}
                    onClick={() => setPage(safePage - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft />
                  </Button>
                  {getPageNumbers(safePage, totalPages).map((item, index) =>
                    item === "ellipsis" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="flex size-7 items-center justify-center text-muted-foreground"
                      >
                        <Ellipsis className="size-4" />
                      </span>
                    ) : (
                      <Button
                        key={item}
                        variant={item === safePage ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => setPage(item)}
                        aria-label={`Page ${item}`}
                        aria-current={item === safePage ? "page" : undefined}
                      >
                        {item}
                      </Button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(safePage + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createUser}>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Create an account and assign a role
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  placeholder="e.g. johndoe"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  placeholder="e.g. john@company.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="first_name">First name</Label>
                  <Input
                    id="first_name"
                    value={newUser.first_name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, first_name: e.target.value })
                    }
                    placeholder="John"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    value={newUser.last_name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, last_name: e.target.value })
                    }
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(role) =>
                    setNewUser({ ...newUser, role: role as UserRole })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value) =>
                        value
                          ? ROLE_LABELS[value as UserRole]
                          : "Select role"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  autoComplete="new-password"
                  placeholder="••••••••"
                  required={!newUser.send_invite}
                  disabled={newUser.send_invite}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newUser.send_invite}
                  onChange={(e) =>
                    setNewUser({ ...newUser, send_invite: e.target.checked, password: e.target.checked ? "" : newUser.password })
                  }
                />
                Email an invite so they set their own password
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving} data-icon="inline-start">
                {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {saving ? "Creating..." : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTarget !== null && editForm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent>
          <form onSubmit={saveEdit}>
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>
                Update profile details and assign a role
              </DialogDescription>
            </DialogHeader>
            {editTarget && editForm && (
              <div className="flex flex-col gap-3 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    value={editTarget.username}
                    disabled
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-first_name">First name</Label>
                    <Input
                      id="edit-first_name"
                      value={editForm.first_name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, first_name: e.target.value })
                      }
                      placeholder="First name"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-last_name">Last name</Label>
                    <Input
                      id="edit-last_name"
                      value={editForm.last_name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, last_name: e.target.value })
                      }
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    placeholder="e.g. john@company.com"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(role) =>
                      setEditForm({ ...editForm, role: role as UserRole })
                    }
                  >
                    <SelectTrigger id="edit-role" className="w-full">
                      <SelectValue>
                        {(value) =>
                          value
                            ? ROLE_LABELS[value as UserRole]
                            : "Select role"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Changing the role updates access permissions immediately.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditTarget(null)
                  setEditForm(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit} data-icon="inline-start">
                {savingEdit && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivateTarget !== null} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate user</DialogTitle>
            <DialogDescription>
              They will lose access immediately. You can re-enable their account at any time.
            </DialogDescription>
          </DialogHeader>
          {deactivateTarget && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <UserX className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{deactivateTarget.username}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {deactivateTarget.email || "No email"} · {ROLE_LABELS[deactivateTarget.role]}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeactivate}
              disabled={deactivating}
              data-icon="inline-start"
            >
              {deactivating && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {deactivating ? "Deactivating..." : "Deactivate user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              This permanently removes the account. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <UserX className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{deleteTarget.username}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {deleteTarget.email || "No email"} · {ROLE_LABELS[deleteTarget.role]}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              data-icon="inline-start"
            >
              {deleting && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {deleting ? "Deleting..." : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

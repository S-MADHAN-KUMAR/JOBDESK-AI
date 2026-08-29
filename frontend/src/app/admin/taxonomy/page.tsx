"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  Globe,
  GraduationCap,
  Loader2,
  MapPin,
  Plus,
  Pencil,
  Search,
  Settings2,
  Tags,
  Trash2,
  Wrench,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
import {
  fetchMasterCompanies,
  type MasterCompany,
  createMasterCompany,
  updateMasterCompany,
  deleteMasterCompany,
  bulkDeleteMasterCompanies,
  fetchMasterLocations,
  type MasterLocation,
  createMasterLocation,
  updateMasterLocation,
  deleteMasterLocation,
  bulkDeleteMasterLocations,
  fetchMasterRoles,
  type MasterJobRole,
  createMasterRole,
  updateMasterRole,
  deleteMasterRole,
  bulkDeleteMasterRoles,
  fetchMasterTechnologies,
  type MasterTechnology,
  createMasterTechnology,
  updateMasterTechnology,
  deleteMasterTechnology,
  bulkDeleteMasterTechnologies,
  fetchMasterSkills,
  type MasterSkill,
  createMasterSkill,
  updateMasterSkill,
  deleteMasterSkill,
  bulkDeleteMasterSkills,
} from "@/lib/api"
import { useProfile } from "@/lib/hooks"
import { cn } from "@/lib/utils"

type Tab = "companies" | "locations" | "roles" | "technologies" | "skills"

const TAB_META: {
  key: Tab
  label: string
  icon: React.ElementType
}[] = [
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "roles", label: "Roles", icon: GraduationCap },
  { key: "technologies", label: "Technologies", icon: Wrench },
  { key: "skills", label: "Skills", icon: Settings2 },
]

export default function AdminTaxonomyPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const [activeTab, setActiveTab] = useState<Tab>("companies")

  const [companies, setCompanies] = useState<MasterCompany[]>([])
  const [locations, setLocations] = useState<MasterLocation[]>([])
  const [roles, setRoles] = useState<MasterJobRole[]>([])
  const [technologies, setTechnologies] = useState<MasterTechnology[]>([])
  const [skills, setSkills] = useState<MasterSkill[]>([])

  const [companySearch, setCompanySearch] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [roleSearch, setRoleSearch] = useState("")
  const [techSearch, setTechSearch] = useState("")
  const [skillSearch, setSkillSearch] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<
    | MasterCompany
    | MasterLocation
    | MasterJobRole
    | MasterTechnology
    | MasterSkill
    | null
  >(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<
    | MasterCompany
    | MasterLocation
    | MasterJobRole
    | MasterTechnology
    | MasterSkill
    | null
  >(null)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const [companyForm, setCompanyForm] = useState({
    name: "",
    normalized_name: "",
    domain: "",
    location: "",
    website: "",
  })
  const [locationForm, setLocationForm] = useState({
    raw_text: "",
    city: "",
    state: "",
    country: "",
    normalized: "",
  })
  const [roleForm, setRoleForm] = useState({ name: "", category: "" })
  const [techForm, setTechForm] = useState({ name: "", category: "" })
  const [skillForm, setSkillForm] = useState({
    name: "",
    technology: "",
  })

  function refresh() {
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    if (profileError) {
      router.push("/login")
      return
    }
  }, [profileError, router])

  useEffect(() => {
    if (!me || profileLoading) return
    let cancelled = false

    async function run() {
      try {
        if (!me || me.role !== "ADMIN") {
          toast.error("Access denied: Admin role required.")
          return
        }

        const [c, l, r, t, s] = await Promise.all([
          fetchMasterCompanies(),
          fetchMasterLocations(),
          fetchMasterRoles(),
          fetchMasterTechnologies(),
          fetchMasterSkills(),
        ])
        if (!cancelled) {
          setCompanies(c)
          setLocations(l)
          setRoles(r)
          setTechnologies(t)
          setSkills(s)
          setSelected(new Set())
        }
      } catch (err) {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : "Failed to load master data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [me, profileLoading, reloadKey])

  function openCreate() {
    setEditing(null)
    if (activeTab === "companies") {
      setCompanyForm({ name: "", normalized_name: "", domain: "", location: "", website: "" })
    } else if (activeTab === "locations") {
      setLocationForm({ raw_text: "", city: "", state: "", country: "", normalized: "" })
    } else if (activeTab === "roles") {
      setRoleForm({ name: "", category: "" })
    } else if (activeTab === "technologies") {
      setTechForm({ name: "", category: "" })
    } else if (activeTab === "skills") {
      setSkillForm({ name: "", technology: "" })
    }
    setFormOpen(true)
  }

  function openEdit(
    item: MasterCompany | MasterLocation | MasterJobRole | MasterTechnology | MasterSkill,
  ) {
    setEditing(item)
    if (activeTab === "companies") {
      const c = item as MasterCompany
      setCompanyForm({
        name: c.name,
        normalized_name: c.normalized_name,
        domain: c.domain,
        location: c.location,
        website: c.website,
      })
    } else if (activeTab === "locations") {
      const l = item as MasterLocation
      setLocationForm({
        raw_text: l.raw_text,
        city: l.city,
        state: l.state,
        country: l.country,
        normalized: l.normalized,
      })
    } else if (activeTab === "roles") {
      const r = item as MasterJobRole
      setRoleForm({ name: r.name, category: r.category })
    } else if (activeTab === "technologies") {
      const t = item as MasterTechnology
      setTechForm({ name: t.name, category: t.category })
    } else if (activeTab === "skills") {
      const s = item as MasterSkill
      setSkillForm({ name: s.name, technology: s.technology ?? "" })
    }
    setFormOpen(true)
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (activeTab === "companies") {
        const data = {
          ...companyForm,
          normalized_name: companyForm.normalized_name || companyForm.name.toLowerCase().replace(/\s+/g, "_"),
        }
        if (editing) {
          await updateMasterCompany(editing.id, data)
        } else {
          await createMasterCompany(data)
        }
      } else if (activeTab === "locations") {
        const data = {
          ...locationForm,
          normalized: locationForm.normalized || locationForm.raw_text.toLowerCase().replace(/\s+/g, "_"),
        }
        if (editing) {
          await updateMasterLocation(editing.id, data)
        } else {
          await createMasterLocation(data)
        }
      } else if (activeTab === "roles") {
        if (editing) {
          await updateMasterRole(editing.id, roleForm)
        } else {
          await createMasterRole(roleForm)
        }
      } else if (activeTab === "technologies") {
        if (editing) {
          await updateMasterTechnology(editing.id, techForm)
        } else {
          await createMasterTechnology(techForm)
        }
      } else if (activeTab === "skills") {
        if (editing) {
          await updateMasterSkill(editing.id, skillForm)
        } else {
          await createMasterSkill(skillForm)
        }
      }
      setFormOpen(false)
      refresh()
      toast.success(editing ? "Record updated." : "Record created.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save record")
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (activeTab === "companies") {
        await deleteMasterCompany(deleteTarget.id)
      } else if (activeTab === "locations") {
        await deleteMasterLocation(deleteTarget.id)
      } else if (activeTab === "roles") {
        await deleteMasterRole(deleteTarget.id)
      } else if (activeTab === "technologies") {
        await deleteMasterTechnology(deleteTarget.id)
      } else if (activeTab === "skills") {
        await deleteMasterSkill(deleteTarget.id)
      }
      setDeleteTarget(null)
      refresh()
      toast.success("Record deleted.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete record")
    } finally {
      setDeleting(false)
    }
  }

  const filteredCompanies = companies.filter((c) => {
    const q = companySearch.trim().toLowerCase()
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.normalized_name.toLowerCase().includes(q) ||
      c.domain.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q)
    )
  })

  const filteredLocations = locations.filter((l) => {
    const q = locationSearch.trim().toLowerCase()
    return (
      !q ||
      l.raw_text.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.state.toLowerCase().includes(q) ||
      l.country.toLowerCase().includes(q) ||
      l.normalized.toLowerCase().includes(q)
    )
  })

  const filteredRoles = roles.filter((r) => {
    const q = roleSearch.trim().toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
  })

  const filteredTechs = technologies.filter((t) => {
    const q = techSearch.trim().toLowerCase()
    return !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  })

  const filteredSkills = skills.filter((s) => {
    const q = skillSearch.trim().toLowerCase()
    return (
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.technology_name.toLowerCase().includes(q)
    )
  })

  const filteredIds =
    activeTab === "companies"
      ? filteredCompanies.map((c) => c.id)
      : activeTab === "locations"
        ? filteredLocations.map((l) => l.id)
        : activeTab === "roles"
          ? filteredRoles.map((r) => r.id)
          : activeTab === "technologies"
            ? filteredTechs.map((t) => t.id)
            : filteredSkills.map((s) => s.id)

  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      filteredIds.length > 0 && filteredIds.every((id) => prev.has(id))
        ? new Set()
        : new Set(filteredIds),
    )
  }

  async function confirmBulkDelete() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      const ids = [...selected]
      if (activeTab === "companies") {
        await bulkDeleteMasterCompanies(ids)
      } else if (activeTab === "locations") {
        await bulkDeleteMasterLocations(ids)
      } else if (activeTab === "roles") {
        await bulkDeleteMasterRoles(ids)
      } else if (activeTab === "technologies") {
        await bulkDeleteMasterTechnologies(ids)
      } else {
        await bulkDeleteMasterSkills(ids)
      }
      setBulkDeleteOpen(false)
      setSelected(new Set())
      refresh()
      toast.success(`Deleted ${ids.length} record(s).`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete records")
    } finally {
      setDeleting(false)
    }
  }

  const getSearch = (tab: Tab) => {
    if (tab === "companies") return companySearch
    if (tab === "locations") return locationSearch
    if (tab === "roles") return roleSearch
    if (tab === "technologies") return techSearch
    return skillSearch
  }

  const setSearch = (tab: Tab, value: string) => {
    if (tab === "companies") setCompanySearch(value)
    else if (tab === "locations") setLocationSearch(value)
    else if (tab === "roles") setRoleSearch(value)
    else if (tab === "technologies") setTechSearch(value)
    else setSkillSearch(value)
  }

  const getCount = (tab: Tab) => {
    if (tab === "companies") return filteredCompanies.length
    if (tab === "locations") return filteredLocations.length
    if (tab === "roles") return filteredRoles.length
    if (tab === "technologies") return filteredTechs.length
    return filteredSkills.length
  }

  const getPlaceholder = (tab: Tab) => {
    if (tab === "companies") return "Search companies..."
    if (tab === "locations") return "Search locations..."
    if (tab === "roles") return "Search roles..."
    if (tab === "technologies") return "Search technologies..."
    return "Search skills..."
  }

  const formTitle = editing
    ? `Edit ${activeTab === "companies" ? "Company" : activeTab === "locations" ? "Location" : activeTab === "roles" ? "Role" : activeTab === "technologies" ? "Technology" : "Skill"}`
    : `Add ${activeTab === "companies" ? "Company" : activeTab === "locations" ? "Location" : activeTab === "roles" ? "Role" : activeTab === "technologies" ? "Technology" : "Skill"}`

  const deleteTitle =
    activeTab === "companies"
      ? "Delete company"
      : activeTab === "locations"
        ? "Delete location"
        : activeTab === "roles"
          ? "Delete role"
          : activeTab === "technologies"
            ? "Delete technology"
            : "Delete skill"

  const currentSearch = getSearch(activeTab)
  const currentCount = getCount(activeTab)
  const currentPlaceholder = getPlaceholder(activeTab)

  if (!me) return null

  if (profileError) {
    return (
      <AppShell user={me} loading>
        <div className="p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Access denied: Admin role required.
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell user={me} loading={loading}>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={Tags}
          title="Taxonomy & Master Data"
          description="Govern reference data used for job classification and analytics."
          actions={
            <>
              {selected.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                  data-icon="inline-start"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete selected ({selected.size})
                </Button>
              )}
              <Button
                variant="outline"
                onClick={openCreate}
                data-icon="inline-start"
                className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Plus data-icon="inline-start" />
                Add new
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap gap-2 border-b pb-px">
          {TAB_META.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  setSelected(new Set())
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-b-2 border-primary bg-primary/5 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-5 justify-center px-1 text-[10px]"
                >
                  {tab.key === "companies"
                    ? companies.length
                    : tab.key === "locations"
                      ? locations.length
                      : tab.key === "roles"
                        ? roles.length
                        : tab.key === "technologies"
                          ? technologies.length
                          : skills.length}
                </Badge>
              </button>
            )
          })}
        </div>

        <Card>
          <CardHeader className="flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  key={`${activeTab}-${reloadKey}`}
                  value={currentSearch}
                  onChange={(e) => setSearch(activeTab, e.target.value)}
                  placeholder={currentPlaceholder}
                  className="pl-8"
                />
              </div>
              {currentSearch && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearch(activeTab, "")}
                >
                  <X />
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {currentCount} of {
                activeTab === "companies"
                  ? companies.length
                  : activeTab === "locations"
                    ? locations.length
                    : activeTab === "roles"
                      ? roles.length
                      : activeTab === "technologies"
                        ? technologies.length
                        : skills.length
              } records
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {activeTab === "companies" &&
              (filteredCompanies.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  hasSearch={!!companySearch}
                  onAdd={openCreate}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-4">
                        <input
                          type="checkbox"
                          aria-label="Select all companies"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="size-4 accent-primary"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Normalized</TableHead>
                      <TableHead className="hidden md:table-cell">Domain</TableHead>
                      <TableHead className="hidden lg:table-cell">Location</TableHead>
                      <TableHead className="hidden sm:table-cell">Created</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.name}`}
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{c.name}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {c.normalized_name}
                          </code>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="flex items-center gap-1.5 text-sm">
                            <Globe className="size-3.5 text-muted-foreground" />
                            {c.domain || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {c.location || "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Edit ${c.name}`}
                              onClick={() => openEdit(c)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Delete ${c.name}`}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}

            {activeTab === "locations" &&
              (filteredLocations.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  hasSearch={!!locationSearch}
                  onAdd={openCreate}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-4">
                        <input
                          type="checkbox"
                          aria-label="Select all locations"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="size-4 accent-primary"
                        />
                      </TableHead>
                      <TableHead>Raw Text</TableHead>
                      <TableHead className="hidden md:table-cell">City</TableHead>
                      <TableHead className="hidden md:table-cell">State</TableHead>
                      <TableHead className="hidden md:table-cell">Country</TableHead>
                      <TableHead className="hidden sm:table-cell">Normalized</TableHead>
                      <TableHead className="hidden sm:table-cell">Created</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLocations.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${l.raw_text}`}
                            checked={selected.has(l.id)}
                            onChange={() => toggleSelect(l.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{l.raw_text}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {l.city || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {l.state || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {l.country || "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {l.normalized}
                          </code>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Edit ${l.raw_text}`}
                              onClick={() => openEdit(l)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Delete ${l.raw_text}`}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(l)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}

            {activeTab === "roles" &&
              (filteredRoles.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  hasSearch={!!roleSearch}
                  onAdd={openCreate}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-4">
                        <input
                          type="checkbox"
                          aria-label="Select all roles"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="size-4 accent-primary"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="hidden sm:table-cell">Created</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoles.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.name}`}
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {r.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Edit ${r.name}`}
                              onClick={() => openEdit(r)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Delete ${r.name}`}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(r)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}

            {activeTab === "technologies" &&
              (filteredTechs.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  hasSearch={!!techSearch}
                  onAdd={openCreate}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-4">
                        <input
                          type="checkbox"
                          aria-label="Select all technologies"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="size-4 accent-primary"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="hidden sm:table-cell">Created</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTechs.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${t.name}`}
                            checked={selected.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {t.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Edit ${t.name}`}
                              onClick={() => openEdit(t)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Delete ${t.name}`}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(t)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}

            {activeTab === "skills" &&
              (filteredSkills.length === 0 ? (
                <EmptyState
                  icon={Settings2}
                  hasSearch={!!skillSearch}
                  onAdd={openCreate}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-4">
                        <input
                          type="checkbox"
                          aria-label="Select all skills"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="size-4 accent-primary"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Technology</TableHead>
                      <TableHead className="hidden sm:table-cell">Created</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSkills.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="px-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${s.name}`}
                            checked={selected.has(s.id)}
                            onChange={() => toggleSelect(s.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {s.technology_name ? (
                            <Badge variant="secondary" className="font-mono text-xs">
                              {s.technology_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Edit ${s.name}`}
                              onClick={() => openEdit(s)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Delete ${s.name}`}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) setFormOpen(false)
        }}
      >
        <DialogContent>
          <form onSubmit={saveForm}>
            <DialogHeader>
              <DialogTitle>{formTitle}</DialogTitle>
              <DialogDescription>
                {editing ? "Update the record details below." : "Fill in the details to create a new record."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-4">
              {activeTab === "companies" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="company-name">Name</Label>
                    <Input
                      id="company-name"
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                      placeholder="e.g. Acme Corp"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="company-normalized">Normalized name</Label>
                    <Input
                      id="company-normalized"
                      value={companyForm.normalized_name}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, normalized_name: e.target.value })
                      }
                      placeholder="auto-generated if left blank"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="company-domain">Domain</Label>
                      <Input
                        id="company-domain"
                        value={companyForm.domain}
                        onChange={(e) =>
                          setCompanyForm({ ...companyForm, domain: e.target.value })
                        }
                        placeholder="e.g. acme.com"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="company-location">Location</Label>
                      <Input
                        id="company-location"
                        value={companyForm.location}
                        onChange={(e) =>
                          setCompanyForm({ ...companyForm, location: e.target.value })
                        }
                        placeholder="e.g. San Francisco, CA"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="company-website">Website</Label>
                    <Input
                      id="company-website"
                      value={companyForm.website}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, website: e.target.value })
                      }
                      placeholder="e.g. https://acme.com"
                    />
                  </div>
                </>
              )}

              {activeTab === "locations" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="location-raw">Raw text</Label>
                    <Input
                      id="location-raw"
                      value={locationForm.raw_text}
                      onChange={(e) =>
                        setLocationForm({ ...locationForm, raw_text: e.target.value })
                      }
                      placeholder="e.g. Chennai, Tamil Nadu, India"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="location-city">City</Label>
                      <Input
                        id="location-city"
                        value={locationForm.city}
                        onChange={(e) =>
                          setLocationForm({ ...locationForm, city: e.target.value })
                        }
                        placeholder="Chennai"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="location-state">State</Label>
                      <Input
                        id="location-state"
                        value={locationForm.state}
                        onChange={(e) =>
                          setLocationForm({ ...locationForm, state: e.target.value })
                        }
                        placeholder="Tamil Nadu"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="location-country">Country</Label>
                      <Input
                        id="location-country"
                        value={locationForm.country}
                        onChange={(e) =>
                          setLocationForm({ ...locationForm, country: e.target.value })
                        }
                        placeholder="India"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="location-normalized">Normalized</Label>
                    <Input
                      id="location-normalized"
                      value={locationForm.normalized}
                      onChange={(e) =>
                        setLocationForm({ ...locationForm, normalized: e.target.value })
                      }
                      placeholder="auto-generated if left blank"
                    />
                  </div>
                </>
              )}

              {activeTab === "roles" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="role-name">Name</Label>
                    <Input
                      id="role-name"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      placeholder="e.g. Backend Developer"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="role-category">Category</Label>
                    <Input
                      id="role-category"
                      value={roleForm.category}
                      onChange={(e) =>
                        setRoleForm({ ...roleForm, category: e.target.value })
                      }
                      placeholder="e.g. ENGINEERING"
                      required
                    />
                  </div>
                </>
              )}

              {activeTab === "technologies" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="tech-name">Name</Label>
                    <Input
                      id="tech-name"
                      value={techForm.name}
                      onChange={(e) => setTechForm({ ...techForm, name: e.target.value })}
                      placeholder="e.g. Python"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="tech-category">Category</Label>
                    <Input
                      id="tech-category"
                      value={techForm.category}
                      onChange={(e) =>
                        setTechForm({ ...techForm, category: e.target.value })
                      }
                      placeholder="e.g. PROGRAMMING_LANGUAGE"
                      required
                    />
                  </div>
                </>
              )}

              {activeTab === "skills" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="skill-name">Name</Label>
                    <Input
                      id="skill-name"
                      value={skillForm.name}
                      onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                      placeholder="e.g. React"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="skill-technology">Technology</Label>
                    <Select
                      value={skillForm.technology}
                      onValueChange={(value) =>
                        setSkillForm({ ...skillForm, technology: value ?? "" })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select technology (optional)">
                          {(value) =>
                            value
                              ? technologies.find((t) => t.id === value)?.name ?? value
                              : "None"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {technologies.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} data-icon="inline-start">
                {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {saving ? "Saving..." : editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteTitle}</DialogTitle>
            <DialogDescription>
              This permanently removes the record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {activeTab === "companies"
                    ? (deleteTarget as MasterCompany).name
                    : activeTab === "locations"
                      ? (deleteTarget as MasterLocation).raw_text
                      : activeTab === "roles"
                        ? (deleteTarget as MasterJobRole).name
                        : activeTab === "technologies"
                          ? (deleteTarget as MasterTechnology).name
                          : (deleteTarget as MasterSkill).name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {activeTab === "companies"
                    ? (deleteTarget as MasterCompany).domain || "No domain"
                    : activeTab === "locations"
                      ? `${(deleteTarget as MasterLocation).city || "—"}, ${(deleteTarget as MasterLocation).country || "—"}`
                      : activeTab === "roles"
                        ? (deleteTarget as MasterJobRole).category
                        : activeTab === "technologies"
                          ? (deleteTarget as MasterTechnology).category
                          : (deleteTarget as MasterSkill).technology_name || "No technology"}
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
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected records?</DialogTitle>
            <DialogDescription>
              This permanently removes {selected.size} selected record
              {selected.size === 1 ? "" : "s"}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmBulkDelete()}
              disabled={deleting}
              data-icon="inline-start"
            >
              {deleting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {deleting ? "Deleting..." : `Delete ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function EmptyState({
  icon: Icon,
  hasSearch,
  onAdd,
}: {
  icon: React.ElementType
  hasSearch: boolean
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div>
        <p className="font-medium">
          {hasSearch ? "No records match your search" : "No records yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasSearch
            ? "Try adjusting your search term."
            : "Add the first record to get started."}
        </p>
      </div>
      {!hasSearch && (
        <Button onClick={onAdd} data-icon="inline-start">
          <Plus data-icon="inline-start" />
          Add new
        </Button>
      )}
    </div>
  )
}

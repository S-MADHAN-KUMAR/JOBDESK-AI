"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Layers,
  Zap,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppShell } from "@/components/app-shell"
import { useProfile, useSkillMatrix, useEmergingSkills } from "@/lib/hooks"

const CHART_COLORS = ["hsl(142,55%,50%)", "hsl(35,85%,55%)", "hsl(220,65%,55%)", "hsl(270,60%,55%)", "hsl(160,50%,45%)"]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
}

export default function TrainingPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: matrixData, isLoading: matrixLoading } = useSkillMatrix()
  const { data: emerging, isLoading: emergingLoading } = useEmergingSkills()
  const [selectedRole, setSelectedRole] = useState<string>("all")

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const loading = profileLoading || matrixLoading || emergingLoading
  const matrix = matrixData?.matrix ?? []

  if (!me) return null

  if (profileError) {
    return (
      <AppShell user={me} loading>
        <div className="p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Access denied: Training Manager role required.
          </div>
        </div>
      </AppShell>
    )
  }

  const filteredMatrix = selectedRole === "all"
    ? matrix
    : matrix.filter((m) => m.role_category === selectedRole)

  const roleCategories = [...new Set(matrix.map((m) => m.role_category))].sort()

  const radarData = filteredMatrix.slice(0, 6).map((entry) => ({
    role: entry.role_category.substring(0, 10),
    technologies: entry.top_technologies.length,
    skills: entry.top_skills.length,
    jobs: entry.total_jobs,
  }))

  const allTechCount = filteredMatrix.reduce((acc, m) => acc + m.top_technologies.length, 0)
  const allSkillCount = filteredMatrix.reduce((acc, m) => acc + m.top_skills.length, 0)

  return (
    <AppShell user={me} loading={loading}>
      <div className="p-4 sm:p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Training Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              Technology and skill matrices mapped to role families
            </p>
          </div>
          <Select value={selectedRole} onValueChange={(v) => v && setSelectedRole(v)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roleCategories.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Role Categories</p>
                <p className="mt-1 text-2xl font-bold">{filteredMatrix.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Technologies Tracked</p>
                <p className="mt-1 text-2xl font-bold text-primary">{allTechCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Skills Tracked</p>
                <p className="mt-1 text-2xl font-bold text-primary">{allSkillCount}</p>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {emerging && emerging.emerging.length > 0 && (
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4 text-amber-500" />
                  Emerging Technologies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {emerging.emerging.map((s, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04, duration: 0.3 }}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                    >
                      <ArrowUpRight className="size-3" />
                      {s.name}
                      <span className="text-amber-600">+{s.change_percentage}%</span>
                    </motion.span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {emerging && emerging.declining.length > 0 && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingDown className="size-4 text-red-500" />
                  Declining Technologies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {emerging.declining.map((s, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04, duration: 0.3 }}
                      className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
                    >
                      <ArrowDownRight className="size-3" />
                      {s.name}
                      <span className="text-red-600">{s.change_percentage}%</span>
                    </motion.span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {radarData.length > 0 && (
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-4 text-primary" />
                  Role Skill Radar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(0,0%,85%)" />
                    <PolarAngleAxis dataKey="role" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis tick={{ fontSize: 10 }} />
                    <Radar name="Technologies" dataKey="technologies" stroke="hsl(142,55%,50%)" fill="hsl(142,55%,50%)" fillOpacity={0.2} strokeWidth={2} />
                    <Radar name="Skills" dataKey="skills" stroke="hsl(35,85%,55%)" fill="hsl(35,85%,55%)" fillOpacity={0.2} strokeWidth={2} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {filteredMatrix.map((entry, i) => (
            <motion.div key={i} custom={i + 4} variants={fadeUp} initial="hidden" animate="visible">
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Layers className="size-4 text-primary" />
                      {entry.role_category}
                    </span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {entry.total_jobs} jobs
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {entry.top_technologies.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Technologies</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.top_technologies.map((t, j) => (
                          <span key={j} className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                            {t.name}
                            <span className="ml-1 text-primary/70">{t.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.top_skills.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.top_skills.map((s, j) => (
                          <span key={j} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
                            {s.name}
                            <span className="ml-1 text-muted-foreground">{s.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.top_technologies.length > 0 && (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={entry.top_technologies.slice(0, 5)} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(0,0%,90%)" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)" }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {entry.top_technologies.slice(0, 5).map((_, j) => (
                            <Cell key={j} fill={CHART_COLORS[j % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { KeyRound, Loader2, Save, Settings, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { useProfile } from "@/lib/hooks"
import { ROLE_LABELS, changePassword, updateProfile } from "@/lib/api"

type ProfileForm = {
  username: string
  first_name: string
  last_name: string
  email: string
}

type PasswordForm = {
  current_password: string
  new_password: string
  confirm_password: string
}

function formatApiError(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
  })
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    current_password: "",
    new_password: "",
    confirm_password: "",
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  useEffect(() => {
    if (!me) return
    setProfileForm({
      username: me.username || "",
      first_name: me.first_name || "",
      last_name: me.last_name || "",
      email: me.email || "",
    })
  }, [me])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const updated = await updateProfile({
        username: profileForm.username.trim(),
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        email: profileForm.email.trim(),
      })
      queryClient.setQueryData(["profile"], updated)
      await queryClient.invalidateQueries({ queryKey: ["profile"] })
      toast.success("Profile updated successfully.")
    } catch (err) {
      toast.error(formatApiError(err, "Failed to update profile"))
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("New password and confirmation do not match.")
      return
    }
    if (passwordForm.new_password.length < 8) {
      toast.error("New password must be at least 8 characters.")
      return
    }
    setSavingPassword(true)
    try {
      await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      })
      toast.success("Password changed successfully.")
    } catch (err) {
      toast.error(formatApiError(err, "Failed to change password"))
    } finally {
      setSavingPassword(false)
    }
  }

  if (!me) return null

  return (
    <AppShell user={me} loading={profileLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={Settings}
          title="Settings"
          description={`Update your account details and password · ${ROLE_LABELS[me.role]}`}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4" />
                Profile
              </CardTitle>
              <CardDescription>
                Edit your username, name, and email address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="settings-username">Username</Label>
                  <Input
                    id="settings-username"
                    value={profileForm.username}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, username: e.target.value })
                    }
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="settings-first-name">First name</Label>
                    <Input
                      id="settings-first-name"
                      value={profileForm.first_name}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          first_name: e.target.value,
                        })
                      }
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="settings-last-name">Last name</Label>
                    <Input
                      id="settings-last-name"
                      value={profileForm.last_name}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          last_name: e.target.value,
                        })
                      }
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input
                    id="settings-email"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, email: e.target.value })
                    }
                    autoComplete="email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={savingProfile || !profileForm.username.trim()}
                  data-icon="inline-start"
                >
                  {savingProfile ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  {savingProfile ? "Saving..." : "Save profile"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" />
                Password
              </CardTitle>
              <CardDescription>
                Change your password. Use at least 8 characters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="settings-current-password">Current password</Label>
                  <Input
                    id="settings-current-password"
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        current_password: e.target.value,
                      })
                    }
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="settings-new-password">New password</Label>
                  <Input
                    id="settings-new-password"
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        new_password: e.target.value,
                      })
                    }
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="settings-confirm-password">
                    Confirm new password
                  </Label>
                  <Input
                    id="settings-confirm-password"
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirm_password: e.target.value,
                      })
                    }
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    savingPassword ||
                    !passwordForm.current_password ||
                    !passwordForm.new_password
                  }
                  data-icon="inline-start"
                >
                  {savingPassword ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <KeyRound data-icon="inline-start" />
                  )}
                  {savingPassword ? "Updating..." : "Update password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

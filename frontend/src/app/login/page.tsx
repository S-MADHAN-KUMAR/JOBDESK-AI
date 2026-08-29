"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { login } from "@/lib/api"
import { useTheme } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"

const THEME = {
  dark: {
    textMain: "#ffffff",
    textSecondary: "#94a3b8",
    primary: "#0d9f6e",
    inputBg: "#27272a",
    baseBg: "#09090b",
    inputShadow: "rgba(255, 255, 255, 0.12)",
    placeholder: "#71717a",
    gradientMid: "rgba(9, 9, 11, 0.82)",
    layerOpacity: ["opacity-50", "opacity-60", "opacity-80"] as const,
    outerBg: "bg-black",
  },
  light: {
    textMain: "#18181b",
    textSecondary: "#64748b",
    primary: "#0d9f6e",
    inputBg: "#ffffff",
    baseBg: "#f4f4f5",
    inputShadow: "rgba(24, 24, 27, 0.12)",
    placeholder: "#a1a1aa",
    gradientMid: "rgba(244, 244, 245, 0.88)",
    layerOpacity: ["opacity-35", "opacity-40", "opacity-55"] as const,
    outerBg: "bg-zinc-100",
  },
} as const

export default function LoginPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const colors = THEME[theme]
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return

    setLoading(true)
    try {
      const user = await login(username.trim(), password)
      router.push(user.role === "ADMIN" ? "/admin/users" : "/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`flex min-h-dvh w-full items-center justify-center ${colors.outerBg}`}
    >
      <style>{`
        @keyframes login-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes login-spin-slow-reverse {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        .login-spin-slow {
          animation: login-spin-slow 60s linear infinite;
        }
        .login-spin-slow-reverse {
          animation: login-spin-slow-reverse 60s linear infinite;
        }
      `}</style>

      <div
        className="relative h-dvh w-full overflow-hidden shadow-2xl"
        style={{
          backgroundColor: colors.baseBg,
        }}
      >
        <div className="absolute top-4 right-4 z-30 sm:top-6 sm:right-6">
          <ThemeToggle />
        </div>

        {/* Decorative spinning layers */}
        <div
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{
            perspective: "1200px",
            transform: "perspective(1200px) rotateX(15deg)",
            transformOrigin: "center bottom",
          }}
        >
          <div className="login-spin-slow absolute inset-0">
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width: "2000px",
                height: "2000px",
                transform: "translate(-50%, -50%) rotate(279.05deg)",
                zIndex: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://framerusercontent.com/images/oqZEqzDEgSLygmUDuZAYNh2XQ9U.png?scale-down-to=2048"
                alt=""
                className={`h-full w-full object-cover ${colors.layerOpacity[0]}`}
              />
            </div>
          </div>

          <div className="login-spin-slow-reverse absolute inset-0">
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width: "1000px",
                height: "1000px",
                transform: "translate(-50%, -50%) rotate(304.42deg)",
                zIndex: 1,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://framerusercontent.com/images/UbucGYsHDAUHfaGZNjwyCzViw8.png?scale-down-to=1024"
                alt=""
                className={`h-full w-full object-cover ${colors.layerOpacity[1]}`}
              />
            </div>
          </div>

          <div className="login-spin-slow absolute inset-0">
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width: "800px",
                height: "800px",
                transform: "translate(-50%, -50%) rotate(48.33deg)",
                zIndex: 2,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://framerusercontent.com/images/Ans5PAxtJfg3CwxlrPMSshx2Pqc.png"
                alt=""
                className={`h-full w-full object-cover ${colors.layerOpacity[2]}`}
              />
            </div>
          </div>
        </div>

        {/* Gradient fade into form */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: `linear-gradient(to top, ${colors.baseBg} 12%, ${colors.gradientMid} 42%, transparent 100%)`,
          }}
        />

        {/* Content */}
        <div className="relative z-20 flex h-full w-full flex-col items-center justify-end gap-5 px-4 pb-16 sm:pb-52">
          <h1
            className="max-w-xl text-center text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
            style={{ color: colors.textMain }}
          >
            DemandAccel AI
          </h1>

          <p
            className="text-center text-base font-medium sm:text-lg"
            style={{ color: colors.textSecondary }}
          >
            Sign in to continue to your workspace.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-2 w-full max-w-md space-y-3"
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              required
              placeholder="Username"
              value={username}
              disabled={loading}
              onChange={(e) => setUsername(e.target.value)}
              className="h-14 w-full rounded-full px-6 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-70"
              style={{
                backgroundColor: colors.inputBg,
                color: colors.textMain,
                boxShadow: `inset 0 0 0 1px ${colors.inputShadow}`,
              }}
            />

            <div className="relative">
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="Password"
                value={password}
                disabled={loading}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 w-full rounded-full py-0 pl-6 pr-[140px] outline-none transition-all disabled:cursor-not-allowed disabled:opacity-70"
                style={{
                  backgroundColor: colors.inputBg,
                  color: colors.textMain,
                  boxShadow: `inset 0 0 0 1px ${colors.inputShadow}`,
                }}
              />
              <div className="absolute top-[6px] right-[6px] bottom-[6px]">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-full min-w-[120px] items-center justify-center rounded-full px-5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-95 disabled:cursor-wait disabled:active:scale-100 disabled:hover:brightness-100"
                  style={{ backgroundColor: colors.primary }}
                >
                  {loading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    "Sign in"
                  )}
                </button>
              </div>
            </div>
          </form>

          <style>{`
            input::placeholder {
              color: ${colors.placeholder};
            }
          `}</style>
        </div>
      </div>
    </div>
  )
}

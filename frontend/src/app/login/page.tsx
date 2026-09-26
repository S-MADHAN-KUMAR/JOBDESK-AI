"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { login } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-redirect-if-authenticated";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  useRedirectIfAuthenticated();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      router.push(user.role === "ADMIN" ? "/admin/users" : "/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue to your workspace."
      footer={
        <>
          Forgot your password?{" "}
          <Link href="/forgot-password" className="text-primary hover:underline">
            Reset it
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            type="text"
            name="username"
            autoComplete="username"
            required
            placeholder="e.g. market.analyst"
            value={username}
            disabled={loading}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
            value={password}
            disabled={loading}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

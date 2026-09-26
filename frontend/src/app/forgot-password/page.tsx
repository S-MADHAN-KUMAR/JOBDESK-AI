"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requestPasswordReset } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-redirect-if-authenticated";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  useRedirectIfAuthenticated();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset password"
      description="Enter your account email. If it exists, we will send a reset link."
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-xl border border-border/60 bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
          If that email is registered, a reset link is on its way. Check your
          inbox (and spam).
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

"use client";

import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirmPasswordReset } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-redirect-if-authenticated";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetForm() {
  const router = useRouter();
  useRedirectIfAuthenticated();
  const params = useSearchParams();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const validLink = useMemo(() => Boolean(uid && token), [uid, token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset({ uid, token, password });
      toast.success("Password updated. Sign in to continue.");
      router.push("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a password for your JOBDESK-AI account. Minimum 8 characters."
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!validLink ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          This reset link is incomplete. Request a new one from the forgot
          password page.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Repeat your password"
              value={confirm}
              disabled={loading}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ResetForm />
    </Suspense>
  );
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { fetchProfile } from "@/lib/api"

/** Redirect signed-in users away from login / forgot / reset pages. */
export function useRedirectIfAuthenticated(to = "/") {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    fetchProfile()
      .then(() => {
        if (!cancelled) router.replace(to)
      })
      .catch(() => {
        /* not authenticated — stay on page */
      })
    return () => {
      cancelled = true
    }
  }, [router, to])
}

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const AUTH_PAGES = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
])

const ACCESS_COOKIE = "da_access"
const REFRESH_COOKIE = "da_refresh"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthPage = AUTH_PAGES.has(pathname)
  if (!isAuthPage) {
    return NextResponse.next()
  }

  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value)

  if (hasSession) {
    const home = request.nextUrl.clone()
    home.pathname = "/"
    home.search = ""
    return NextResponse.redirect(home)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/login", "/forgot-password", "/reset-password"],
}

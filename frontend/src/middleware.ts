import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const AUTH_PAGES = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
])

const ACCESS_COOKIE = "da_access"
const REFRESH_COOKIE = "da_refresh"

function hasSession(request: NextRequest): boolean {
  return (
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value)
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const onAuthPage = AUTH_PAGES.has(pathname)
  const signedIn = hasSession(request)

  if (onAuthPage) {
    if (signedIn) {
      const home = request.nextUrl.clone()
      home.pathname = "/"
      home.search = ""
      return NextResponse.redirect(home)
    }
    return NextResponse.next()
  }

  if (!signedIn) {
    const login = request.nextUrl.clone()
    login.pathname = "/login"
    login.search = ""
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}

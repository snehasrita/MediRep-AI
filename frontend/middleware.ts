import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  let user = null;

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch (e) {
    console.error("Middleware auth error:", e);
  }

  // Protected routes - redirect to login if not authenticated
  // But exclude pharmacist auth routes (they should be public)
  const protectedPaths = ["/dashboard", "/account", "/pharmacist"];
  const publicPharmacistPaths = ["/pharmacist/auth"];

  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );
  const isPublicPharmacistPath = publicPharmacistPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !isPublicPharmacistPath && !user) {
    const url = request.nextUrl.clone();
    // Redirect to appropriate auth page based on the path
    if (request.nextUrl.pathname === "/pharmacist/register") {
      // Registration page - send to signup first
      url.pathname = "/pharmacist/auth/signup";
    } else if (request.nextUrl.pathname.startsWith("/pharmacist")) {
      // Other pharmacist pages - send to login
      url.pathname = "/pharmacist/auth/login";
    } else {
      url.pathname = "/auth/login";
    }
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Auth routes - redirect to dashboard if already authenticated
  // Include both user auth and pharmacist auth paths
  const authPaths = ["/auth/login", "/auth/signup", "/auth/forgot-password"];
  const pharmacistAuthPaths = ["/pharmacist/auth/login", "/pharmacist/auth/signup"];

  const isUserAuthPath = authPaths.some(
    (path) => request.nextUrl.pathname === path
  );
  const isPharmacistAuthPath = pharmacistAuthPaths.some(
    (path) => request.nextUrl.pathname === path
  );

  // Only redirect if user is already logged in and on an auth page
  if (isUserAuthPath && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // For pharmacist auth paths, redirect to registration if already logged in
  // (The registration page will check if they're already a pharmacist and redirect to dashboard)
  if (isPharmacistAuthPath && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/pharmacist/register";
    return NextResponse.redirect(url);
  }

  // Admin stealth check - Rewrite non-admins to 404
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // If no user, or user doesn't have admin role, rewrite to 404
    // Note: We check user metadata for 'role' claim
    const isAdmin = user?.app_metadata?.role === 'admin' || user?.user_metadata?.role === 'admin';

    if (!user || !isAdmin) {
      console.log("Stealth block: Unauthorized admin access attempt by", user?.id || "anonymous");
      const url = request.nextUrl.clone();
      url.pathname = '/404'; // Internal 404 page
      return NextResponse.rewrite(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|auth/confirm|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

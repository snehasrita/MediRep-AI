import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/pharmacist/register";

    if (code) {
        // Track cookies that need to be set on the response
        const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

        // Create Supabase client with cookie handling for route handlers
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookies) {
                        // Store cookies to set them on the response later
                        cookiesToSet.push(...cookies);
                    },
                },
            }
        );

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.user) {
            // Create or update user profile in database
            try {
                const { error: profileError } = await supabase
                    .from("user_profiles")
                    .upsert(
                        {
                            id: data.user.id,
                            display_name: data.user.user_metadata?.full_name ||
                                data.user.user_metadata?.name ||
                                data.user.email?.split("@")[0] || null,
                            avatar_url: data.user.user_metadata?.avatar_url ||
                                data.user.user_metadata?.picture || null,
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: "id",
                            ignoreDuplicates: false
                        }
                    );

                if (profileError) {
                    console.error("Error creating/updating user profile:", profileError);
                }
            } catch (e) {
                console.error("Error in profile upsert:", e);
            }

            // Check if user is already a registered pharmacist
            let isPharmacist = false;
            let finalRedirect = next;

            try {
                const { data: pharma } = await supabase
                    .from("pharmacist_profiles")
                    .select("id, verification_status")
                    .eq("user_id", data.user.id)
                    .maybeSingle();

                if (pharma) {
                    isPharmacist = true;
                    // If already a pharmacist, go to dashboard
                    finalRedirect = "/pharmacist/dashboard";
                } else {
                    // Not a pharmacist yet, go to registration
                    finalRedirect = "/pharmacist/register";
                }
            } catch (e) {
                console.error("Error checking pharmacist status:", e);
            }

            // Build redirect URL
            const forwardedHost = request.headers.get("x-forwarded-host");
            const isLocalEnv = process.env.NODE_ENV === "development";

            let redirectUrl: string;
            if (isLocalEnv) {
                redirectUrl = `${origin}${finalRedirect}`;
            } else if (forwardedHost) {
                redirectUrl = `https://${forwardedHost}${finalRedirect}`;
            } else {
                redirectUrl = `${origin}${finalRedirect}`;
            }

            // Create redirect response and set cookies on it
            const response = NextResponse.redirect(redirectUrl);

            // Set all cookies from the Supabase auth exchange on the response
            for (const { name, value, options } of cookiesToSet) {
                response.cookies.set(name, value, options as Record<string, unknown>);
            }

            return response;
        }

        // Log the error for debugging
        if (error) {
            console.error("Auth callback error:", error.message);
        }
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

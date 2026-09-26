import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for Server Components / Route Handlers.
 *
 * IMPORTANT:
 * This client uses the user's Supabase Auth cookies.
 * It is NOT a service-role client.
 *
 * Use this client when you need to know:
 * - who is currently logged in
 * - whether the user has a valid Supabase session
 * - the authenticated user's ID/email
 *
 * Do NOT use this client for privileged service-role database operations.
 * Those should use a separate service-role client with
 * SUPABASE_SERVICE_ROLE_KEY.
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not configured."
    );
  }

  if (!supabasePublishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            /*
             * In some Server Component contexts,
             * cookies cannot be written.
             *
             * Middleware / Route Handlers are responsible
             * for refreshing the session when required.
             */
          }
        },
      },
    }
  );
}
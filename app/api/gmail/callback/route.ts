import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    // ------------------------------------------------------------
    // Google returned an OAuth error
    // ------------------------------------------------------------

    if (errorParam) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/automations/email?gmail_error=${encodeURIComponent(
            errorParam
          )}`,
          url.origin
        )
      );
    }

    // ------------------------------------------------------------
    // Validate OAuth response
    // ------------------------------------------------------------

    if (!code || !state) {
      return NextResponse.json(
        {
          error: "Missing OAuth code or state.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // Validate OAuth state
    // ------------------------------------------------------------

    const cookieHeader = request.headers.get("cookie") || "";

    const storedState = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("gmail_oauth_state="))
      ?.split("=")
      .slice(1)
      .join("=");

    if (!storedState || storedState !== state) {
      return NextResponse.json(
        {
          error: "Invalid OAuth state.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // Google OAuth credentials
    // ------------------------------------------------------------

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        {
          error: "Google OAuth environment variables are missing.",
        },
        { status: 500 }
      );
    }

    // ------------------------------------------------------------
    // Exchange authorization code for Google tokens
    // ------------------------------------------------------------

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
        cache: "no-store",
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error(
        "Google token exchange failed:",
        tokenData
      );

      return NextResponse.json(
        {
          error:
            tokenData.error_description ||
            tokenData.error ||
            "Google token exchange failed.",
        },
        { status: 400 }
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in || 3600);

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Google did not return an access token.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // Get Google account email
    //
    // We use Google's userinfo endpoint instead of Gmail's
    // users/me/profile endpoint.
    // ------------------------------------------------------------

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    const userInfo = await userInfoResponse.json();

    if (!userInfoResponse.ok || !userInfo.email) {
      console.error(
        "Google userinfo request failed:",
        userInfo
      );

      return NextResponse.json(
        {
          error:
            "Unable to retrieve Google account information.",
          googleStatus: userInfoResponse.status,
          googleError: userInfo,
        },
        { status: 400 }
      );
    }

    const googleEmail = String(userInfo.email).trim().toLowerCase();

    // ------------------------------------------------------------
    // Supabase
    // ------------------------------------------------------------

    const supabase = createAdminClient();

    // ------------------------------------------------------------
    // Preserve an existing refresh token if Google doesn't
    // return a new one.
    // ------------------------------------------------------------

    const { data: existingConnection } = await supabase
      .from("gmail_connections")
      .select("id, refresh_token")
      .eq("google_email", googleEmail)
      .maybeSingle();

    const finalRefreshToken =
      refreshToken ||
      existingConnection?.refresh_token ||
      null;

    if (!finalRefreshToken) {
      return NextResponse.json(
        {
          error:
            "Google did not provide a refresh token. Please reconnect Gmail and approve access again.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // Calculate access token expiration
    // ------------------------------------------------------------

    const tokenExpiresAt = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    // ------------------------------------------------------------
    // Save Gmail connection
    // ------------------------------------------------------------

    const { error: upsertError } = await supabase
      .from("gmail_connections")
      .upsert(
        {
          google_email: googleEmail,

          access_token: accessToken,

          refresh_token: finalRefreshToken,

          token_expires_at: tokenExpiresAt,

          scopes: GMAIL_SCOPES,

          active: true,
        },
        {
          onConflict: "google_email",
        }
      );

    if (upsertError) {
      console.error(
        "Failed to save Gmail connection:",
        upsertError
      );

      return NextResponse.json(
        {
          error:
            upsertError.message ||
            "Unable to save Gmail connection.",
        },
        { status: 500 }
      );
    }

    // ------------------------------------------------------------
    // Remove OAuth state cookie
    // ------------------------------------------------------------

    const response = NextResponse.redirect(
      new URL(
        "/dashboard/automations/email?gmail_connected=true",
        url.origin
      )
    );

    response.cookies.set("gmail_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error(
      "Gmail callback error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete Gmail connection.",
      },
      { status: 500 }
    );
  }
}
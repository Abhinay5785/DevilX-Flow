import { NextResponse } from "next/server";
import { createAdminClient as createClient } from "@/lib/supabase/admin";

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

    // Google returned an OAuth error
    if (errorParam) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/automations/email?gmail_error=${encodeURIComponent(
            errorParam,
          )}`,
          url.origin,
        ),
      );
    }

    // Validate OAuth response
    if (!code || !state) {
      return NextResponse.json(
        {
          error: "Missing OAuth code or state.",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // Validate OAuth state cookie
    // ---------------------------------------------------------

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
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // Google OAuth environment variables
    // ---------------------------------------------------------

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId) {
      return NextResponse.json(
        {
          error: "GOOGLE_CLIENT_ID is missing.",
        },
        { status: 500 },
      );
    }

    if (!clientSecret) {
      return NextResponse.json(
        {
          error: "GOOGLE_CLIENT_SECRET is missing.",
        },
        { status: 500 },
      );
    }

    if (!redirectUri) {
      return NextResponse.json(
        {
          error: "GOOGLE_REDIRECT_URI is missing.",
        },
        { status: 500 },
      );
    }

    // ---------------------------------------------------------
    // Exchange Google authorization code for tokens
    // ---------------------------------------------------------

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
      },
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Google token exchange failed:", tokenData);

      return NextResponse.json(
        {
          error:
            tokenData?.error_description ||
            tokenData?.error ||
            "Google token exchange failed.",
        },
        { status: 400 },
      );
    }

    const accessToken = tokenData?.access_token;
    const refreshToken = tokenData?.refresh_token;
    const expiresIn = Number(tokenData?.expires_in || 3600);

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Google did not return an access token.",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // Get Google account information
    // ---------------------------------------------------------

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    const userInfo = await userInfoResponse.json();

    if (!userInfoResponse.ok || !userInfo?.email) {
      console.error(
        "Google userinfo request failed:",
        userInfo,
      );

      return NextResponse.json(
        {
          error: "Unable to retrieve Google account information.",
          googleStatus: userInfoResponse.status,
          googleError: userInfo,
        },
        { status: 400 },
      );
    }

    const googleEmail = String(userInfo.email)
      .trim()
      .toLowerCase();

    // ---------------------------------------------------------
    // IMPORTANT:
    // Use the Supabase SERVICE ROLE client.
    //
    // DevilX Flow does not have a Supabase Auth admin session,
    // so the normal browser/server client can be blocked by RLS.
    // ---------------------------------------------------------

    const supabase = createClient();

    // ---------------------------------------------------------
    // Check whether this Gmail account already exists
    // ---------------------------------------------------------

    const {
      data: existingConnection,
      error: existingError,
    } = await supabase
      .from("gmail_connections")
      .select("id, refresh_token")
      .eq("google_email", googleEmail)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Failed to read existing Gmail connection:",
        existingError,
      );

      return NextResponse.json(
        {
          error: existingError.message,
        },
        { status: 500 },
      );
    }

    // Google may not return refresh_token when the user has
    // already authorized the application.
    //
    // Therefore, preserve the existing refresh token.
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
        { status: 400 },
      );
    }

    // ---------------------------------------------------------
    // Calculate token expiry
    // ---------------------------------------------------------

    const tokenExpiresAt = new Date(
      Date.now() + expiresIn * 1000,
    ).toISOString();

    // ---------------------------------------------------------
    // Save Gmail connection
    // ---------------------------------------------------------

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
        },
      );

    if (upsertError) {
      console.error(
        "Failed to save Gmail connection:",
        upsertError,
      );

      return NextResponse.json(
        {
          error:
            upsertError.message ||
            "Unable to save Gmail connection.",
        },
        { status: 500 },
      );
    }

    // ---------------------------------------------------------
    // Clear OAuth state cookie
    // ---------------------------------------------------------

    const response = NextResponse.redirect(
      new URL(
        "/dashboard/automations/email?gmail_connected=true",
        url.origin,
      ),
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
    console.error("Gmail callback error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete Gmail connection.",
      },
      { status: 500 },
    );
  }
}
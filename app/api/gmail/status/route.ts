import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("gmail_connections")
      .select(
        "id,google_email,scopes,active,token_expires_at,created_at,updated_at"
      )
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Gmail status error:", error);

      return NextResponse.json(
        {
          connected: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      connected: Boolean(data),
      connection: data
        ? {
            id: data.id,
            email: data.google_email,
            scopes: data.scopes,
            active: data.active,
            tokenExpiresAt: data.token_expires_at,
          }
        : null,
    });
  } catch (error) {
    console.error("Gmail status exception:", error);

    return NextResponse.json(
      {
        connected: false,
        error: "Unable to check Gmail connection.",
      },
      { status: 500 }
    );
  }
}
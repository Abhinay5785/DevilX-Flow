import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.redirect(
        new URL("/404", _request.url),
      );
    }

    const { data: batch, error } = await supabase
      .from("course_batches")
      .select("id, whatsapp_community_url")
      .eq("whatsapp_join_token", token)
      .maybeSingle();

    if (error || !batch?.whatsapp_community_url) {
      return NextResponse.redirect(
        new URL("/404", _request.url),
      );
    }

    return NextResponse.redirect(batch.whatsapp_community_url, 302);
  } catch {
    return NextResponse.redirect(
      new URL("/404", _request.url),
    );
  }
}
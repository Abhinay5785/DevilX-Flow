import { NextRequest, NextResponse } from "next/server";
import { createAdminClient as createClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("automation_settings")
      .select("email_enabled, whatsapp_enabled")
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      settings: {
        emailEnabled: data?.email_enabled ?? true,
        whatsappEnabled: data?.whatsapp_enabled ?? true,
      },
    });
  } catch (error) {
    console.error("Load automation settings error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load automation settings.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createClient();
    const update: Record<string, boolean> = {};

    if (typeof body.emailEnabled === "boolean") {
      update.email_enabled = body.emailEnabled;
    }

    if (typeof body.whatsappEnabled === "boolean") {
      update.whatsapp_enabled = body.whatsappEnabled;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid setting provided." },
        { status: 400 },
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("automation_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    let result;

    if (existing?.id) {
      result = await supabase
        .from("automation_settings")
        .update(update)
        .eq("id", existing.id)
        .select("email_enabled, whatsapp_enabled")
        .single();
    } else {
      result = await supabase
        .from("automation_settings")
        .insert(update)
        .select("email_enabled, whatsapp_enabled")
        .single();
    }

    if (result.error) throw new Error(result.error.message);

    return NextResponse.json({
      success: true,
      settings: {
        emailEnabled: result.data.email_enabled,
        whatsappEnabled: result.data.whatsapp_enabled,
      },
    });
  } catch (error) {
    console.error("Update automation settings error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update automation settings.",
      },
      { status: 500 },
    );
  }
}

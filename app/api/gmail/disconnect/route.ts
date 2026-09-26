import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = createAdminClient();

    const { data: connections, error: findError } = await supabase
      .from("gmail_connections")
      .select("id")
      .eq("active", true);

    if (findError) {
      return NextResponse.json(
        {
          error: findError.message,
        },
        { status: 500 }
      );
    }

    if (connections?.length) {
      const ids = connections.map((connection) => connection.id);

      const { error: deleteError } = await supabase
        .from("gmail_connections")
        .delete()
        .in("id", ids);

      if (deleteError) {
        return NextResponse.json(
          {
            error: deleteError.message,
          },
          { status: 500 }
        );
      }
    }

    // Make existing automations show Gmail as disconnected.
    const { error: automationError } = await supabase
      .from("email_automations")
      .update({
        gmail_connected: false,
      })
      .eq("gmail_connected", true);

    if (automationError) {
      console.error(
        "Failed to update automation Gmail status:",
        automationError
      );
    }

    return NextResponse.json({
      success: true,
      connected: false,
    });
  } catch (error) {
    console.error("Gmail disconnect error:", error);

    return NextResponse.json(
      {
        error: "Unable to disconnect Gmail.",
      },
      { status: 500 }
    );
  }
}
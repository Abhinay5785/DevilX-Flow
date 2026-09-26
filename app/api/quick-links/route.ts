import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  normalizeLinkInput,
  validateLinkInput,
} from "@/lib/quick-links";

export const dynamic = "force-dynamic";

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not configured."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("quick_links")
      .select(
        "id,title,url,is_pinned,created_at,updated_at"
      )
      .order("is_pinned", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Quick Links GET failed:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      links: data ?? [],
    });
  } catch (error) {
    console.error(
      "Quick Links GET server error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load quick links.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const { title, url } =
      normalizeLinkInput(body);

    const validationError =
      validateLinkInput(title, url);

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
        },
        {
          status: 400,
        }
      );
    }

    const supabase = getAdminSupabase();

    const { data, error } =
      await supabase
        .from("quick_links")
        .insert({
          title,
          url,
          is_pinned: Boolean(
            body.is_pinned
          ),
        })
        .select(
          "id,title,url,is_pinned,created_at,updated_at"
        )
        .single();

    if (error) {
      console.error(
        "Quick Links POST failed:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        link: data,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Quick Links POST server error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create quick link.",
      },
      {
        status: 500,
      }
    );
  }
}
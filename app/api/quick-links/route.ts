import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

import {
  normalizeLinkInput,
  validateLinkInput,
} from "@/lib/quick-links";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("quick_links")
      .select(
        "id,title,url,is_pinned,created_at,updated_at",
      )
      .order("is_pinned", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      links: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load quick links.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body = await request.json();

    const { title, url } =
      normalizeLinkInput(body);

    const validationError =
      validateLinkInput(title, url);

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("quick_links")
      .insert({
        title,
        url,
        is_pinned: Boolean(body.is_pinned),
      })
      .select(
        "id,title,url,is_pinned,created_at,updated_at",
      )
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        link: data,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create quick link.",
      },
      { status: 500 },
    );
  }
}
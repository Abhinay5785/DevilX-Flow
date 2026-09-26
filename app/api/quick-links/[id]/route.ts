import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

import {
  normalizeLinkInput,
  validateLinkInput,
} from "@/lib/quick-links";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Link id is required." },
        { status: 400 },
      );
    }

    const body = await request.json();

    const updates: {
      title?: string;
      url?: string;
      is_pinned?: boolean;
    } = {};

    if (
      body.title !== undefined ||
      body.url !== undefined
    ) {
      const { title, url } = normalizeLinkInput({
        title: body.title,
        url: body.url,
      });

      const validationError =
        validateLinkInput(title, url);

      if (validationError) {
        return NextResponse.json(
          { error: validationError },
          { status: 400 },
        );
      }

      updates.title = title;
      updates.url = url;
    }

    if (typeof body.is_pinned === "boolean") {
      updates.is_pinned = body.is_pinned;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("quick_links")
      .update(updates)
      .eq("id", id)
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

    if (!data) {
      return NextResponse.json(
        { error: "Link not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      link: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update quick link.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Link id is required." },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("quick_links")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete quick link.",
      },
      { status: 500 },
    );
  }
}
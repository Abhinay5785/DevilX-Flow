import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  normalizeLinkInput,
  validateLinkInput,
} from "@/lib/quick-links";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Link id is required.",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await request.json();

    const updates: {
      title?: string;
      url?: string;
      is_pinned?: boolean;
    } = {};

    if (
      body.title !== undefined ||
      body.url !== undefined
    ) {
      const { title, url } =
        normalizeLinkInput({
          title: body.title,
          url: body.url,
        });

      const validationError =
        validateLinkInput(
          title,
          url
        );

      if (validationError) {
        return NextResponse.json(
          {
            error:
              validationError,
          },
          {
            status: 400,
          }
        );
      }

      updates.title = title;
      updates.url = url;
    }

    if (
      typeof body.is_pinned ===
      "boolean"
    ) {
      updates.is_pinned =
        body.is_pinned;
    }

    if (
      Object.keys(updates)
        .length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid fields to update.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getAdminSupabase();

    const {
      data,
      error,
    } = await supabase
      .from("quick_links")
      .update(updates)
      .eq("id", id)
      .select(
        "id,title,url,is_pinned,created_at,updated_at"
      )
      .single();

    if (error) {
      console.error(
        "Quick Links PATCH failed:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Link not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      link: data,
    });
  } catch (error) {
    console.error(
      "Quick Links PATCH server error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update quick link.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Link id is required.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getAdminSupabase();

    const { error } =
      await supabase
        .from("quick_links")
        .delete()
        .eq("id", id);

    if (error) {
      console.error(
        "Quick Links DELETE failed:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Quick Links DELETE server error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete quick link.",
      },
      {
        status: 500,
      }
    );
  }
}
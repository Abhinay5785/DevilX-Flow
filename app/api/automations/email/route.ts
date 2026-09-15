import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Trigger = {
  field?: string;
  operator?: string;
  value?: string;
};

type Recipient = {
  name?: string;
  email?: string;
};

type FooterLink = {
  id?: string;
  label?: string;
  url?: string;
};

function buildPayload(body: any) {
  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  const subject =
    typeof body.subject === "string"
      ? body.subject
      : "";

  const html =
    typeof body.html === "string"
      ? body.html
      : "";

  const trigger: Trigger = {
    field: body.trigger?.field,
    operator: body.trigger?.operator,
    value:
      typeof body.trigger?.value === "string"
        ? body.trigger.value
        : "",
  };

  const recipient: Recipient = {
    name:
      typeof body.recipient?.name === "string"
        ? body.recipient.name
        : "",
    email:
      typeof body.recipient?.email === "string"
        ? body.recipient.email
        : "",
  };

  const footerLinks: FooterLink[] =
    Array.isArray(body.footer?.links)
      ? body.footer.links.map(
          (link: FooterLink) => ({
            id: link.id,
            label:
              typeof link.label === "string"
                ? link.label
                : "",
            url:
              typeof link.url === "string"
                ? link.url
                : "",
          })
        )
      : [];

  const delayMinutes = Math.max(
    0,
    Number.isFinite(Number(body.delayMinutes))
      ? Number(body.delayMinutes)
      : 0
  );

  return {
    name,
    trigger,
    recipient,
    subject,

    blocks: Array.isArray(body.blocks)
      ? body.blocks
      : [],

    html,

    footer: {
      text:
        typeof body.footer?.text === "string"
          ? body.footer.text
          : "",

      links: footerLinks,
    },

    delay_minutes:
      Math.floor(delayMinutes),

    gmail_connected:
      Boolean(body.gmailConnected),
  };
}


/* ============================================================
   GET
   ============================================================

   GET /api/automations/email

   → Returns all email automations

   GET /api/automations/email?id=AUTOMATION_ID

   → Returns one automation
   ============================================================ */

export async function GET(
  request: Request
) {
  try {
    const url = new URL(
      request.url
    );

    const id =
      url.searchParams.get("id");

    const supabase =
      await createClient();


    /* --------------------------------------------------------
       Get single automation
       -------------------------------------------------------- */

    if (id) {
      const { data, error } =
        await supabase
          .from(
            "email_automations"
          )
          .select(
            "id,name,active,trigger,recipient,subject,blocks,html,footer,delay_minutes,gmail_connected,triggered_count,sent_count,failed_count,created_at,updated_at"
          )
          .eq(
            "id",
            id
          )
          .single();

      if (error) {
        return NextResponse.json(
          {
            error:
              error.message ||
              "Automation not found.",
          },
          {
            status: 404,
          }
        );
      }

      return NextResponse.json({
        automation: data,
      });
    }


    /* --------------------------------------------------------
       Get all automations
       -------------------------------------------------------- */

    const { data, error } =
      await supabase
        .from(
          "email_automations"
        )
        .select(
          "id,name,active,trigger,recipient,subject,delay_minutes,gmail_connected,triggered_count,sent_count,failed_count,created_at,updated_at"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (error) {
      console.error(
        "Failed to list email automations:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Unable to load automations.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      automations: data ?? [],
    });

  } catch (error) {
    console.error(
      "Email automation GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load email automations.",
      },
      {
        status: 500,
      }
    );
  }
}


/* ============================================================
   POST
   ============================================================

   Create a NEW email automation
   ============================================================ */

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const payload =
      buildPayload(body);


    /* --------------------------------------------------------
       Validation
       -------------------------------------------------------- */

    if (!payload.name) {
      return NextResponse.json(
        {
          error:
            "Automation name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!payload.subject.trim()) {
      return NextResponse.json(
        {
          error:
            "Email subject is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!payload.html.trim()) {
      return NextResponse.json(
        {
          error:
            "Email content is required.",
        },
        {
          status: 400,
        }
      );
    }


    /* --------------------------------------------------------
       Supabase
       -------------------------------------------------------- */

    const supabase =
      await createClient();

    const { data, error } =
      await supabase
        .from(
          "email_automations"
        )
        .insert({
          ...payload,

          active: true,
        })
        .select("id")
        .single();


    if (error) {
      console.error(
        "Failed to create email automation:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Unable to save email automation.",
        },
        {
          status: 500,
        }
      );
    }


    return NextResponse.json(
      {
        success: true,
        id: data.id,
      },
      {
        status: 201,
      }
    );

  } catch (error) {
    console.error(
      "Email automation POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Invalid request.",
      },
      {
        status: 400,
      }
    );
  }
}


/* ============================================================
   PATCH
   ============================================================

   Update automation:

   PATCH /api/automations/email?id=AUTOMATION_ID

   Also supports:

   {
     "active": false
   }

   to pause an automation.

   ============================================================ */

export async function PATCH(
  request: Request
) {
  try {
    const url = new URL(
      request.url
    );

    const id =
      url.searchParams.get("id");


    if (!id) {
      return NextResponse.json(
        {
          error:
            "Automation ID is required.",
        },
        {
          status: 400,
        }
      );
    }


    const body =
      await request.json();

    const supabase =
      await createClient();


    /* --------------------------------------------------------
       Activate / Pause
       -------------------------------------------------------- */

    if (
      typeof body.active ===
      "boolean"
    ) {
      const { data, error } =
        await supabase
          .from(
            "email_automations"
          )
          .update({
            active:
              body.active,
          })
          .eq(
            "id",
            id
          )
          .select(
            "id,active"
          )
          .single();

      if (error) {
        return NextResponse.json(
          {
            error:
              error.message ||
              "Unable to update automation.",
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        success: true,
        automation: data,
      });
    }


    /* --------------------------------------------------------
       Full automation update
       -------------------------------------------------------- */

    const payload =
      buildPayload(body);


    if (!payload.name) {
      return NextResponse.json(
        {
          error:
            "Automation name is required.",
        },
        {
          status: 400,
        }
      );
    }


    if (!payload.subject.trim()) {
      return NextResponse.json(
        {
          error:
            "Email subject is required.",
        },
        {
          status: 400,
        }
      );
    }


    if (!payload.html.trim()) {
      return NextResponse.json(
        {
          error:
            "Email content is required.",
        },
        {
          status: 400,
        }
      );
    }


    const { data, error } =
      await supabase
        .from(
          "email_automations"
        )
        .update(
          payload
        )
        .eq(
          "id",
          id
        )
        .select("id")
        .single();


    if (error) {
      console.error(
        "Failed to update email automation:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Unable to update email automation.",
        },
        {
          status: 500,
        }
      );
    }


    return NextResponse.json({
      success: true,
      id: data.id,
    });

  } catch (error) {
    console.error(
      "Email automation PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Invalid update request.",
      },
      {
        status: 400,
      }
    );
  }
}


/* ============================================================
   DELETE
   ============================================================

   DELETE /api/automations/email?id=AUTOMATION_ID

   ============================================================ */

export async function DELETE(
  request: Request
) {
  try {
    const url = new URL(
      request.url
    );

    const id =
      url.searchParams.get("id");


    if (!id) {
      return NextResponse.json(
        {
          error:
            "Automation ID is required.",
        },
        {
          status: 400,
        }
      );
    }


    const supabase =
      await createClient();


    const { error } =
      await supabase
        .from(
          "email_automations"
        )
        .delete()
        .eq(
          "id",
          id
        );


    if (error) {
      return NextResponse.json(
        {
          error:
            error.message ||
            "Unable to delete automation.",
        },
        {
          status: 500,
        }
      );
    }


    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error(
      "Email automation DELETE error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete automation.",
      },
      {
        status: 500,
      }
    );
  }
}
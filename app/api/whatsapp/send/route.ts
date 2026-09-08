import { NextResponse } from "next/server";

const WHAPTER_TRIGGER_URL = process.env.WHAPTER_TRIGGER_URL;
const WHAPTER_API_KEY = process.env.WHAPTER_API_KEY;

type Recipient = {
  id: string;
  phone: string;
  variables: string[];
};

export async function POST(request: Request) {
  if (!WHAPTER_TRIGGER_URL || !WHAPTER_API_KEY) {
    return NextResponse.json(
      { error: "WhatsApp is not configured. Add WHAPTER_TRIGGER_URL and WHAPTER_API_KEY to server environment variables." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const templateName = String(body.templateName || "").trim();
    const languageCode = String(body.languageCode || "en_US").trim();
    const recipients = Array.isArray(body.recipients) ? (body.recipients as Recipient[]) : [];

    if (!templateName) {
      return NextResponse.json({ error: "templateName is required." }, { status: 400 });
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No recipients supplied." }, { status: 400 });
    }

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: string; phone: string; error: string }> = [];

    // Send one request per student. This matches Whapter's trigger API shape
    // and prevents one bad phone number from stopping the whole batch.
    for (const recipient of recipients) {
      const phone = String(recipient.phone || "").trim();
      if (!phone) {
        failed += 1;
        errors.push({ id: recipient.id, phone: "", error: "Phone number missing" });
        continue;
      }

      try {
        const response = await fetch(WHAPTER_TRIGGER_URL, {
          method: "POST",
          headers: {
            "x-api-key": WHAPTER_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: phone.startsWith("+") ? phone : `+${phone}`,
            template_name: templateName,
            language_code: languageCode,
            variables: recipient.variables || [],
          }),
          cache: "no-store",
        });

        const text = await response.text();
        let result: unknown = text;
        try {
          result = text ? JSON.parse(text) : null;
        } catch {
          // Keep the raw response when Whapter does not return JSON.
        }

        if (!response.ok) {
          failed += 1;
          errors.push({
            id: recipient.id,
            phone,
            error: typeof result === "string" ? result : JSON.stringify(result),
          });
        } else {
          sent += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push({
          id: recipient.id,
          phone,
          error: error instanceof Error ? error.message : "Request failed",
        });
      }
    }

    return NextResponse.json({
      sent,
      failed,
      total: recipients.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}

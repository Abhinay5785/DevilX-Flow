import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  const digits = clean(value).replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseTime(value: unknown) {
  const text = clean(value);
  if (/^\d{1,2}:\d{2}$/.test(text)) return text;
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text)) return text.toUpperCase();
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CONSULTATION_SYNC_SECRET;
  const receivedSecret = request.headers.get("x-consultation-sync-secret");

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("action") !== "pending-recordings") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase server environment variables are missing." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const yesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("consultations")
    .select("id,student_name,booking_date,booking_time,meet_link,source_event_id,meet_code,recording_link")
    .is("recording_link", null)
    .gte("booking_date", yesterday.toISOString().slice(0, 10))
    .lte("booking_date", tomorrow.toISOString().slice(0, 10))
    .order("booking_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, consultations: data ?? [] });
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CONSULTATION_SYNC_SECRET;
  const receivedSecret = request.headers.get("x-consultation-sync-secret");

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase server environment variables are missing." },
      { status: 500 },
    );
  }

  const action = clean(request.nextUrl.searchParams.get("action"));
  const body = request.method === "POST" ? await request.json() : {};

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "recording") {
    const consultationId = clean(body.consultationId);
    const recordingLink = clean(body.recordingLink);

    if (!consultationId || !recordingLink) {
      return NextResponse.json(
        { error: "consultationId and recordingLink are required." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("consultations")
      .update({ recording_link: recordingLink })
      .eq("id", consultationId)
      .select("*")
      .single();

    if (error) {
      console.error("Recording link update failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, consultation: data });
  }

  if (action === "pending-recordings") {
    // Only return sessions that have already started and are still missing a
    // recording. The 48-hour window prevents an ever-growing Drive search.
    const now = new Date();
    const yesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const today = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("consultations")
      .select("id,student_name,booking_date,booking_time,meet_link,source_event_id,meet_code,recording_link")
      .is("recording_link", null)
      .gte("booking_date", yesterday.toISOString().slice(0, 10))
      .lte("booking_date", today.toISOString().slice(0, 10))
      .order("booking_date", { ascending: true });

    if (error) {
      console.error("Pending recording lookup failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, consultations: data ?? [] });
  }

  const sourceSheetId = Number(body.sourceSheetId);
  const sourceRow = Number(body.sourceRow);
  const email = clean(body.email).toLowerCase();
  const studentName = clean(body.name) || "Unknown student";
  const bookingDate = parseDate(body.bookingDate);
  const bookingTime = parseTime(body.bookingTime);

  if (!Number.isFinite(sourceSheetId) || !Number.isFinite(sourceRow)) {
    return NextResponse.json(
      { error: "sourceSheetId and sourceRow are required." },
      { status: 400 },
    );
  }

  if (!bookingDate || !bookingTime) {
    return NextResponse.json(
      { error: "A valid consultation date and time are required." },
      { status: 400 },
    );
  }

  let customer: any = null;

  if (email) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,email,phone")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Consultation customer lookup failed:", error);
    } else {
      customer = data;
    }
  }

  if (!customer) {
    return NextResponse.json(
      {
        error:
          "Customer not found in Supabase. The consultation was not created. Check that the Google Form email matches the customer email.",
        email,
      },
      { status: 422 },
    );
  }

  const { data: paymentRows, error: paymentError } = await supabase
    .from("payments")
    .select("id,payment_id,amount,status,payment_time,course,customer_id")
    .eq("customer_id", customer.id)
    .ilike("course", "Consultation")
    .order("payment_time", { ascending: false })
    .limit(1);

  if (paymentError) {
    console.error("Consultation payment lookup failed:", paymentError);
  }

  const payment = paymentRows?.[0] ?? null;

  const payload = {
    source_sheet_id: sourceSheetId,
    source_row: sourceRow,
    customer_id: customer.id,
    payment_record_id: payment?.id ?? null,
    payment_id: payment?.payment_id ?? null,
    student_name: studentName,
    email,
    phone: normalizePhone(customer.phone),
    consultation_type: clean(body.consultationType) || null,
    payment_amount: Number(payment?.amount ?? 0),
    payment_status:
      String(payment?.status ?? "pending").toLowerCase() === "captured" ||
      String(payment?.status ?? "pending").toLowerCase() === "paid"
        ? "Paid"
        : String(payment?.status ?? "pending").toLowerCase() === "failed"
          ? "Failed"
          : "Pending",
    payment_time: payment?.payment_time ?? null,
    booking_date: bookingDate,
    booking_time: bookingTime,
    meet_link: clean(body.meetLink) || null,
    source_event_id: clean(body.sourceEventId) || null,
    meet_code: clean(body.meetCode) || null,
  };

  const { data, error } = await supabase
    .from("consultations")
    .upsert(payload, { onConflict: "source_sheet_id,source_row" })
    .select("*")
    .single();

  if (error) {
    console.error("Consultation sync failed:", error);
    return NextResponse.json(
      { error: error.message, details: error.details ?? null },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, consultation: data });
}

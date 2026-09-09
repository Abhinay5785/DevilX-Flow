import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/* =========================================================
   HELPERS
========================================================= */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  const digits = clean(value).replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function parseDate(value: unknown) {
  const text = clean(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseTime(value: unknown) {
  const text = clean(value);

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text)) {
    return text.toUpperCase();
  }

  const date = new Date(text);

  if (!Number.isFinite(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/* =========================================================
   SUPABASE
========================================================= */

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server environment variables are missing."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* =========================================================
   AUTHENTICATION
========================================================= */

function isAuthorized(request: NextRequest) {
  const expectedSecret =
    process.env.CONSULTATION_SYNC_SECRET;

  const receivedSecret =
    request.headers.get(
      "x-consultation-sync-secret"
    );

  return (
    !!expectedSecret &&
    receivedSecret === expectedSecret
  );
}

/* =========================================================
   FIND CUSTOMER BY EMAIL
========================================================= */

async function findCustomerByEmail(
  supabase: ReturnType<typeof getSupabase>,
  email: string
) {
  if (!email) {
    return null;
  }

  const normalizedEmail =
    email.trim().toLowerCase();

  /* Exact match */

  const { data, error } =
    await supabase
      .from("customers")
      .select(
        "id,name,email,phone"
      )
      .eq(
        "email",
        normalizedEmail
      )
      .limit(1)
      .maybeSingle();

  if (!error && data) {
    return data;
  }

  /* Case-insensitive fallback */

  const {
    data: ilikeData,
    error: ilikeError,
  } = await supabase
    .from("customers")
    .select(
      "id,name,email,phone"
    )
    .ilike(
      "email",
      normalizedEmail
    )
    .limit(1)
    .maybeSingle();

  if (ilikeError) {
    console.error(
      "Consultation customer lookup failed:",
      ilikeError
    );

    return null;
  }

  return ilikeData ?? null;
}

/* =========================================================
   FIND CONSULTATION PAYMENT
========================================================= */

async function findConsultationPayment(
  supabase: ReturnType<typeof getSupabase>,
  customerId: string
) {
  if (!customerId) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("payments")
    .select(
      "id,payment_id,amount,status,payment_time,course,payment_type,customer_id"
    )
    .eq(
      "customer_id",
      customerId
    )
    .order(
      "payment_time",
      {
        ascending: false,
      }
    )
    .limit(50);

  if (error) {
    console.error(
      "Consultation payment lookup failed:",
      error
    );

    return null;
  }

  const payments = data ?? [];

  const consultationPayment =
    payments.find(
      (payment: any) => {

        const course =
          clean(
            payment.course
          ).toLowerCase();

        const paymentType =
          clean(
            payment.payment_type
          ).toLowerCase();

        return (
          course === "consultation" ||
          paymentType === "consultation"
        );
      }
    );

  return (
    consultationPayment ??
    null
  );
}

/* =========================================================
   GET

   Supported actions:

   - pending-recordings
   - rematch-payments
========================================================= */

export async function GET(
  request: NextRequest
) {

  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  let supabase;

  try {
    supabase =
      getSupabase();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration error.",
      },
      {
        status: 500,
      }
    );
  }

  const action =
    clean(
      request.nextUrl.searchParams.get(
        "action"
      )
    );

  /* =======================================================
     PENDING RECORDINGS
  ======================================================= */

  if (
    action ===
    "pending-recordings"
  ) {

    const now =
      new Date();

    const yesterday =
      new Date(
        now.getTime() -
        48 *
          60 *
          60 *
          1000
      );

    const tomorrow =
      new Date(
        now.getTime() +
        24 *
          60 *
          60 *
          1000
      );

    const {
      data,
      error,
    } = await supabase
      .from("consultations")
      .select(
        [
          "id",
          "student_name",
          "email",
          "booking_date",
          "booking_time",
          "meet_link",
          "source_event_id",
          "meet_code",
          "recording_link",
        ].join(",")
      )
      .is(
        "recording_link",
        null
      )
      .gte(
        "booking_date",
        yesterday
          .toISOString()
          .slice(0, 10)
      )
      .lte(
        "booking_date",
        tomorrow
          .toISOString()
          .slice(0, 10)
      )
      .order(
        "booking_date",
        {
          ascending: true,
        }
      );

    if (error) {
      console.error(
        "Pending recording lookup failed:",
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
      consultations:
        data ?? [],
    });
  }

  /* =======================================================
     REMATCH PAYMENTS

     IMPORTANT:

     A consultation is NOT dependent on payment.

     If the person books first:
       customer_id = NULL
       payment_record_id = NULL
       payment_status = Pending

     If they pay later:
       customer_id gets linked
       payment gets linked
       payment status gets updated
  ======================================================= */

  if (
    action ===
    "rematch-payments"
  ) {

    const {
      data: consultations,
      error,
    } = await supabase
      .from("consultations")
      .select(
        [
          "id",
          "email",
          "customer_id",
          "payment_record_id",
          "payment_id",
          "payment_status",
        ].join(",")
      )
      .or(
        "payment_record_id.is.null,payment_status.eq.Pending"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      )
      .limit(200);

    if (error) {
      console.error(
        "Consultation rematch lookup failed:",
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

    let checked = 0;
    let matchedCustomers = 0;
    let matchedPayments = 0;

    for (
      const consultation
      of consultations ?? []
    ) {

      checked++;

      const email =
        clean(
          consultation.email
        ).toLowerCase();

      if (!email) {
        continue;
      }

      const customer =
        await findCustomerByEmail(
          supabase,
          email
        );

      if (!customer) {
        continue;
      }

      matchedCustomers++;

      const payment =
        await findConsultationPayment(
          supabase,
          customer.id
        );

      /* ===================================================
         CUSTOMER FOUND
         PAYMENT NOT FOUND
      =================================================== */

      if (!payment) {

        const {
          error:
            customerUpdateError,
        } = await supabase
          .from(
            "consultations"
          )
          .update({

            customer_id:
              customer.id,

            phone:
              normalizePhone(
                customer.phone
              ),

            updated_at:
              new Date().toISOString(),

          })
          .eq(
            "id",
            consultation.id
          );

        if (
          customerUpdateError
        ) {
          console.error(
            "Customer rematch update failed:",
            customerUpdateError
          );
        }

        continue;
      }

      /* ===================================================
         PAYMENT FOUND
      =================================================== */

      const paymentStatus =
        String(
          payment.status ??
            "pending"
        ).toLowerCase();

      let normalizedPaymentStatus =
        "Pending";

      if (
        paymentStatus ===
          "captured" ||
        paymentStatus ===
          "paid"
      ) {

        normalizedPaymentStatus =
          "Paid";

      } else if (
        paymentStatus ===
        "failed"
      ) {

        normalizedPaymentStatus =
          "Failed";
      }

      /*
       * IMPORTANT:
       *
       * Do NOT replace student_name
       * with customer.name.
       *
       * The name entered in the Google
       * Form should remain the consultation
       * name.
       */

      const {
        error:
          updateError,
      } = await supabase
        .from(
          "consultations"
        )
        .update({

          customer_id:
            customer.id,

          payment_record_id:
            payment.id,

          payment_id:
            payment.payment_id ??
            null,

          phone:
            normalizePhone(
              customer.phone
            ),

          payment_amount:
            Number(
              payment.amount ??
                0
            ),

          payment_status:
            normalizedPaymentStatus,

          payment_time:
            payment.payment_time ??
            null,

          updated_at:
            new Date().toISOString(),

        })
        .eq(
          "id",
          consultation.id
        );

      if (updateError) {

        console.error(
          "Payment rematch update failed:",
          updateError
        );

      } else {

        matchedPayments++;

      }
    }

    return NextResponse.json({

      ok: true,

      checked,

      matchedCustomers,

      matchedPayments,

    });
  }

  return NextResponse.json(
    {
      error:
        "Unsupported action. Use pending-recordings or rematch-payments.",
    },
    {
      status: 400,
    }
  );
}

/* =========================================================
   POST

   Supported actions:

   - new consultation
   - recording update
========================================================= */

export async function POST(
  request: NextRequest
) {

  if (!isAuthorized(request)) {

    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );

  }

  let supabase;

  try {

    supabase =
      getSupabase();

  } catch (error) {

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration error.",
      },
      {
        status: 500,
      }
    );

  }

  const action =
    clean(
      request.nextUrl.searchParams.get(
        "action"
      )
    );

  let body: any;

  try {

    body =
      await request.json();

  } catch {

    return NextResponse.json(
      {
        error:
          "Invalid JSON body.",
      },
      {
        status: 400,
      }
    );

  }

  /* =======================================================
     RECORDING UPDATE
  ======================================================= */

  if (
    action ===
    "recording"
  ) {

    const consultationId =
      clean(
        body.consultationId
      );

    const recordingLink =
      clean(
        body.recordingLink
      );

    if (
      !consultationId ||
      !recordingLink
    ) {

      return NextResponse.json(
        {
          error:
            "consultationId and recordingLink are required.",
        },
        {
          status: 400,
        }
      );

    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "consultations"
      )
      .update({

        recording_link:
          recordingLink,

        updated_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        consultationId
      )
      .select("*")
      .single();

    if (error) {

      console.error(
        "Recording link update failed:",
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

      consultation:
        data,

    });

  }

  /* =======================================================
     NORMAL CONSULTATION CREATION
  ======================================================= */

  const sourceSheetId =
    Number(
      body.sourceSheetId
    );

  const sourceRow =
    Number(
      body.sourceRow
    );

  const email =
    clean(
      body.email
    ).toLowerCase();

  const studentName =
    clean(
      body.name
    ) ||
    "Unknown student";

  const bookingDate =
    parseDate(
      body.bookingDate
    );

  const bookingTime =
    parseTime(
      body.bookingTime
    );

  const consultationType =
    clean(
      body.consultationType
    ) ||
    null;

  const meetLink =
    clean(
      body.meetLink
    ) ||
    null;

  /*
   * Google Calendar Event ID.
   *
   * This is the unique identifier
   * for the consultation.
   */

  const sourceEventId =
    clean(
      body.sourceEventId
    ) ||
    null;

  /*
   * Google Meet conference code.
   *
   * Example:
   * abc-defg-hij
   */

  const meetCode =
    clean(
      body.meetCode
    ) ||
    null;

  if (
    !Number.isFinite(
      sourceSheetId
    ) ||
    !Number.isFinite(
      sourceRow
    )
  ) {

    return NextResponse.json(
      {
        error:
          "sourceSheetId and sourceRow are required.",
      },
      {
        status: 400,
      }
    );

  }

  if (
    !bookingDate ||
    !bookingTime
  ) {

    return NextResponse.json(
      {
        error:
          "A valid consultation date and time are required.",
      },
      {
        status: 400,
      }
    );

  }

  /* =======================================================
     FIND CUSTOMER

     IMPORTANT:

     Customer NOT FOUND is NOT an error.

     Consultation must still be created.
  ======================================================= */

  let customer: any =
    null;

  if (email) {

    customer =
      await findCustomerByEmail(
        supabase,
        email
      );

  }

  /* =======================================================
     FIND PAYMENT

     Only possible when customer exists.
  ======================================================= */

  let payment: any =
    null;

  if (
    customer?.id
  ) {

    payment =
      await findConsultationPayment(
        supabase,
        customer.id
      );

  }

  /* =======================================================
     PAYMENT STATUS
  ======================================================= */

  let paymentStatus =
    "Pending";

  if (payment) {

    const rawStatus =
      String(
        payment.status ??
          "pending"
      ).toLowerCase();

    if (
      rawStatus ===
        "captured" ||
      rawStatus ===
        "paid"
    ) {

      paymentStatus =
        "Paid";

    } else if (
      rawStatus ===
      "failed"
    ) {

      paymentStatus =
        "Failed";

    }

  }

  /* =======================================================
     CONSULTATION PAYLOAD
  ======================================================= */

  const payload = {

    source_sheet_id:
      sourceSheetId,

    source_row:
      sourceRow,

    /*
     * NULL when customer doesn't exist.
     */

    customer_id:
      customer?.id ??
      null,

    /*
     * NULL when payment doesn't exist.
     */

    payment_record_id:
      payment?.id ??
      null,

    payment_id:
      payment?.payment_id ??
      null,

    /*
     * Always preserve the name
     * entered in the Google Form.
     */

    student_name:
      studentName,

    email:
      email ||
      null,

    phone:
      customer?.phone
        ? normalizePhone(
            customer.phone
          )
        : normalizePhone(
            body.phone
          ),

    consultation_type:
      consultationType,

    payment_amount:
      Number(
        payment?.amount ??
          0
      ),

    payment_status:
      paymentStatus,

    payment_time:
      payment?.payment_time ??
      null,

    booking_date:
      bookingDate,

    booking_time:
      bookingTime,

    meet_link:
      meetLink,

    /*
     * UNIQUE GOOGLE CALENDAR EVENT
     */

    source_event_id:
      sourceEventId,

    /*
     * GOOGLE MEET CODE
     */

    meet_code:
      meetCode,

    /*
     * New Google Form
     * booking = Scheduled.
     */

    status:
      "Scheduled",

    updated_at:
      new Date().toISOString(),

  };

  /* =======================================================
     UPSERT CONSULTATION
  ======================================================= */

  const {
    data,
    error,
  } = await supabase
    .from(
      "consultations"
    )
    .upsert(
      payload,
      {
        onConflict:
          "source_sheet_id,source_row",
      }
    )
    .select("*")
    .single();

  if (error) {

    console.error(
      "Consultation sync failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message,

        details:
          error.details ??
          null,

        hint:
          error.hint ??
          null,
      },
      {
        status: 500,
      }
    );

  }

  /* =======================================================
     RESPONSE

     Consultation creation NEVER fails just because
     customer/payment is missing.
  ======================================================= */

  return NextResponse.json({

    ok: true,

    customerFound:
      !!customer,

    paymentFound:
      !!payment,

    paymentStatus:

      paymentStatus,

    consultation:
      data,

  });

}
import { NextResponse } from "next/server";
import { getPredictionAccess } from "@/lib/prediction-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const participantId = url.searchParams.get("participant_id") ?? "";
  const access = getPredictionAccess(participantId);

  return NextResponse.json({
    is_general_open: access.isGeneralOpen,
    is_exception_open: access.isExceptionOpen,
    exception_expires_at: access.exceptionExpiresAt,
    now: access.now,
  });
}

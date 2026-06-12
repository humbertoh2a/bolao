import { predictionLockAt } from "@/lib/knockout";

const defaultLatePredictionLockAt = "2026-06-13T02:59:59.999Z";

function parseParticipantIds(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function getPredictionAccess(participantId: string, now = new Date()) {
  const generalLockAt = new Date(predictionLockAt);
  const exceptionExpiresAt = process.env.LATE_PREDICTION_LOCK_AT?.trim() || defaultLatePredictionLockAt;
  const exceptionLockAt = new Date(exceptionExpiresAt);
  const exceptionParticipantIds = parseParticipantIds(process.env.LATE_PREDICTION_PARTICIPANT_IDS);

  const isGeneralOpen = now.getTime() < generalLockAt.getTime();
  const isExceptionParticipant = exceptionParticipantIds.has(participantId);
  const isExceptionOpen =
    !isGeneralOpen &&
    isExceptionParticipant &&
    Number.isFinite(exceptionLockAt.getTime()) &&
    now.getTime() < exceptionLockAt.getTime();

  return {
    isGeneralOpen,
    isExceptionOpen,
    isExceptionParticipant,
    exceptionExpiresAt,
    now: now.toISOString(),
    canSave: isGeneralOpen || isExceptionOpen,
  };
}

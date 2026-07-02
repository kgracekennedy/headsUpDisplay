export function getRotationDelayMs(rotationStartedAtMs, nowMs, durationMs) {
  if (durationMs <= 0) {
    return 0;
  }

  return Math.max(0, durationMs - Math.max(0, nowMs - rotationStartedAtMs));
}

export function getRotationRatio(rotationStartedAtMs, nowMs, durationMs) {
  if (durationMs <= 0) {
    return 1;
  }

  const elapsedMs = Math.max(0, nowMs - rotationStartedAtMs);
  return Math.max(0, Math.min(1, elapsedMs / durationMs));
}

export function supportsWakeLock() {
  return "wakeLock" in navigator;
}

export async function requestWakeLock() {
  if (!supportsWakeLock()) {
    return {
      sentinel: null,
      message: "Wake lock is not available on this browser. Install the app and set iPad Auto-Lock to Never when needed."
    };
  }

  try {
    const sentinel = await navigator.wakeLock.request("screen");
    return {
      sentinel,
      message: "Screen wake lock requested for this session."
    };
  } catch (error) {
    return {
      sentinel: null,
      message: `Wake lock request failed: ${error instanceof Error ? error.message : "unknown error"}`
    };
  }
}

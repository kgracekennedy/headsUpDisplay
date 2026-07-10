export function supportsWakeLock() {
  return "wakeLock" in navigator;
}

export async function requestWakeLock() {
  if (!supportsWakeLock()) {
    return {
      sentinel: null,
      message: "This browser cannot keep the display awake automatically."
    };
  }

  try {
    const sentinel = await navigator.wakeLock.request("screen");
    return {
      sentinel,
      message: "Display will stay awake while this app is open."
    };
  } catch (error) {
    return {
      sentinel: null,
      message: error instanceof Error && error.name === "NotAllowedError"
        ? "Automatic keep-awake was blocked. The app will try again on the next tap."
        : `Keep-awake request failed: ${error instanceof Error ? error.message : "unknown error"}`
    };
  }
}

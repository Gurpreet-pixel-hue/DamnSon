/**
 * Memory-only entrance flag (§9.4).
 * Never persisted. True only immediately following a navigation from Landing.
 */

let _arrivedFromLanding = false;

export function setArrivedFromLanding(val: boolean) {
  _arrivedFromLanding = val;
}

export function getArrivedFromLanding(): boolean {
  return _arrivedFromLanding;
}

export function consumeArrivedFromLanding(): boolean {
  const current = _arrivedFromLanding;
  _arrivedFromLanding = false;
  return current;
}

export function shouldPlayEntrance(): boolean {
  if (!_arrivedFromLanding) return false;

  if (typeof window !== "undefined") {
    // Reduced motion check
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
    ) {
      _arrivedFromLanding = false;
      return false;
    }

    // Debug query param check
    try {
      const params = new URLSearchParams(window.location?.search ?? "");
      if (params.get("debug") === "1") {
        _arrivedFromLanding = false;
        return false;
      }
    } catch {
      // Ignore
    }
  }

  return true;
}

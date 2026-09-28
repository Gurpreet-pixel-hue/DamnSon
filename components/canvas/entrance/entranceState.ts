/**
 * Module-level entrance session state (§9.4, A13).
 * Consumed once on JourneyShell mount, never persisted.
 */

export interface EntranceSession {
  active: boolean;
  startedAt: number; // ms timestamp
  duration: number; // 2.4s (2400ms)
}

let _arrivedFromLanding = false;

let _entranceSession: EntranceSession = {
  active: false,
  startedAt: 0,
  duration: 2400,
};

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
    // Reduced motion check (§9.4)
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
    ) {
      _arrivedFromLanding = false;
      return false;
    }

    // Debug query param check (?debug=1 skips entrance)
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

/**
 * Initializes the entrance session exactly once at JourneyShell mount (A13).
 */
export function startEntranceSession(): EntranceSession {
  const play = shouldPlayEntrance();
  consumeArrivedFromLanding();

  if (play) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    _entranceSession = {
      active: true,
      startedAt: now,
      duration: 2400,
    };
  } else {
    _entranceSession = {
      active: false,
      startedAt: 0,
      duration: 0,
    };
  }

  return _entranceSession;
}

export function getEntranceSession(): EntranceSession {
  if (!_entranceSession.active) return _entranceSession;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = now - _entranceSession.startedAt;
  if (elapsed >= _entranceSession.duration) {
    _entranceSession.active = false;
  }
  return _entranceSession;
}

export function finishEntranceSession() {
  _entranceSession.active = false;
}

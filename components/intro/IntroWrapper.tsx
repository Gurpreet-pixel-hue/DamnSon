"use client";

import React, { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

const STORAGE_KEY = "cw-intro-seen";

const IntroSequence = dynamic(
  () => import("./IntroSequence").then((mod) => mod.IntroSequence),
  { ssr: false }
);

const noopSubscribe = () => () => {};

/** Reads once on the client whether the intro should play; the server snapshot is always "don't". */
function readShouldPlay(): boolean {
  try {
    return !(
      sessionStorage.getItem(STORAGE_KEY) === "1" ||
      new URLSearchParams(window.location.search).get("skipIntro") === "1"
    );
  } catch {
    return true;
  }
}

export function IntroWrapper() {
  const shouldPlay = useSyncExternalStore(noopSubscribe, readShouldPlay, () => false);
  const [dismissed, setDismissed] = useState(false);
  const showIntro = shouldPlay && !dismissed;

  if (!showIntro) return null;

  return (
    <React.Suspense fallback={null}>
      <IntroSequence onComplete={() => setDismissed(true)} />
    </React.Suspense>
  );
}

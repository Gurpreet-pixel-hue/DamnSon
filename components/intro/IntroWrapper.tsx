"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const STORAGE_KEY = "cw-intro-seen";

const IntroSequence = dynamic(
  () => import("./IntroSequence").then((mod) => mod.IntroSequence),
  { ssr: false }
);

export function IntroWrapper() {
  const [mounted, setMounted] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (
        sessionStorage.getItem(STORAGE_KEY) === "1" ||
        new URLSearchParams(window.location.search).get("skipIntro") === "1"
      ) {
        setShowIntro(false);
      } else {
        setShowIntro(true);
      }
    } catch {
      setShowIntro(true);
    }
  }, []);

  if (!mounted || !showIntro) return null;

  return (
    <React.Suspense fallback={null}>
      <IntroSequence onComplete={() => setShowIntro(false)} />
    </React.Suspense>
  );
}

"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

const IntroSequence = dynamic(
  () => import("./IntroSequence").then((mod) => mod.IntroSequence),
  { ssr: false }
);

export function IntroWrapper() {
  const [showIntro, setShowIntro] = useState(true);

  if (!showIntro) return null;

  return (
    <React.Suspense fallback={null}>
      <IntroSequence onComplete={() => setShowIntro(false)} />
    </React.Suspense>
  );
}

"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { useGLTF } from "@react-three/drei";
import { STRAIGHT_LINE_PATH, TANGLED_PATH, STATION_DOTS } from "./paths";

export interface IntroSequenceProps {
  onComplete: () => void;
}

const STORAGE_KEY = "cw-intro-seen";
const WORDS = ["FORMS.", "FEES.", "OFFICES.", "QUEUES."];

export function IntroSequence({ onComplete }: IntroSequenceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const tangleRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const wordsRef = useRef<(HTMLDivElement | null)[]>([]);
  const scrambleRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const brandWordmarkRef = useRef<HTMLHeadingElement>(null);
  const brandTaglineRef = useRef<HTMLParagraphElement>(null);
  const progressLineRef = useRef<HTMLDivElement>(null);

  const [isPreloading, setIsPreloading] = useState(false);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const isDoneRef = useRef(false);

  const finish = useCallback(() => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors
    }
    if (tlRef.current) {
      tlRef.current.kill();
    }
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        duration: 0.25,
        ease: "power2.out",
        onComplete,
      });
    } else {
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    // Check session storage or skipIntro query param
    try {
      if (
        sessionStorage.getItem(STORAGE_KEY) === "1" ||
        new URLSearchParams(window.location.search).get("skipIntro") === "1"
      ) {
        onComplete();
        return;
      }
    } catch {
      // Storage unavailable, proceed with playing
    }

    // Trigger Drei GLB preloads asynchronously
    try {
      useGLTF.preload("/models/stations.glb");
      useGLTF.preload("/models/city.glb");
      useGLTF.preload("/models/props.glb");
    } catch {
      // Continue even if WebGL is unavailable
    }

    // Reduced motion handling (§9.2)
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      if (containerRef.current) {
        gsap.set(containerRef.current, { opacity: 1 });
        if (brandRef.current) {
          gsap.set(brandRef.current, { opacity: 1 });
        }
        const timer = setTimeout(() => {
          finish();
        }, 800);
        return () => clearTimeout(timer);
      }
      onComplete();
      return;
    }

    // Full 120 BPM GSAP Timeline (Beat = 0.5s)
    const ctx = gsap.context(() => {
      const line = lineRef.current;
      const tangle = tangleRef.current;
      const dots = dotsRef.current.filter(Boolean);
      const words = wordsRef.current.filter(Boolean);
      const scramble = scrambleRef.current;
      const brand = brandRef.current;
      const brandWordmark = brandWordmarkRef.current;
      const brandTagline = brandTaglineRef.current;

      if (!line || !tangle) return;

      const lineLength = line.getTotalLength() || 840;
      const tangleLength = tangle.getTotalLength() || 1100;

      gsap.set(line, {
        strokeDasharray: lineLength,
        strokeDashoffset: lineLength,
        opacity: 1,
      });
      gsap.set(tangle, {
        strokeDasharray: tangleLength,
        strokeDashoffset: tangleLength,
        opacity: 0,
      });
      gsap.set(dots, { scale: 0, transformOrigin: "center center" });
      gsap.set(words, { opacity: 0, yPercent: 110 });
      if (scramble) gsap.set(scramble, { opacity: 0 });
      if (brand) gsap.set(brand, { opacity: 0 });

      const tl = gsap.timeline({
        onComplete: () => {
          // Slow load check at beat 9 (4.5s)
          setIsPreloading(true);
          // Auto advance after at most 3s if holding
          setTimeout(() => {
            finish();
          }, 2000);
        },
      });
      tlRef.current = tl;

      // 1. b0–b1: Line draws left to right, 3 dots pop
      tl.to(
        line,
        {
          strokeDashoffset: 0,
          duration: 0.5,
          ease: "power2.inOut",
        },
        0.1
      );

      tl.to(
        dots,
        {
          scale: 1,
          duration: 0.35,
          ease: "back.out(3)",
          stagger: 0.08,
        },
        0.35
      );

      // 2. b1–b5: Four words hit, one per beat (beat = 0.5s)
      WORDS.forEach((_, idx) => {
        const wordEl = words[idx];
        if (!wordEl) return;
        const startTime = 0.5 + idx * 0.5;

        // In: Characters move up with stagger
        const chars = wordEl.querySelectorAll(".intro-char");
        tl.fromTo(
          wordEl,
          { opacity: 0 },
          { opacity: 1, duration: 0.05 },
          startTime
        );

        tl.fromTo(
          chars,
          { yPercent: 110, rotationX: -80 },
          {
            yPercent: 0,
            rotationX: 0,
            duration: 0.35,
            ease: "expo.out",
            stagger: 0.02,
          },
          startTime
        );

        // Transit line jolts 8px
        tl.to(
          line,
          {
            y: idx % 2 === 0 ? 8 : -8,
            duration: 0.08,
            yoyo: true,
            repeat: 1,
            ease: "power2.inOut",
          },
          startTime
        );

        // Out (for words 0, 1, 2)
        if (idx < 3) {
          tl.to(
            wordEl,
            {
              skewX: 12,
              filter: "blur(8px)",
              opacity: 0,
              duration: 0.15,
              ease: "power2.in",
            },
            startTime + 0.38
          );
        }
      });

      // 3. b5–b6 (2.5s - 3.0s): Last word shatters, line tangles
      const lastWord = words[3];
      if (lastWord) {
        const lastChars = lastWord.querySelectorAll(".intro-char");
        tl.to(
          lastChars,
          {
            x: () => (Math.random() - 0.5) * 120,
            y: () => (Math.random() - 0.5) * 120,
            rotation: () => (Math.random() - 0.5) * 180,
            opacity: 0,
            filter: "blur(6px)",
            duration: 0.4,
            ease: "power3.out",
          },
          2.5
        );
      }

      // Hide straight line and dots, draw tangled maze
      tl.to(dots, { scale: 0, opacity: 0, duration: 0.2 }, 2.5);
      tl.set(line, { opacity: 0 }, 2.5);
      tl.set(tangle, { opacity: 1 }, 2.5);
      tl.to(
        tangle,
        {
          strokeDashoffset: 0,
          duration: 0.5,
          ease: "power1.inOut",
        },
        2.5
      );

      // 4. b6–b7 (3.0s - 3.5s): Scramble text resolves to "IN ORDER." and maze straightens
      if (scramble) {
        tl.set(scramble, { opacity: 1 }, 3.0);
        // Crossfade tangle to straight line
        tl.to(
          tangle,
          {
            strokeDashoffset: tangleLength,
            opacity: 0,
            duration: 0.5,
            ease: "power2.inOut",
          },
          3.0
        );
        tl.set(line, { y: 0, opacity: 1 }, 3.0);
        tl.fromTo(
          line,
          { strokeDashoffset: -lineLength },
          { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" },
          3.0
        );
      }

      // 5. b7–b9 (3.5s - 4.5s): Wordmark rises, tagline fades up
      if (brand && brandWordmark && brandTagline) {
        if (scramble) {
          tl.to(scramble, { opacity: 0, duration: 0.2 }, 3.5);
        }
        tl.set(brand, { opacity: 1 }, 3.5);
        const brandChars = brandWordmark.querySelectorAll(".brand-char");
        tl.fromTo(
          brandChars,
          { yPercent: 120, opacity: 0 },
          {
            yPercent: 0,
            opacity: 1,
            duration: 0.45,
            stagger: 0.03,
            ease: "expo.out",
          },
          3.5
        );
        tl.fromTo(
          brandTagline,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
          3.8
        );
      }
    }, containerRef);

    // Keyboard and click to skip (§9.2)
    const handleKeyDown = () => finish();
    const handleClick = () => finish();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClick);

    return () => {
      ctx.revert();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClick);
    };
  }, [finish, onComplete]);

  return (
    <div
      ref={containerRef}
      data-testid="intro-sequence"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--cw-background)] text-[var(--cw-text)] select-none overflow-hidden"
    >
      <h1 className="sr-only">CivicWeave: your city, in order</h1>

      {/* Skip Button */}
      <button
        type="button"
        data-testid="skip-intro-btn"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute top-6 right-6 z-10 px-3.5 py-1.5 rounded-full border border-[var(--cw-border)] bg-[var(--cw-surface)] text-xs font-semibold text-[var(--cw-text-muted)] hover:text-[var(--cw-text)] hover:border-[var(--cw-text)] transition-colors cursor-pointer"
      >
        Skip intro
      </button>

      {/* SVG Transit Line Canvas */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <svg viewBox="0 0 1000 500" className="w-full max-w-4xl h-auto overflow-visible">
          {/* Tangled Maze Path */}
          <path
            ref={tangleRef}
            d={TANGLED_PATH}
            fill="none"
            stroke="var(--cw-brand)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Straight Transit Line */}
          <path
            ref={lineRef}
            d={STRAIGHT_LINE_PATH}
            fill="none"
            stroke="var(--cw-available)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Station Dots */}
          {STATION_DOTS.map((dot, idx) => (
            <circle
              key={idx}
              ref={(el) => {
                dotsRef.current[idx] = el;
              }}
              cx={dot.cx}
              cy={dot.cy}
              r="8"
              fill="var(--cw-available)"
              stroke="var(--cw-background)"
              strokeWidth="3"
            />
          ))}
        </svg>
      </div>

      {/* Hit Words Container */}
      <div className="relative z-10 flex items-center justify-center pointer-events-none" aria-hidden="true">
        {WORDS.map((word, idx) => (
          <div
            key={word}
            ref={(el) => {
              wordsRef.current[idx] = el;
            }}
            className="absolute text-center whitespace-nowrap text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tight text-[var(--cw-text)]"
            style={{
              fontFamily: "var(--font-geist-sans), sans-serif",
              letterSpacing: "-0.04em",
              textShadow:
                "-3px 0 var(--cw-brand), 3px 0 var(--cw-available)",
            }}
          >
            {word.split("").map((c, cIdx) => (
              <span key={cIdx} className="intro-char inline-block">
                {c}
              </span>
            ))}
          </div>
        ))}

        {/* Scramble Text "IN ORDER." */}
        <div
          ref={scrambleRef}
          className="absolute text-center whitespace-nowrap text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tight text-[var(--cw-text)]"
          style={{
            fontFamily: "var(--font-geist-sans), sans-serif",
            letterSpacing: "-0.04em",
          }}
        >
          IN ORDER.
        </div>

        {/* Brand Reveal */}
        <div
          ref={brandRef}
          className="flex flex-col items-center justify-center text-center gap-2"
        >
          <h2
            ref={brandWordmarkRef}
            className="text-6xl sm:text-8xl md:text-9xl font-extrabold tracking-tighter text-[var(--cw-text)] overflow-hidden"
            style={{
              fontFamily: "var(--font-geist-sans), sans-serif",
              letterSpacing: "-0.05em",
            }}
          >
            {"CivicWeave".split("").map((c, cIdx) => (
              <span key={cIdx} className="brand-char inline-block">
                {c}
              </span>
            ))}
          </h2>
          <p
            ref={brandTaglineRef}
            className="text-base sm:text-lg md:text-xl font-medium uppercase tracking-widest text-[var(--cw-text-muted)]"
          >
            Your city. In order.
          </p>
        </div>
      </div>

      {/* Determinate progress line if holding on slow load (§9.2) */}
      {isPreloading && (
        <div
          data-testid="intro-progress-bar"
          className="absolute bottom-12 w-48 h-0.5 bg-[var(--cw-border)] overflow-hidden rounded-full"
        >
          <div
            ref={progressLineRef}
            className="h-full bg-[var(--cw-brand)] animate-pulse w-full"
          />
        </div>
      )}
    </div>
  );
}

"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import gsap from "gsap";
import { STRAIGHT_LINE_PATH, TANGLED_PATH, STATION_DOTS } from "./paths";

export interface IntroSequenceProps {
  onComplete: () => void;
}

const STORAGE_KEY = "cw-intro-seen";
const WORDS = ["FORMS.", "FEES.", "OFFICES.", "QUEUES."];

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
  const [reducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const isDoneRef = useRef(false);
  const preloadRef = useRef<Promise<unknown> | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const finish = useCallback(() => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
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
        duration: 0.2,
        ease: "power2.out",
        onComplete: () => {
          onComplete();
          // Move focus to search input (§9.2)
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[name="query"], input[type="text"], [data-testid="landing-search-input"]'
            );
            input?.focus();
          }, 50);
        },
      });
    } else {
      onComplete();
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[name="query"], input[type="text"], [data-testid="landing-search-input"]'
        );
        input?.focus();
      }, 50);
    }
  }, [onComplete]);

  // Preload GLB assets via fetch without importing three/drei into the intro chunk (§9.2)
  useEffect(() => {
    if (typeof window !== "undefined") {
      preloadRef.current = Promise.all([
        fetch("/models/stations.glb").catch(() => {}),
        fetch("/models/city.glb").catch(() => {}),
        fetch("/models/props.glb").catch(() => {}),
      ]);
    }
  }, []);

  // Reduced motion: 600ms static hold with 200ms fade (§9.2)
  useEffect(() => {
    if (!reducedMotion) return;
    const timer = setTimeout(() => {
      finish();
    }, 600);
    return () => clearTimeout(timer);
  }, [reducedMotion, finish]);

  // Full 120 BPM GSAP Timeline for standard motion
  useIsomorphicLayoutEffect(() => {
    if (reducedMotion) return;

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
      // Storage unavailable, proceed
    }

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
        opacity: 0,
      });
      gsap.set(tangle, {
        strokeDasharray: tangleLength,
        strokeDashoffset: tangleLength,
        opacity: 0,
      });
      gsap.set(dots, { scale: 0, opacity: 0, transformOrigin: "center center" });
      gsap.set(words, { opacity: 0, yPercent: 110 });
      if (scramble) gsap.set(scramble, { opacity: 0 });
      if (brand) gsap.set(brand, { opacity: 0 });

      const tl = gsap.timeline({
        onComplete: () => {
          // Slow load check at beat 9 (~4.2s): hold only while preload is still pending, capped at 1.5s (§9.2)
          let resolved = false;
          preloadRef.current
            ?.then(() => {
              resolved = true;
              finish();
            })
            .catch(() => {
              resolved = true;
              finish();
            });

          // If not resolved immediately, show progress bar and set cap
          setTimeout(() => {
            if (!resolved && !isDoneRef.current) {
              setIsPreloading(true);
              holdTimerRef.current = setTimeout(() => {
                finish();
              }, 1500);
            }
          }, 50);
        },
      });
      tlRef.current = tl;

      // 1. b0–b1 (0.0s - 0.5s): Transit line draws left to right, 3 dots pop
      tl.set(line, { opacity: 1 }, 0.05);
      tl.to(
        line,
        {
          strokeDashoffset: 0,
          duration: 0.45,
          ease: "power2.inOut",
        },
        0.05
      );

      tl.to(
        dots,
        {
          scale: 1,
          opacity: 1,
          duration: 0.3,
          ease: "back.out(3)",
          stagger: 0.07,
        },
        0.25
      );

      // 2. b1–b5 (0.5s - 2.5s): Four words hit, one per beat (beat = 0.5s)
      WORDS.forEach((_, idx) => {
        const wordEl = words[idx];
        if (!wordEl) return;
        const startTime = 0.5 + idx * 0.5;

        const chars = wordEl.querySelectorAll(".intro-char");
        tl.set(wordEl, { opacity: 1 }, startTime);

        // In: Characters move up with stagger
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

        // 2-frame RGB split hit accent (-4px brand / +4px available per §9.2), then cleared
        tl.set(
          wordEl,
          {
            textShadow: "-4px 0 var(--cw-brand), 4px 0 var(--cw-available)",
          },
          startTime
        );
        tl.set(
          wordEl,
          {
            textShadow: "none",
          },
          startTime + 0.04
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
              duration: 0.12,
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
            duration: 0.35,
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
        tl.to(scramble, { opacity: 1, duration: 0.1 }, 3.0);
        // Crossfade tangle to straight line
        tl.to(
          tangle,
          {
            strokeDashoffset: tangleLength,
            opacity: 0,
            duration: 0.45,
            ease: "power2.inOut",
          },
          3.05
        );
        tl.set(line, { y: 0, opacity: 1 }, 3.05);
        tl.fromTo(
          line,
          { strokeDashoffset: -lineLength },
          { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" },
          3.05
        );
      }

      // 5. b7–b8.5 (3.5s - 4.2s): Wordmark rises, tagline fades up
      if (brand && brandWordmark && brandTagline) {
        if (scramble) {
          tl.to(scramble, { opacity: 0, duration: 0.15 }, 3.5);
        }
        tl.set(brand, { opacity: 1 }, 3.5);
        const brandChars = brandWordmark.querySelectorAll(".brand-char");
        tl.fromTo(
          brandChars,
          { yPercent: 120, opacity: 0 },
          {
            yPercent: 0,
            opacity: 1,
            duration: 0.4,
            stagger: 0.025,
            ease: "expo.out",
          },
          3.5
        );
        tl.fromTo(
          brandTagline,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
          3.75
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
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClick);
    };
  }, [reducedMotion, finish, onComplete]);

  // If reduced motion is preferred, render dedicated static frame (brand + tagline only, §9.2)
  if (reducedMotion) {
    return (
      <div
        ref={containerRef}
        data-testid="intro-sequence"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--cw-background)] text-[var(--cw-text)] select-none overflow-hidden"
      >
        <h1 className="sr-only">CivicWeave: your city, in order</h1>
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
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <h2
            className="text-6xl sm:text-8xl md:text-9xl font-extrabold tracking-tighter text-[var(--cw-text)]"
            style={{
              fontFamily: "var(--font-geist-sans), sans-serif",
              letterSpacing: "-0.05em",
            }}
          >
            CivicWeave
          </h2>
          <p className="text-base sm:text-lg md:text-xl font-medium uppercase tracking-widest text-[var(--cw-text-muted)]">
            Your city. In order.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="intro-sequence"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--cw-background)] text-[var(--cw-text)] select-none overflow-hidden opacity-100"
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
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 1000 500"
          className="w-full max-w-4xl h-auto overflow-visible"
        >
          {/* Tangled Maze Path */}
          <path
            ref={tangleRef}
            d={TANGLED_PATH}
            fill="none"
            stroke="var(--cw-brand)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0 }}
          />

          {/* Straight Transit Line */}
          <path
            ref={lineRef}
            d={STRAIGHT_LINE_PATH}
            fill="none"
            stroke="var(--cw-available)"
            strokeWidth="6"
            strokeLinecap="round"
            style={{ opacity: 0 }}
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
              style={{ opacity: 0 }}
            />
          ))}
        </svg>
      </div>

      {/* Hit Words Container */}
      <div
        className="relative z-10 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
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
              opacity: 0,
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
            opacity: 0,
          }}
        >
          IN ORDER.
        </div>

        {/* Brand Reveal */}
        <div
          ref={brandRef}
          className="flex flex-col items-center justify-center text-center gap-2"
          style={{ opacity: 0 }}
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
            style={{ opacity: 0 }}
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

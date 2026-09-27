"use client";

import { useViewStore } from "@/lib/store/useViewStore";

export function Legend() {
  const criticalPathOn = useViewStore((s) => s.criticalPathOn);

  return (
    <div
      data-testid="scene-legend"
      className="pointer-events-auto absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3.5 rounded-[10px] border border-[#E6DDC8] bg-white/95 px-3.5 py-2 shadow-sm backdrop-blur-sm select-none"
      role="region"
      aria-label="Map legend"
    >
      {/* Completed */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#1E7F3B] shrink-0"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-[#1F242E]">
          Completed
        </span>
      </div>

      {/* Available (next) */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#1F63D6] shrink-0"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-[#1F242E]">
          Available (next)
        </span>
      </div>

      {/* Locked */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#8A94A0] shrink-0"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-[#1F242E]">Locked</span>
      </div>

      {/* Conditional (may apply) */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full border border-dashed border-[#B45309] bg-[#FEF6EE] shrink-0"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-[#1F242E]">
          Conditional (may apply)
        </span>
      </div>

      {/* Critical path (only while toggle is on) */}
      {criticalPathOn && (
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-1.5 rounded-full bg-[#D92D20] shrink-0"
            aria-hidden="true"
          />
          <span className="text-[11px] font-semibold text-[#D92D20]">
            Critical path
          </span>
        </div>
      )}

      {/* Divider */}
      <div className="w-[1px] h-3.5 bg-[#E6DDC8]" aria-hidden="true" />

      {/* Mode entries (§10.5: Online · In person · Both) */}
      <div className="flex items-center gap-1.5">
        <svg
          className="w-3 h-3 text-[#1F63D6] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span className="text-[11px] font-medium text-[#1F242E]">Online</span>
      </div>

      <div className="flex items-center gap-1.5">
        <svg
          className="w-3 h-3 text-[#697586] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 21h18M5 21V7l8-4v18M13 10h4v11" />
        </svg>
        <span className="text-[11px] font-medium text-[#1F242E]">In person</span>
      </div>

      <div className="flex items-center gap-1.5">
        <svg
          className="w-3 h-3 text-[#8A4A0A] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M14 9h6v12H8v-4" />
        </svg>
        <span className="text-[11px] font-medium text-[#1F242E]">Both</span>
      </div>
    </div>
  );
}

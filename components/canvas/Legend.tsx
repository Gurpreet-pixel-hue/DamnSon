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
    </div>
  );
}

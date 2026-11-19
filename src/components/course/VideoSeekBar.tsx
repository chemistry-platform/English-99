/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useCallback } from 'react';
import { formatSecondsHHMMSS } from '../../lib/formatDuration';
import { useLanguage } from '../../lib/translations';

interface VideoSeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (newTimeSeconds: number) => void;
  onInteract?: () => void;
}

export const VideoSeekBar: React.FC<VideoSeekBarProps> = ({
  currentTime,
  duration,
  onSeek,
  onInteract,
}) => {
  const { t } = useLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoverSeconds, setHoverSeconds] = useState<number | null>(null);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const activeTime = isDragging && dragSeconds !== null ? dragSeconds : Math.max(0, currentTime || 0);
  const clampedTime = safeDuration > 0 ? Math.min(safeDuration, Math.max(0, activeTime)) : 0;
  const progressPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (clampedTime / safeDuration) * 100)) : 0;

  const computeTimeFromClientX = useCallback(
    (clientX: number): { percent: number; seconds: number } | null => {
      const el = trackRef.current;
      if (!el || safeDuration <= 0) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      // Strict LTR calculation: left edge = 0%, right edge = 100%
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return {
        percent: ratio * 100,
        seconds: ratio * safeDuration,
      };
    },
    [safeDuration]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onInteract?.();
    if (safeDuration <= 0) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const calc = computeTimeFromClientX(e.clientX);
    if (!calc) return;
    setIsDragging(true);
    setDragSeconds(calc.seconds);
    setHoverPercent(calc.percent);
    setHoverSeconds(calc.seconds);
    onSeek(calc.seconds);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const calc = computeTimeFromClientX(e.clientX);
    if (!calc) return;
    setHoverPercent(calc.percent);
    setHoverSeconds(calc.seconds);

    if (isDragging) {
      e.stopPropagation();
      onInteract?.();
      setDragSeconds(calc.seconds);
      onSeek(calc.seconds);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    const calc = computeTimeFromClientX(e.clientX);
    if (calc) {
      onSeek(calc.seconds);
    }
    setIsDragging(false);
    setDragSeconds(null);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverPercent(null);
      setHoverSeconds(null);
    }
  };

  const tooltipPercent =
    isDragging
      ? Math.max(6, Math.min(94, progressPercent))
      : hoverPercent !== null
      ? Math.max(6, Math.min(94, hoverPercent))
      : null;
  const tooltipTime = isDragging ? dragSeconds : hoverSeconds;

  return (
    <div dir="ltr" className="flex items-center gap-2.5 sm:gap-3 w-full select-none">
      {/* Elapsed Time on LEFT */}
      <span className="text-[11px] sm:text-xs font-mono tabular-nums text-white/95 min-w-[4.5rem] text-left shrink-0">
        {safeDuration > 0 && clampedTime <= 0 ? '00:00:00' : formatSecondsHHMMSS(clampedTime)}
      </span>

      {/* Interactive LTR Track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t.video.seekBarAria}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeDuration)}
        aria-valuenow={Math.round(clampedTime)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={(e) => {
          if (safeDuration <= 0) return;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onInteract?.();
            onSeek(Math.min(safeDuration, clampedTime + 5));
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onInteract?.();
            onSeek(Math.max(0, clampedTime - 5));
          }
        }}
        className="relative flex-1 min-h-[44px] flex items-center cursor-pointer touch-none group"
      >
        {/* Live Preview Tooltip above cursor/thumb while dragging or hovering */}
        {tooltipPercent !== null && tooltipTime !== null && safeDuration > 0 && (
          <div
            style={{ left: `${tooltipPercent}%` }}
            className="absolute -top-4 -translate-x-1/2 -translate-y-full px-2 py-0.5 rounded-md bg-slate-950/95 text-amber-400 border border-amber-500/40 text-[11px] font-mono font-bold tabular-nums shadow-lg pointer-events-none whitespace-nowrap z-20"
          >
            {formatSecondsHHMMSS(tooltipTime)}
          </div>
        )}

        {/* Base Unplayed Track (Dark Gray) */}
        <div
          className={`relative w-full rounded-full bg-slate-700/90 overflow-visible transition-all duration-150 ${
            isDragging ? 'h-2.5' : 'h-1.5 group-hover:h-2'
          }`}
        >
          {/* Played Fill (Bright Orange) */}
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full rounded-full bg-amber-500 transition-[width] duration-75"
          />

          {/* Thumb Circle */}
          <div
            style={{ left: `${progressPercent}%` }}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 border-2 border-white shadow-md transition-transform duration-100 pointer-events-none ${
              isDragging ? 'w-5 h-5 scale-110' : 'w-4 h-4 group-hover:scale-110'
            }`}
          />
        </div>
      </div>

      {/* Total Duration on RIGHT */}
      <span className="text-[11px] sm:text-xs font-mono tabular-nums text-slate-300 min-w-[4.5rem] text-right shrink-0">
        {formatSecondsHHMMSS(safeDuration)}
      </span>
    </div>
  );
};

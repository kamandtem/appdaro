import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface WheelPickerItem {
  value: number;
  label: string;
  unit?: string;
  sublabel?: string;
}

interface WheelPickerProps {
  items: WheelPickerItem[];
  value: number;
  onChange: (value: number) => void;
  loop?: boolean;
  disabled?: boolean;
  accentClassName?: string;
  /** Compact mode: only 1 neighbor above/below (instead of 2) and a smaller footprint —
   *  used for fields like "every N days" that shouldn't take up much space. */
  compact?: boolean;
  /** Color class for the big centered value — override when the wheel sits on a fixed dark background. */
  valueClassName?: string;
}

// Tighter row spacing than before — shrinks the whole picker's footprint while keeping
// the same number of visible rows, matching the compact reference design.
export const WHEEL_ITEM_HEIGHT = 40;
const ITEM_HEIGHT = WHEEL_ITEM_HEIGHT;
const COMPACT_ITEM_HEIGHT = 32;

// Small haptic "tick" each time the value advances by one step — mirrors the
// tiny buzz of a physical keyboard/keypad so the roller feels responsive.
const vibrateTick = () => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
    }
  } catch {
    /* vibration not supported/allowed — silently ignore */
  }
};

export const WheelPicker: React.FC<WheelPickerProps> = ({
  items,
  value,
  onChange,
  loop = true,
  disabled = false,
  accentClassName = 'text-teal-600 dark:text-teal-400',
  compact = false,
  valueClassName = 'text-slate-800 dark:text-white'
}) => {
  const ITEM_H = compact ? COMPACT_ITEM_HEIGHT : ITEM_HEIGHT;
  const VISIBLE_RADIUS = compact ? 1 : 2; // items rendered above/below the centered one

  const findIndex = (v: number) => {
    const i = items.findIndex(it => it.value === v);
    return i === -1 ? 0 : i;
  };

  const [index, setIndex] = useState<number>(() => findIndex(value));
  const indexRef = useRef(index);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({ dragging: false, lastCommittedY: 0 });

  useEffect(() => {
    const i = findIndex(value);
    if (i !== indexRef.current) {
      indexRef.current = i;
      setIndex(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items]);

  const commitDelta = useCallback((dir: number) => {
    const len = items.length;
    let next = indexRef.current + dir;
    next = loop ? ((next % len) + len) % len : Math.min(Math.max(next, 0), len - 1);
    if (next === indexRef.current) return false;
    indexRef.current = next;
    setIndex(next);
    onChange(items[next].value);
    vibrateTick();
    return true;
  }, [items, loop, onChange]);

  const applyDelta = (dir: number) => {
    if (disabled) return;
    commitDelta(dir);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { dragging: true, lastCommittedY: e.clientY };
    setIsDragging(true);
    setDragY(0);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || !dragState.current.dragging) return;
    let offset = e.clientY - dragState.current.lastCommittedY;

    // Commit one step every time the drag crosses a full item's height, while
    // keeping the leftover offset small so the wheel keeps gliding smoothly
    // under the finger instead of jumping.
    while (Math.abs(offset) >= ITEM_H) {
      const dir = offset > 0 ? -1 : 1; // dragging down reveals the previous item
      const moved = commitDelta(dir);
      if (!moved) break; // reached the end of a non-looping list
      dragState.current.lastCommittedY += dir === -1 ? ITEM_H : -ITEM_H;
      offset = e.clientY - dragState.current.lastCommittedY;
    }
    setDragY(offset);
  };

  const endDrag = () => {
    dragState.current.dragging = false;
    setIsDragging(false);
    setDragY(0);
  };

  const len = items.length;
  const offsets = Array.from({ length: VISIBLE_RADIUS * 2 + 1 }, (_, i) => i - VISIBLE_RADIUS);

  return (
    <div className={`flex flex-col items-center select-none w-full ${compact ? 'max-w-[92px]' : 'max-w-[128px]'} mx-auto ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <button
        type="button"
        onClick={() => applyDelta(-1)}
        className="p-1.5 text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300 active:scale-90 transition-all"
        tabIndex={disabled ? -1 : 0}
      >
        <ChevronUp className={compact ? 'w-5 h-5' : 'w-6 h-6'} strokeWidth={2.75} />
      </button>

      {/* Full-width drag surface — touching anywhere in this area (not just directly
          on the number) drags the wheel, matching the reference picker's behavior. */}
      <div
        className="relative overflow-hidden touch-none cursor-grab active:cursor-grabbing w-full"
        style={{ height: ITEM_H * (VISIBLE_RADIUS * 2 + 1) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {/* Selection indicator: a full-width green bar behind the centered row —
            no border/pill box, so long labels (e.g. "۷.۵") never get visually clipped. */}
        <div
          className="absolute inset-x-0 top-1/2 rounded-xl bg-emerald-500/12 dark:bg-emerald-400/15 pointer-events-none z-0"
          style={{ height: ITEM_H, marginTop: -ITEM_H / 2 }}
        />
        {offsets.map(off => {
          const rawIndex = index + off;
          const itemIndex = loop ? ((rawIndex % len) + len) % len : rawIndex;
          if (itemIndex < 0 || itemIndex >= len) return null;
          const item = items[itemIndex];
          const isCenter = off === 0;
          const dist = Math.min(Math.abs(off), 2);
          const opacity = isCenter ? 1 : dist === 1 ? 0.5 : 0.22;
          const scale = isCenter ? 1 : dist === 1 ? 0.82 : 0.68;
          // Distant rows get progressively blurred, like a shallow depth-of-field —
          // matches the reference picker where far numbers fade and blur out.
          const blurPx = isCenter ? 0 : dist === 1 ? 0.6 : 1.6;

          return (
            <div
              key={item.value}
              className="absolute inset-x-1 top-1/2 flex flex-col items-center justify-center px-1 z-10"
              style={{
                minHeight: ITEM_H,
                marginTop: -ITEM_H / 2,
                transform: `translateY(${off * ITEM_H + dragY}px) scale(${scale})`,
                opacity,
                filter: blurPx ? `blur(${blurPx}px)` : undefined,
                transition: isDragging
                  ? 'none'
                  : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out, filter 220ms ease-out',
                willChange: 'transform'
              }}
            >
              {isCenter ? (
                <>
                  <span className={`font-black leading-tight whitespace-nowrap ${valueClassName} ${compact ? 'text-base' : 'text-xl'}`}>
                    {item.label}
                  </span>
                  {item.unit && !compact && (
                    <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 leading-tight whitespace-nowrap">
                      {item.unit}
                    </span>
                  )}
                  {item.sublabel && !compact && (
                    <span className={`text-[10px] font-bold leading-tight whitespace-nowrap ${accentClassName}`}>{item.sublabel}</span>
                  )}
                </>
              ) : (
                <span className={`font-bold text-slate-400 dark:text-slate-500 leading-tight whitespace-nowrap ${compact ? 'text-xs' : 'text-sm'}`}>
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => applyDelta(1)}
        className="p-1.5 text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 active:scale-90 transition-all"
        tabIndex={disabled ? -1 : 0}
      >
        <ChevronDown className={compact ? 'w-5 h-5' : 'w-6 h-6'} strokeWidth={2.75} />
      </button>
    </div>
  );
};

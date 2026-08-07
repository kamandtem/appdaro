import React, { useId, useRef, useState } from 'react';
import { toPersianNumbers } from '../../utils/persian';

interface ClockFacePickerProps {
  /** 0 تا 23 */
  hour: number;
  /** 0 تا 59 */
  minute: number;
  onChangeHour: (v: number) => void;
  onChangeMinute: (v: number) => void;
}

// هندسه‌ی صفحه‌ی ساعت — یک ویوباکس مربعی که هم روی حالت ساعت (دو حلقه‌ی ۱۲/۲۴
// ساعته، دقیقاً مثل ساعت‌شمار دوبل رایج در پیکرهای اندروید) و هم روی حالت دقیقه
// (یک حلقه، با گام‌های ۵ دقیقه‌ای روی صفحه و امکان کشیدن دقیق‌تر بین آن‌ها) کار می‌کند.
const SIZE = 260;
const CENTER = SIZE / 2;
const OUTER_R = 100;
const INNER_R = 62;
const RING_SPLIT_R = (OUTER_R + INNER_R) / 2;
const MINUTE_R = 100;

const polarToPoint = (radius: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
};

const pointToAngle = (dx: number, dy: number) => {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  return deg;
};

// اسلات صفر یعنی بالای صفحه (زاویه‌ی صفر) — اسلات‌های ۱ تا ۱۱ در جهت عقربه‌های ساعت.
const angleToSlot = (angle: number) => Math.round(angle / 30) % 12;

const hourFromSlotAndRing = (slot: number, isOuter: boolean): number => {
  if (isOuter) return slot === 0 ? 12 : slot; // حلقه‌ی بیرونی: ۱ تا ۱۲
  return slot === 0 ? 0 : slot + 12; // حلقه‌ی درونی: ۱۳ تا ۲۳ و ۰۰
};

const slotAndRingFromHour = (hour: number): { slot: number; isOuter: boolean } => {
  const isOuter = hour >= 1 && hour <= 12;
  const slot = isOuter ? hour % 12 : hour === 0 ? 0 : hour - 12;
  return { slot, isOuter };
};

type Mode = 'hour' | 'minute';

/**
 * صفحه‌ی ساعتِ گرد (نه رول/wheel) برای انتخاب زمان — عقربه‌ای که با لمس/کشیدن
 * روی صفحه یا زدن مستقیم روی هر عدد قابل تنظیم است. برای پوشش کامل ۲۴ ساعت
 * (بدون نیاز به دکمه‌ی ق.ظ/ب.ظ که در بقیه‌ی برنامه اصلاً استفاده نمی‌شود) از دو
 * حلقه استفاده می‌شود: حلقه‌ی بیرونی ۱ تا ۱۲ و حلقه‌ی درونی ۱۳ تا ۲۳ و ۰۰.
 * بعد از انتخاب ساعت، صفحه خودش به‌صورت خودکار به حالت انتخاب دقیقه می‌رود.
 */
export const ClockFacePicker: React.FC<ClockFacePickerProps> = ({ hour, minute, onChangeHour, onChangeMinute }) => {
  const [mode, setMode] = useState<Mode>('hour');
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  // شناسه‌ی یکتا برای گرادیان — تا اگر چند نمونه از این کامپوننت هم‌زمان در صفحه رندر شوند
  // (مثلاً یکی داخل ویزارد و یکی داخل مودال زمان دلخواه) شناسه‌ها با هم تداخل نکنند.
  const gradientId = `daroto-clock-accent-${useId()}`;

  const applyFromClientPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const dx = (clientX - (rect.left + rect.width / 2)) * scale;
    const dy = (clientY - (rect.top + rect.height / 2)) * scale;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = pointToAngle(dx, dy);

    if (mode === 'hour') {
      const slot = angleToSlot(angle);
      const isOuter = dist >= RING_SPLIT_R;
      onChangeHour(hourFromSlotAndRing(slot, isOuter));
    } else {
      const rawMinute = Math.round(angle / 6) % 60;
      onChangeMinute(rawMinute);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    applyFromClientPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    applyFromClientPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer capture might already be released — safe to ignore */
    }
    if (mode === 'hour') setMode('minute');
  };

  // موقعیت فعلی عقربه
  const { slot: hourSlot, isOuter: hourIsOuter } = slotAndRingFromHour(hour);
  const handAngle = mode === 'hour' ? hourSlot * 30 : minute * 6;
  const handRadius = mode === 'hour' ? (hourIsOuter ? OUTER_R : INNER_R) : MINUTE_R;
  const handEnd = polarToPoint(handRadius - 20, handAngle);
  const knobCenter = polarToPoint(handRadius, handAngle);

  const outerNumbers = Array.from({ length: 12 }, (_, slot) => {
    const value = hourFromSlotAndRing(slot, true);
    const selected = mode === 'hour' && hourIsOuter && hourSlot === slot;
    return { slot, value, selected, ...polarToPoint(OUTER_R, slot * 30) };
  });

  const innerNumbers = Array.from({ length: 12 }, (_, slot) => {
    const value = hourFromSlotAndRing(slot, false);
    const selected = mode === 'hour' && !hourIsOuter && hourSlot === slot;
    return { slot, value, selected, ...polarToPoint(INNER_R, slot * 30) };
  });

  const minuteTicks = Array.from({ length: 12 }, (_, slot) => {
    const value = slot * 5;
    const selected = mode === 'minute' && minute === value;
    return { slot, value, selected, ...polarToPoint(MINUTE_R, slot * 30) };
  });

  return (
    <div className="select-none dir-ltr" style={{ direction: 'ltr' }}>
      {/* نمایشگر دیجیتال — روی هرکدام از ساعت/دقیقه بزنید تا صفحه روی همان حالت برود */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setMode('hour')}
          className={`px-3.5 py-1.5 rounded-xl text-xl font-black tabular-nums transition-all ${
            mode === 'hour'
              ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {toPersianNumbers(hour.toString().padStart(2, '0'))}
        </button>
        <span className="text-xl font-black text-slate-400">:</span>
        <button
          type="button"
          onClick={() => setMode('minute')}
          className={`px-3.5 py-1.5 rounded-xl text-xl font-black tabular-nums transition-all ${
            mode === 'minute'
              ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {toPersianNumbers(minute.toString().padStart(2, '0'))}
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto block w-full max-w-[190px] touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <circle cx={CENTER} cy={CENTER} r={OUTER_R + 24} fill="#94a3b8" />

        {mode === 'hour' && <circle cx={CENTER} cy={CENTER} r={RING_SPLIT_R} fill="none" stroke="#64748b" strokeWidth={1} />}

        {/* عقربه */}
        <line x1={CENTER} y1={CENTER} x2={handEnd.x} y2={handEnd.y} stroke="#14b8a6" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CENTER} cy={CENTER} r={4} fill="#14b8a6" />

        {mode === 'hour' ? (
          <>
            {outerNumbers.map(n => (
              <g key={`o-${n.slot}`}>
                {n.selected && <circle cx={n.x} cy={n.y} r={17} fill={`url(#${gradientId})`} />}
                <text
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none"
                  fill={n.selected ? '#ffffff' : '#1e293b'}
                  fontSize={15}
                  fontWeight={700}
                >
                  {toPersianNumbers(n.value)}
                </text>
              </g>
            ))}
            {innerNumbers.map(n => (
              <g key={`i-${n.slot}`}>
                {n.selected && <circle cx={n.x} cy={n.y} r={14} fill={`url(#${gradientId})`} />}
                <text
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none"
                  fill={n.selected ? '#ffffff' : '#334155'}
                  fontSize={12}
                  fontWeight={700}
                >
                  {toPersianNumbers(n.value.toString().padStart(2, '0'))}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            {minuteTicks.map(n => (
              <g key={`m-${n.slot}`}>
                {n.selected && <circle cx={n.x} cy={n.y} r={17} fill={`url(#${gradientId})`} />}
                <text
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none"
                  fill={n.selected ? '#ffffff' : '#1e293b'}
                  fontSize={15}
                  fontWeight={700}
                >
                  {toPersianNumbers(n.value.toString().padStart(2, '0'))}
                </text>
              </g>
            ))}
            {/* نقطه‌ی دقیق روی عقربه — فقط وقتی دقیقه روی گام ۵تایی نباشد نمایش داده
                می‌شود، تا روی رقمِ عددهای دقیقه (که دقیقاً روی همین موقعیت‌های ۵تایی
                هستند) نیفتد و خواندنشان را مانع نشود. */}
            {minute % 5 !== 0 && <circle cx={knobCenter.x} cy={knobCenter.y} r={4} fill="#14b8a6" />}
          </>
        )}

        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>

      <p className="text-center text-[11px] font-bold text-slate-400 mt-2">
        {mode === 'hour' ? 'روی صفحه بکشید یا لمس کنید تا ساعت را انتخاب کنید' : 'روی صفحه بکشید یا لمس کنید تا دقیقه را انتخاب کنید'}
      </p>
    </div>
  );
};

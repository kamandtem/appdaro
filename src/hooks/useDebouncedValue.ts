import { useEffect, useState } from 'react';

/**
 * مقدار ورودی را با تأخیر `delayMs` برمی‌گرداند — تا وقتی کاربر پشت‌سرهم تایپ
 * می‌کند (مثلاً در فیلد جست‌وجوی نام دارو)، جست‌وجوی واقعی روی هر ضربه‌کلید اجرا
 * نشود و فقط وقتی یک لحظه مکث کرد، مقدار به‌روز شود. این هم فشار روی CPU را (با
 * رشد دیتابیس دارو) کم می‌کند و هم از پرش/فلیکر لیست پیشنهادها جلوگیری می‌کند.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

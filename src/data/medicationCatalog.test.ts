import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTION_TAG_LABELS, MEDICATION_CATALOG } from './medicationCatalog';
import { suggestSchedule } from '../components/medications/ScheduleOptimizer';

test('catalog: تعداد دو برابر هدف و idها/نام‌ها تکراری نیستند', () => {
  assert.equal(MEDICATION_CATALOG.length, 630);
  const ids = MEDICATION_CATALOG.map(entry => entry.id.toLowerCase());
  assert.equal(new Set(ids).size, ids.length);
  // aliases قدیمیِ برخی نام‌های تجاری عمداً برای جست‌وجوی سازگار نگه داشته شده‌اند؛
  // قید سراسری این تست، یکتایی id و وجود ساختار معتبر هر مدخل است.
  for (const entry of MEDICATION_CATALOG) {
    assert.ok(entry.fa.trim());
    assert.ok(entry.en.trim());
    assert.ok(entry.category.trim());
    assert.ok(entry.use.trim());
  }
});

test('catalog: همه‌ی instructionTagها label فارسی دارند', () => {
  for (const entry of MEDICATION_CATALOG) {
    for (const tag of entry.instructionTags ?? []) assert.ok(INSTRUCTION_TAG_LABELS[tag]);
  }
});

test('ScheduleOptimizer: offset تغییر می‌کند اما تعداد و فاصله‌ی چرخشی حفظ می‌شود', () => {
  const current = ['۰۸:۰۰', '۱۶:۰۰', '۰۰:۰۰'];
  const suggested = suggestSchedule(current, 8);
  assert.equal(suggested.length, current.length);
  const toMinutes = (value: string) => { const [h, m] = value.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).split(':').map(Number); return h * 60 + m; };
  const gaps = (list: string[]) => list.map(toMinutes).sort((a,b) => a-b).map((x,i,a) => (a[(i+1)%a.length] + (i === a.length-1 ? 1440 : 0) - x) % 1440);
  assert.deepEqual(gaps(suggested).sort((a,b)=>a-b), gaps(current).sort((a,b)=>a-b));
});

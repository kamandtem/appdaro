import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, KeyValueStorage, LocalStoragePersistenceAdapter } from './LocalStoragePersistenceAdapter';

test('LocalStoragePersistenceAdapter: readAll روی storage خالی، آرایه‌ی خالی برمی‌گردونه', () => {
  const adapter = new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage());
  assert.deepEqual(adapter.readAll('medications'), []);
});

test('LocalStoragePersistenceAdapter: writeAll و بعد readAll دقیقاً همون داده رو برمی‌گردونه', () => {
  const adapter = new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage());
  const items = [{ id: 'a', name: 'قرص ۱' }, { id: 'b', name: 'قرص ۲' }];
  adapter.writeAll('medications', items);
  assert.deepEqual(adapter.readAll('medications'), items);
});

test('LocalStoragePersistenceAdapter: دو collection مختلف با هم تداخل ندارن', () => {
  const storage = new InMemoryKeyValueStorage();
  const adapter = new LocalStoragePersistenceAdapter(storage);
  adapter.writeAll('medications', [{ id: 'a' }]);
  adapter.writeAll('dose_occurrences', [{ id: 'o1' }, { id: 'o2' }]);
  assert.equal(adapter.readAll('medications').length, 1);
  assert.equal(adapter.readAll('dose_occurrences').length, 2);
});

test('LocalStoragePersistenceAdapter: JSON خراب توی storage، بدون throw به آرایه‌ی خالی می‌افته', () => {
  const storage = new InMemoryKeyValueStorage();
  storage.setItem('darooto_repo_v1:medications', '{ این یک جیسون معتبر نیست');
  const adapter = new LocalStoragePersistenceAdapter(storage);
  assert.deepEqual(adapter.readAll('medications'), []);
});

test('LocalStoragePersistenceAdapter: مقداری که آرایه نیست (مثلاً یک آبجکت تنها) هم به آرایه‌ی خالی می‌افته', () => {
  const storage = new InMemoryKeyValueStorage();
  storage.setItem('darooto_repo_v1:medications', JSON.stringify({ not: 'an array' }));
  const adapter = new LocalStoragePersistenceAdapter(storage);
  assert.deepEqual(adapter.readAll('medications'), []);
});

test('LocalStoragePersistenceAdapter: اگه storage.setItem throw کنه، writeAll بی‌سروصدا swallow می‌کنه (مثل الگوی storageService.ts فعلی)', () => {
  const throwingStorage: KeyValueStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {}
  };
  const adapter = new LocalStoragePersistenceAdapter(throwingStorage);
  assert.doesNotThrow(() => adapter.writeAll('medications', [{ id: 'a' }]));
});

test('LocalStoragePersistenceAdapter: writeAll جایگزینی کامله، نه append', () => {
  const adapter = new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage());
  adapter.writeAll('medications', [{ id: 'a' }, { id: 'b' }]);
  adapter.writeAll('medications', [{ id: 'c' }]);
  assert.deepEqual(adapter.readAll('medications'), [{ id: 'c' }]);
});

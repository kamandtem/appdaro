// MedicationRepository — بخش ۸ سند طراحی. مثل DoseOccurrenceRepository، یک
// wrapper نازک با کوئری‌های استاندارد روی آرایه‌ی Medication از AppState.

import { Medication } from '../types';

export class MedicationRepository {
  constructor(private medications: Medication[]) {}

  all(): Medication[] {
    return this.medications;
  }

  active(): Medication[] {
    return this.medications.filter(m => m.isActive);
  }

  byId(id: string): Medication | undefined {
    return this.medications.find(m => m.id === id);
  }
}

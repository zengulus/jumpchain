export interface PurchaseSpendInput {
  sectionKey: string;
  grossAmount: number;
}

export interface PurchaseSpendBreakdown extends PurchaseSpendInput {
  stipendApplied: number;
  netAmount: number;
}

export type StipendMap = Record<string, number>;

function normalizeAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clonePositiveStipends(stipends: StipendMap): StipendMap {
  return Object.fromEntries(
    Object.entries(stipends).flatMap(([sectionKey, amount]) => {
      const normalizedAmount = Math.max(0, normalizeAmount(amount));
      return normalizedAmount > 0 ? [[sectionKey, normalizedAmount]] : [];
    }),
  );
}

export function applyPurchaseStipends(
  purchases: PurchaseSpendInput[],
  stipends: StipendMap,
): PurchaseSpendBreakdown[] {
  const remainingStipends = clonePositiveStipends(stipends);

  return purchases.map((purchase) => {
    const grossAmount = normalizeAmount(purchase.grossAmount);
    const sectionKey = purchase.sectionKey.trim();
    const availableStipend = grossAmount > 0 && sectionKey ? remainingStipends[sectionKey] ?? 0 : 0;
    const stipendApplied = Math.min(grossAmount, availableStipend);

    if (stipendApplied > 0 && sectionKey) {
      remainingStipends[sectionKey] = availableStipend - stipendApplied;
    }

    return {
      sectionKey,
      grossAmount,
      stipendApplied,
      netAmount: grossAmount - stipendApplied,
    };
  });
}

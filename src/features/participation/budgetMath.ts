export interface PurchaseSpendInput {
  currencyKey: string;
  subtypeKey: string | null;
  grossAmount: number;
}

export interface PurchaseSpendBreakdown extends PurchaseSpendInput {
  stipendApplied: number;
  netAmount: number;
}

export type StipendMap = Record<string, Record<string, number>>;

function normalizeAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clonePositiveStipends(stipends: StipendMap): StipendMap {
  return Object.fromEntries(
    Object.entries(stipends).map(([currencyKey, subtypeEntries]) => [
      currencyKey,
      Object.fromEntries(
        Object.entries(subtypeEntries).flatMap(([subtypeKey, amount]) => {
          const normalizedAmount = Math.max(0, normalizeAmount(amount));
          return normalizedAmount > 0 ? [[subtypeKey, normalizedAmount]] : [];
        }),
      ),
    ]),
  );
}

export function applyPurchaseStipends(
  purchases: PurchaseSpendInput[],
  stipends: StipendMap,
): PurchaseSpendBreakdown[] {
  const remainingStipends = clonePositiveStipends(stipends);

  return purchases.map((purchase) => {
    const grossAmount = normalizeAmount(purchase.grossAmount);
    const subtypeKey = purchase.subtypeKey?.trim() ? purchase.subtypeKey : null;
    const availableStipend =
      grossAmount > 0 && subtypeKey ? remainingStipends[purchase.currencyKey]?.[subtypeKey] ?? 0 : 0;
    const stipendApplied = Math.min(grossAmount, availableStipend);

    if (stipendApplied > 0 && subtypeKey) {
      remainingStipends[purchase.currencyKey] = {
        ...(remainingStipends[purchase.currencyKey] ?? {}),
        [subtypeKey]: availableStipend - stipendApplied,
      };
    }

    return {
      currencyKey: purchase.currencyKey,
      subtypeKey,
      grossAmount,
      stipendApplied,
      netAmount: grossAmount - stipendApplied,
    };
  });
}

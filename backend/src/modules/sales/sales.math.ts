export function financialYearString(d: Date) {
  const year = d.getFullYear();
  const month = d.getMonth();
  const fyStartYear = month >= 3 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  return `${fyStartYear}-${String(fyEndYear).slice(-2)}`;
}

export function qtyToMilli(qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Invalid qty');
  return BigInt(Math.round(qty * 1000));
}

export function mulPaiseByQtyMilli(unitPaise: bigint, qtyMilli: bigint) {
  const n = unitPaise * qtyMilli;
  return (n + 500n) / 1000n;
}

export function mulPaiseByRateBp(amountPaise: bigint, rateBp: number) {
  const n = amountPaise * BigInt(rateBp);
  return (n + 5000n) / 10000n;
}

export function safeBigIntFromNumber(n: number) {
  if (!Number.isFinite(n)) throw new Error('Invalid number');
  return BigInt(Math.round(n));
}


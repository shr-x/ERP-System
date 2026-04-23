export function paiseStringToBigInt(paise: string) {
  return BigInt(paise);
}

export function rupeesToPaiseBigInt(rupees: number) {
  return BigInt(Math.round(rupees * 100));
}

export function paiseToRupeesString(paise: bigint) {
  const sign = paise < 0n ? '-' : '';
  const abs = paise < 0n ? -paise : paise;
  const r = abs / 100n;
  const p = abs % 100n;
  return `${sign}${r.toString()}.${p.toString().padStart(2, '0')}`;
}

export function qtyToMilliBigInt(qty: number) {
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


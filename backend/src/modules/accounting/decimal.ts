export function decimalToMilliString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value && typeof value === 'object' && typeof (value as any).toString === 'function') {
    return (value as any).toString();
  }
  throw new Error('Invalid decimal');
}

export function decimalToMilliBigInt(decimal: string) {
  const m = decimal.trim().match(/^(-?\d+)(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error('Invalid decimal');
  const sign = m[1].startsWith('-') ? -1n : 1n;
  const intPart = BigInt(m[1].replace('-', ''));
  const frac = (m[2] ?? '').padEnd(3, '0');
  const fracPart = frac ? BigInt(frac) : 0n;
  return sign * (intPart * 1000n + fracPart);
}


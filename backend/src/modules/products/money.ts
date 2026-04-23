export function rupeesToPaise(input: number) {
  return BigInt(Math.round(input * 100));
}

export function percentToBasisPoints(input: number) {
  return Math.round(input * 100);
}


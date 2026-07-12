export type AspectRatioPair = Readonly<{
  width: number;
  height: number;
}>;

function positiveInteger(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(value));
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function reduceRatio(width: number, height: number): AspectRatioPair {
  const divisor = greatestCommonDivisor(width, height);
  return {
    width: width / divisor,
    height: height / divisor,
  };
}

export function integerAspectRatio(
  width: number,
  height: number,
  maxDenominator = 48,
): AspectRatioPair {
  const roundedWidth = positiveInteger(width);
  const roundedHeight = positiveInteger(height);
  const exact = reduceRatio(roundedWidth, roundedHeight);
  if (Math.max(exact.width, exact.height) <= maxDenominator) {
    return exact;
  }

  const target = roundedWidth / roundedHeight;
  let best = { width: 1, height: 1 };
  let bestError = Number.POSITIVE_INFINITY;
  for (let candidateHeight = 1; candidateHeight <= maxDenominator; candidateHeight += 1) {
    const candidateWidth = Math.max(1, Math.round(target * candidateHeight));
    const error = Math.abs(candidateWidth / candidateHeight - target);
    if (error < bestError) {
      best = reduceRatio(candidateWidth, candidateHeight);
      bestError = error;
    }
  }
  return best;
}

export function formatAspectRatio(width: number, height: number): string {
  const ratio = integerAspectRatio(width, height);
  return `${ratio.width}:${ratio.height}`;
}

export function formatDecimalRatio(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

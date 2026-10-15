/** Native USD numbers: presentation only, never foreign-exchange conversion. */
export function formatNativeUsd(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function compactUsdBody(text: string): string {
  return text.replace(/R\$\s*/g, "$").replace(/\$[ \t]+/g, "$")
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");
}

export function isRenderedUsdPulse(type: string | null, payload: Record<string, unknown> | null): boolean {
  return type === "pulse_1h" && payload?.report_currency === "USD" && payload?.report_source === "redtrack";
}
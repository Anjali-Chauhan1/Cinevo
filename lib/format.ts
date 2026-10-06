export function paise(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs / 100);
  const decimals = (abs % 100).toString().padStart(2, "0");
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${decimals}`;
}

export function paiseWhole(amount: number): string {
  return `₹${Math.round(amount / 100).toLocaleString("en-IN")}`;
}

export function relativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = diffSec;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let divisor = 1;
  for (const [amount, u] of units) {
    if (abs < divisor * amount) {
      unit = u;
      value = Math.round(diffSec / divisor);
      break;
    }
    divisor *= amount;
  }
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);
}

export function durationLabel(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

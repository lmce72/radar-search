/**
 * Convert an untrusted value to display text without relying on Object's
 * default stringification (`[object Object]`).
 * 将未知值转换为可显示的文本，避免退化成 `[object Object]`。
 */
export function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? '' : encoded;
  } catch {
    return '';
  }
}

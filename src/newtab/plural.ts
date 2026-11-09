/** České tvary: 1 odkaz, 2–4 odkazy, 0 a 5+ odkazů. */
export function odkazu(n: number): string {
  if (n === 1) return 'odkaz';
  if (n >= 2 && n <= 4) return 'odkazy';
  return 'odkazů';
}

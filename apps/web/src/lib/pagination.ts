export const PAGE_SIZE_OPTIONS = [5, 10] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export type PageItem = number | 'gap';

/**
 * Page numbers to show: always the first and last page, the current one and
 * `siblings` on each side, with 'gap' where pages are skipped.
 * pageItems(6, 20, 1) -> [1, 'gap', 5, 6, 7, 'gap', 20]
 */
export function pageItems(current: number, total: number, siblings: number): PageItem[] {
  // first + last + current + siblings on both sides + two gaps
  const maxSlots = 2 * siblings + 5;
  if (total <= maxSlots) return Array.from({ length: total }, (_, i) => i + 1);

  // Keep the window the same width near the edges so the control does not jump around.
  let start = Math.max(2, Math.min(current - siblings, total - siblings * 2 - 2));
  let end = Math.min(total - 1, Math.max(current + siblings, siblings * 2 + 3));
  // A gap that would hide a single page takes the same space as that page: show it instead.
  if (start === 3) start = 2;
  if (end === total - 2) end = total - 1;

  const items: PageItem[] = [1];
  if (start > 2) items.push('gap');
  for (let page = start; page <= end; page++) items.push(page);
  if (end < total - 1) items.push('gap');
  items.push(total);
  return items;
}

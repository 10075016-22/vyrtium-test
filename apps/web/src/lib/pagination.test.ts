import { pageItems } from './pagination';

describe('pageItems', () => {
  it('lists every page when they all fit', () => {
    expect(pageItems(1, 1, 1)).toEqual([1]);
    expect(pageItems(3, 7, 1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it.each([
    [1, [1, 2, 3, 4, 5, 'gap', 20]],
    [4, [1, 2, 3, 4, 5, 'gap', 20]],
    [6, [1, 'gap', 5, 6, 7, 'gap', 20]],
    [10, [1, 'gap', 9, 10, 11, 'gap', 20]],
    [17, [1, 'gap', 16, 17, 18, 19, 20]],
    [20, [1, 'gap', 16, 17, 18, 19, 20]],
  ])('keeps a fixed-width window around page %i of 20', (current, expected) => {
    expect(pageItems(current, 20, 1)).toEqual(expected);
  });

  it('never uses a gap to hide a single page', () => {
    for (let current = 1; current <= 20; current++) {
      const items = pageItems(current, 20, 1);
      items.forEach((item, i) => {
        if (item !== 'gap') return;
        const before = items[i - 1] as number;
        const after = items[i + 1] as number;
        expect(after - before).toBeGreaterThan(2);
      });
    }
  });

  it('shows only first, current and last on narrow screens', () => {
    expect(pageItems(6, 20, 0)).toEqual([1, 'gap', 6, 'gap', 20]);
    expect(pageItems(1, 20, 0)).toEqual([1, 2, 3, 'gap', 20]);
    expect(pageItems(20, 20, 0)).toEqual([1, 'gap', 18, 19, 20]);
  });
});

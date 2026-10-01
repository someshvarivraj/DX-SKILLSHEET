import { describe, expect, it } from 'vitest';
import { composeGridText, gridRowsOf, parseGridText } from '../src/lib/sheet/grid';

describe('grid values (JLPT 各スコア)', () => {
  const text = '総合点：134点（180点満点）\n読解：48点（60点満点）';

  it('reads "ラベル：値" lines into rows', () => {
    expect(parseGridText(text)).toEqual([
      { row: '総合点', value: '134点（180点満点）' },
      { row: '読解', value: '48点（60点満点）' },
    ]);
  });

  it('round-trips rows and text', () => {
    expect(composeGridText(parseGridText(text))).toBe(text);
  });

  it('leaves out rows whose value was cleared', () => {
    expect(composeGridText([{ row: '総合点', value: '' }, { row: '読解', value: '50' }])).toBe('読解：50');
  });

  it('accepts a half-width colon and keeps colons inside the value', () => {
    expect(parseGridText('Time: 10:30')).toEqual([{ row: 'Time', value: '10:30' }]);
  });

  it('prefers the structured copy when there is one', () => {
    expect(gridRowsOf([{ row: 'A', value: '1' }], 'B：2')).toEqual([{ row: 'A', value: '1' }]);
    expect(gridRowsOf(null, 'B：2')).toEqual([{ row: 'B', value: '2' }]);
  });
});

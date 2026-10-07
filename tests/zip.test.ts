import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, makeZip } from '../src/lib/zip';

describe('makeZip (bulk PDF download)', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive that unzip reads back and verifies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const zip = join(dir, 'out.zip');
    writeFileSync(
      zip,
      makeZip([
        { name: 'Priya_Das_20261008.pdf', data: Buffer.from('%PDF-1.7 first') },
        { name: 'Rohan_Deshmukh_20261008.pdf', data: Buffer.from('%PDF-1.7 second') },
      ]),
    );
    execFileSync('unzip', ['-tq', zip]); // throws on a bad CRC or structure
    expect(execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n')).toEqual([
      'Priya_Das_20261008.pdf',
      'Rohan_Deshmukh_20261008.pdf',
    ]);
    execFileSync('unzip', ['-q', zip, '-d', dir]);
    expect(readFileSync(join(dir, 'Rohan_Deshmukh_20261008.pdf'), 'utf8')).toBe('%PDF-1.7 second');
  });

  it('marks names as UTF-8 so Japanese names open correctly', () => {
    const zip = makeZip([{ name: '出力できなかった人.txt', data: Buffer.from('x') }]);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.subarray(30, 30 + Buffer.byteLength('出力できなかった人.txt')).toString('utf8')).toBe('出力できなかった人.txt');
  });
});

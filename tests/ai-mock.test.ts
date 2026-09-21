import { describe, expect, it } from 'vitest';
import { MockAiProvider } from '../src/lib/ai/mock';

/**
 * The mock provider's output is printed on the sheet as-is while the AI service
 * is not connected, so it must obey the same typographic rules as real output.
 */
describe('MockAiProvider', () => {
  const generate = (sourceText: string) =>
    new MockAiProvider().generate({
      messages: [{ role: 'user', content: `<原文>\n${sourceText}\n</原文>` }],
      purpose: 'test',
    } as never);

  it('does not leak the source separator into the figure list', async () => {
    // Two answers joined by a blank line: the number ending the first answer
    // must not absorb the separator that follows it.
    const res = await generate('[C-1-1] N2\n\n[C-1-4] IELTS 7.0 (2023)');
    expect(res.text).not.toMatch(/\n/);
    expect(res.text).toContain('数値は');
  });

  it('never produces a line beginning with a comma', async () => {
    const res = await generate('[E-1-1] 3名\n\n[E-1-2] 12週間\n\n[E-1-3] 2回');
    for (const line of res.text.split('\n')) {
      expect(line.trimStart()).not.toMatch(/^[、。]/);
    }
  });

  it('keeps a percentage as a single figure', async () => {
    const res = await generate('[D-1-1] 効率を30 %改善');
    expect(res.text).toContain('30%');
  });

  it('is deterministic', async () => {
    const a = await generate('[A-1-1] Test Value 42');
    const b = await generate('[A-1-1] Test Value 42');
    expect(a.text).toBe(b.text);
  });
});

import { describe, expect, it } from 'vitest';
import { buildImportFormData } from '../src/lib/import/form-data';

const csv = () => new File(['A-1-1\nPriya Nair\n'], 'sample-responses-2.csv', {
  type: 'text/csv',
});

describe('取り込み画面が送信する内容', () => {
  it('選択されたファイルをそのまま送る', () => {
    const file = csv();
    const data = buildImportFormData(file, false);
    const sent = data.get('file');
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('sample-responses-2.csv');
    expect((sent as File).size).toBe(file.size);
  });

  it('生成するときだけ generate を付ける', () => {
    // The server reads `formData.get('generate') === 'on'`, which is how an
    // unchecked box behaves in a real form submission — absent, not "off".
    expect(buildImportFormData(csv(), true).get('generate')).toBe('on');
    expect(buildImportFormData(csv(), false).get('generate')).toBeNull();
  });

  it('同じファイルから何度でも作れる', () => {
    // 内容を確認する and then 取り込む send the same file twice. The File the
    // screen holds must survive being put into a FormData once.
    const file = csv();
    const first = buildImportFormData(file, true);
    const second = buildImportFormData(file, true);
    expect((first.get('file') as File).name).toBe((second.get('file') as File).name);
    expect((second.get('file') as File).size).toBe(file.size);
  });
});

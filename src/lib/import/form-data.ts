/**
 * Build the payload the import actions expect.
 *
 * The screen keeps the chosen file in React state rather than reading it off
 * the form at submit time, because a server action resets the form that
 * submitted it and an `<input type="file">` is cleared with it. That means the
 * payload is assembled by hand, so the shape the server reads — `file`, and
 * `generate` only when it is on — is pinned down here and covered by tests.
 */
export function buildImportFormData(file: File, generate: boolean): FormData {
  const data = new FormData();
  data.set('file', file);
  // An unchecked checkbox sends nothing at all; the server reads
  // `formData.get('generate') === 'on'`, so absence is how "off" is expressed.
  if (generate) data.set('generate', 'on');
  return data;
}

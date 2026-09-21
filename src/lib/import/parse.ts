/**
 * Reading a Google Form response export.
 *
 * Supports the two shapes the operator can produce without any API setup:
 * a CSV download and an .xlsx download of the response sheet. Which one is used
 * is an operational choice, not an architectural one (§15 leaves the
 * spreadsheet-vs-API question open; both land in the same importer).
 */

import ExcelJS from 'exceljs';

export type RawRow = Record<string, string>;

export type ParsedFile = {
  headers: string[];
  rows: RawRow[];
};

/** RFC4180-ish CSV parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(content: string): ParsedFile {
  const text = content.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // handled by the \n branch
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const dataRows = nonEmpty.slice(1).map((r) => {
    const obj: RawRow = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows: dataRows };
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: RawRow = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const cell = row.getCell(i + 1);
      const value = cell.value;
      if (value === null || value === undefined) {
        obj[h] = '';
      } else if (value instanceof Date) {
        obj[h] = value.toISOString().slice(0, 10);
      } else if (typeof value === 'object' && 'text' in value) {
        obj[h] = String((value as { text: unknown }).text ?? '').trim();
      } else if (typeof value === 'object' && 'result' in value) {
        obj[h] = String((value as { result: unknown }).result ?? '').trim();
      } else {
        obj[h] = String(value).trim();
      }
    });
    if (Object.values(obj).some((v) => v !== '')) rows.push(obj);
  });

  return { headers: headers.filter(Boolean), rows };
}

export async function parseUpload(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<ParsedFile> {
  if (/\.xlsx?$/i.test(fileName)) return parseXlsx(buffer);
  return parseCsv(new TextDecoder('utf-8').decode(buffer));
}

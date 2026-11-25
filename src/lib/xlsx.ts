import { strFromU8, unzipSync } from 'fflate';

export type Cell = string | number | null;
/** Sheets by name; rows and columns keep their positions (row 1 is index 0). */
export type Workbook = Map<string, Cell[][]>;

export class SpreadsheetError extends Error {}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? match;
  });
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes);
  return match ? decodeXml(match[1]) : null;
}

/** All text of `<t>` elements inside a fragment (rich text has several runs). */
function textOf(fragment: string): string {
  let text = '';
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    text += match[1];
  }
  return decodeXml(text);
}

/** `A` → 0, `Z` → 25, `AA` → 26. */
function columnIndex(reference: string): number {
  let index = 0;
  for (const char of reference) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]));
}

function readSheet(xml: string, sharedStrings: string[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attribute(rowMatch[1], 'r') ?? rows.length + 1);
    const row: Cell[] = [];
    let nextColumn = 0;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    )) {
      const attributes = cellMatch[1];
      const content = cellMatch[2] ?? '';
      const reference = attribute(attributes, 'r');
      const column = reference ? columnIndex(reference) : nextColumn;
      nextColumn = column + 1;

      const type = attribute(attributes, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1];
      let value: Cell = null;
      if (type === 's') value = raw != null ? (sharedStrings[Number(raw)] ?? null) : null;
      else if (type === 'inlineStr') value = textOf(content);
      else if (type === 'str' || type === 'e') value = raw != null ? decodeXml(raw) : null;
      else if (raw != null && raw !== '') value = Number(raw);
      row[column] = value === '' ? null : value;
    }
    rows[rowNumber - 1] = Array.from(row, (cell) => cell ?? null);
  }
  return Array.from(rows, (row) => row ?? []);
}

/**
 * Minimal .xlsx reader: cell values of every sheet (strings and numbers;
 * dates stay Excel serial numbers, see `excelDateToTime`). No formulas or
 * styles, which an export from a broker does not need.
 */
export function readWorkbook(bytes: Uint8Array): Workbook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name.startsWith('xl/') });
  } catch {
    throw new SpreadsheetError('To nie jest plik Excel (.xlsx).');
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : undefined);

  const workbookXml = read('xl/workbook.xml');
  const relationsXml = read('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relationsXml) {
    throw new SpreadsheetError('To nie jest plik Excel (.xlsx).');
  }

  const targets = new Map<string, string>();
  for (const match of relationsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attribute(match[1], 'Id');
    const target = attribute(match[1], 'Target');
    if (!id || !target) continue;
    targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const sharedStrings = readSharedStrings(read('xl/sharedStrings.xml'));
  const workbook: Workbook = new Map();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attribute(match[1], 'name');
    const id = attribute(match[1], 'r:id');
    const path = id ? targets.get(id) : undefined;
    const xml = path ? read(path) : undefined;
    if (name && xml) workbook.set(name, readSheet(xml, sharedStrings));
  }
  return workbook;
}

/** Excel date serial (days since 1899-12-30, 1900 system) → Unix time in ms. */
export function excelDateToTime(serial: number): number {
  return Math.round((serial - 25569) * 86_400_000);
}

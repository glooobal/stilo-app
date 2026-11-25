import { strToU8, zipSync } from 'fflate';

type Cell = string | number | null;

/** Excel date serial of a UTC time like `2026-06-09T10:31:38Z`. */
export function excelDate(iso: string): number {
  return Date.parse(iso) / 86_400_000 + 25569;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/**
 * A minimal .xlsx file (like the brokers' exports) with the given sheets.
 * Text goes to the shared strings table, numbers stay inline.
 */
export function buildXlsx(sheets: Record<string, Cell[][]>): Uint8Array {
  const strings: string[] = [];
  const stringIndex = (text: string) => {
    let index = strings.indexOf(text);
    if (index < 0) index = strings.push(text) - 1;
    return index;
  };

  const files: Record<string, Uint8Array> = {};
  const names = Object.keys(sheets);
  names.forEach((name, sheetIndex) => {
    const rows = sheets[name]
      .map((row, rowIndex) => {
        const cells = row
          .map((cell, columnIndex) => {
            const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
            if (cell == null) return '';
            if (typeof cell === 'number') return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
            return `<c r="${ref}" t="s"><v>${stringIndex(cell)}</v></c>`;
          })
          .join('');
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join('');
    files[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`
    );
  });

  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>${names
      .map((name, index) => `<sheet name="${escape(name)}" r:id="rId${index + 1}" sheetId="${index + 1}"/>`)
      .join('')}</sheets></workbook>`
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0"?><Relationships>${names
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml" Type="worksheet"/>`
      )
      .join('')}</Relationships>`
  );
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0"?><sst>${strings.map((text) => `<si><t>${escape(text)}</t></si>`).join('')}</sst>`
  );
  return zipSync(files);
}

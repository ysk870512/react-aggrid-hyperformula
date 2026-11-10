/** Excel-style A1 formula reference shifting. Handles quoted strings and sheet prefixes. */
export function shiftFormula(formula: string, rowDelta: number, colDelta: number): string {
  if (!formula.startsWith('=')) return formula;
  const columnIndex = (letters: string) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const columnName = (index: number) => { let out = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; };
  // Do not transform A1-looking text inside quoted strings.
  return formula.split(/("(?:[^"]|"")*")/g).map((part, index) => {
    if (index % 2) return part;
    return part.replace(/(?<![A-Za-z0-9_.])((?:'[^']+'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)(?![A-Za-z0-9_.])/g,
      (match, sheet: string | undefined, fixedCol: string, col: string, fixedRow: string, row: string) => {
        const c = columnIndex(col) + (fixedCol ? 0 : colDelta);
        const r = Number(row) - 1 + (fixedRow ? 0 : rowDelta);
        return c < 0 || r < 0 ? '#REF!' : (sheet || '') + fixedCol + columnName(c) + fixedRow + String(r + 1);
      });
  }).join('');
}

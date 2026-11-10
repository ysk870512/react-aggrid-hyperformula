# React AG Grid + HyperFormula

React 19 + TypeScript + Vite spreadsheet prototype. AG Grid is pinned to **35.2.1** and HyperFormula is the only formula engine.

## Start

```bash
npm install
npm run dev
npm run build
```

Copy `.env.example` to `.env` and set `VITE_AG_GRID_LICENSE_KEY` locally. Never commit license keys.

## Implemented prototype features

- 1,000 rows × 26 columns, grid virtualization and editable cells
- HyperFormula calculation, formula bar and dependent recalculation
- Rectangular cell range selection
- Ctrl/Cmd+C/V and toolbar Copy/Paste, including relative and absolute A1 reference shifting for internal copies
- Mouse drag fill handle (bottom-right of selection) with formula reference shifting; Ctrl/Cmd+D/R or toolbar Fill Down/Right
- Undo/redo (Ctrl/Cmd+Z/Y) for supported operations
- Bold, italic, text/background colors, horizontal alignment
- Horizontal cell merging in the grid, merge metadata on XLSX export
- XLSX import/export of basic values, formulas, and some formatting

## Known limitations — do not treat as Excel-compatible production software

- The custom formula-reference shifter is not a full Excel formula parser. Named ranges, structured references, external workbooks, spill formulas, locale syntax, and some quoted sheet references need more work.
- Vertical merged regions are **not visually merged** in AG Grid; XLSX export includes the merge region. Imported merges are not yet restored.
- Drag fill is wired to HyperFormula through AG Grid's fill handle, but needs browser verification; complex Excel formulas and edge cases may not shift correctly.
- Copy/paste of cell formatting, repeated paste over a larger destination, and cross-workbook formula shifting are incomplete.
- Undo history is limited to 15 snapshots; imports and large edits may be memory-intensive.
- Import reads only the first worksheet and at most 1,000 rows × 26 columns; some Excel cell types and formatting are not preserved.
- XLSX export writes the full grid and may be slow. Performance with 10,000 rows has not been validated.
- Formula and clipboard behavior needs automated tests and browser verification.

## License

HyperFormula is dual licensed. This demo uses `licenseKey: 'gpl-v3'`; assess GPLv3 obligations or obtain a commercial license before proprietary distribution or deployment. Your AG Grid Enterprise license is separate.

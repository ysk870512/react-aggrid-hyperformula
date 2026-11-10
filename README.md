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

## Formula editing (new)

- Select a cell and press `=` to enter the persistent formula editor.
- Type `=SU` to see suggestions such as `SUM` and `SUMIF`; use arrows and Tab or Enter to insert the selected function.
- After `=SUM(`, click another grid cell to insert its A1 reference without ending formula composition.
- Press Enter (with no autocomplete candidate) or Apply to save, Esc or Cancel to discard.
- Double-clicking a cell opens the persistent formula editor instead of AG Grid's native editor.

Function autocomplete is populated dynamically from `engine.getRegisteredFunctionNames()`, including built-in functions, aliases, and registered custom functions. Suggestions are filtered as you type and show up to 12 matches at a time. On newer HyperFormula releases, available descriptions are displayed using `getAvailableFunctions()`; on older 3.x releases, names remain available without descriptions. This lists functions registered with the engine, not every function in Microsoft Excel. Runtime and browser testing is still required.

## Troubleshooting

If the app fails to start, run `npm install` and `npm run build`, then share the first error from the terminal or browser console. A previous development-only issue was React StrictMode destroying the stateful HyperFormula engine during effect replay; the bootstrap no longer wraps the app in StrictMode.

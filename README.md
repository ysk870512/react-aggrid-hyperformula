# React + AG Grid 35.2.1 + HyperFormula

This project demonstrates **opt-in, per-column spreadsheet formulas** in a reusable React component.

## Usage

`src/App.tsx` is a UI-only demo. `src/AgGridFormula.tsx` contains the AG Grid + HyperFormula integration, formula bar, function autocomplete, cell-reference picking, and drag-fill logic.

```tsx
import AgGridFormula, { type FormulaColDef } from './AgGridFormula';

type Row = { product: string; quantity: number; price: number; amount: string | null };

const columnDefs: FormulaColDef<Row>[] = [
  { field: 'product', headerName: '상품' },
  { field: 'quantity', headerName: '수량' },
  { field: 'price', headerName: '단가' },
  { field: 'amount', headerName: '금액', formula: true },
];

<AgGridFormula rowData={rows} columnDefs={columnDefs} onDataChange={setRows} />;
```

Only `formula: true` columns use formula editing, computed value display, autocomplete and formula drag-fill. **Other columns remain normal AG Grid columns**, but their values are mirrored to HyperFormula so enabled columns can reference them. Column order determines A1 addresses: the first data row is row 1. Columns should have stable unique `field` names; remount the component with a different `key` if the schema changes.

## Fill handle

1. Select D1 containing `=B1*C1`.
2. Drag the small square at the lower-right of the selected cell down to D3.
3. D2 receives `=B2*C2` and D3 receives `=B3*C3`.

AG Grid's `cellSelection.handle.setFillValue` supplies the shifted **raw formula** via `params.useValue`. The enabled column's `valueSetter` persists it to the row object and HyperFormula. Non-formula columns suppress fill handles. Numeric/non-formula fill uses AG Grid defaults where applicable.

## Formula editing

Select a formula-enabled cell and press `=`, or double-click the cell. Type a function prefix such as `=SU` to see suggestions populated from HyperFormula's registered function names. Select suggestions using arrow keys and Tab/Enter. Click another cell while editing to insert its A1 address; press Enter to commit or Escape to cancel.

## Run

```bash
npm install
npm run dev
npm run build
```

Set `VITE_AG_GRID_LICENSE_KEY` in `.env` for your AG Grid Enterprise license. HyperFormula currently uses `licenseKey: 'gpl-v3'`; confirm GPL compatibility or acquire its commercial license before distributing proprietary code.

## Current limitations

This refactor focuses on the reusable formula-enabled grid and drag-fill. The prior demo's XLSX import/export, merge, formatting toolbar, and undo/redo are **not yet ported** to the new component. The example assumes the client-side row model, stable row order and flat fields; sorting, filtering, row insertion and complex Excel reference syntax need additional work. Build and browser validation have not yet been completed.

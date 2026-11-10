# React AG Grid + HyperFormula

React + TypeScript spreadsheet MVP using AG Grid 35.2.1 and HyperFormula as the sole formula engine.

## Run

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and set your AG Grid Enterprise license key.

## Features

- 1,000 rows, 26 columns
- Formula editing, SUM and dependent recalculation via HyperFormula
- Basic XLSX import and export using ExcelJS
- Formula bar

## Limitations

This is a starter MVP, not full Excel parity. Formula-aware copy/paste, drag-fill, merges, styling, multi-sheet support, undo/redo, and full Excel format fidelity are not yet implemented. The import truncates at 1,000 rows and 26 columns.

## License notes

HyperFormula uses GPLv3 configuration in this demo. Confirm GPLv3 compliance or obtain a commercial HyperFormula license before incorporating it into proprietary software. Never commit license keys.

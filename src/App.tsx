import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type CellValueChangedEvent, type ColDef, type CellFocusedEvent, type GridApi } from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import { HyperFormula } from 'hyperformula';
import ExcelJS from 'exceljs';

ModuleRegistry.registerModules([AllCommunityModule]);
const agLicense = import.meta.env.VITE_AG_GRID_LICENSE_KEY;
if (agLicense) LicenseManager.setLicenseKey(agLicense);
const ROWS = 1000;
const COLS = 26;
const colName = (n: number) => { let s = ''; for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + (x - 1) % 26) + s; return s; };
const initial = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => r === 0 ? ['제품', '수량', '단가', '금액'][c] ?? null : r === 1 ? ['안마의자', 2, 1500000, '=B2*C2'][c] ?? null : r === 2 ? ['마사지기', 3, 200000, '=B3*C3'][c] ?? null : r === 3 && c === 3 ? '=SUM(D2:D3)' : null));

type Row = { id: number; [key: string]: unknown };
const rows: Row[] = Array.from({ length: ROWS }, (_, id) => ({ id }));
export default function App() {
  const hf = useMemo(() => HyperFormula.buildFromArray(initial, { licenseKey: 'gpl-v3' }), []);
  const grid = useRef<AgGridReact<Row>>(null);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState({ row: 1, col: 0 });
  const [formula, setFormula] = useState('');
  const [status, setStatus] = useState('Ready');
  const columns = useMemo<ColDef<Row>[]>(() => Array.from({ length: COLS }, (_, c) => ({
    colId: String(c), headerName: colName(c), width: 130, editable: true,
    valueGetter: p => { if (!p.data) return ''; const v = hf.getCellValue({ sheet: 0, row: p.data.id, col: c }); return v === null ? '' : typeof v === 'object' ? String(v) : v; },
    valueSetter: p => { if (!p.data) return false; try { hf.setCellContents({ sheet: 0, row: p.data.id, col: c }, [[p.newValue ?? null]]); setRevision(x => x + 1); return true; } catch (e) { setStatus(String(e)); return false; } },
  })), [hf]);
  const raw = useCallback((row: number, col: number) => {
    const v = hf.getCellFormula({ sheet: 0, row, col });
    if (v !== undefined && v !== null) return v;
    const value = hf.getCellValue({ sheet: 0, row, col });
    return value === null ? '' : String(value);
  }, [hf]);
  useEffect(() => { setFormula(raw(active.row, active.col)); }, [active, revision, raw]);
  useEffect(() => { grid.current?.api.refreshCells({ force: true }); }, [revision]);
  useEffect(() => () => hf.destroy(), [hf]);
  const focus = useCallback((e: CellFocusedEvent<Row>) => {
    if (e.rowIndex === null || !e.column) return;
    const node = e.api.getDisplayedRowAtIndex(e.rowIndex);
    if (node?.data) setActive({ row: node.data.id, col: Number(e.column.getColId()) });
  }, []);
  const applyFormula = () => { try { hf.setCellContents({ sheet: 0, row: active.row, col: active.col }, [[formula || null]]); setRevision(x => x + 1); setStatus('Updated'); } catch (e) { setStatus(String(e)); } };
  const importFile = async (file: File) => {
    try {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0]; if (!ws) throw Error('No worksheet');
      const matrix: (string | number | boolean | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      ws.eachRow((row, r) => { if (r > ROWS) return; row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > COLS) return; const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v) matrix[r - 1][c - 1] = '=' + String(v.formula);
        else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') matrix[r - 1][c - 1] = v;
        else if (v instanceof Date) matrix[r - 1][c - 1] = v.toISOString().slice(0, 10);
      }); });
      hf.setSheetContent(0, matrix); setRevision(x => x + 1); setStatus('Imported: ' + file.name);
    } catch (e) { setStatus('Import failed: ' + String(e)); }
  };
  const exportFile = async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sheet1');
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const addr = { sheet: 0, row: r, col: c };
      const f = hf.getCellFormula(addr); const v = hf.getCellValue(addr);
      if (f) ws.getCell(r + 1, c + 1).value = { formula: f.slice(1), result: typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : undefined };
      else if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') ws.getCell(r + 1, c + 1).value = v;
    }
    const data = await wb.xlsx.writeBuffer(); const blob = new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'spreadsheet.xlsx'; a.click(); URL.revokeObjectURL(url);
  };
  return <main><header><h1>AG Grid + HyperFormula</h1><span>AG Grid 35.2.1 · 1,000 × 26 demo</span></header>
    <div className="toolbar"><label className="upload">Import XLSX<input type="file" accept=".xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}/></label><button onClick={() => void exportFile()}>Export XLSX</button><span className="status">{status}</span></div>
    <div className="formula"><strong>{colName(active.col)}{active.row + 1}</strong><label htmlFor="formula">fx</label><input id="formula" value={formula} onChange={e => setFormula(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFormula(); }}/><button onClick={applyFormula}>Apply</button></div>
    <div className="sheet"><AgGridReact<Row> ref={grid} rowData={rows} columnDefs={columns} getRowId={p => String(p.data.id)} rowNumbers={true} defaultColDef={{ resizable: true, sortable: false, filter: false }} onCellFocused={focus} onCellValueChanged={(_e: CellValueChangedEvent<Row>) => setStatus('Updated')} /></div>
    <footer>Enter formulas such as =SUM(D2:D3), =IF(B2&gt;1, C2*B2, 0). HyperFormula is the only calculation engine.</footer>
  </main>;
}

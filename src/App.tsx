import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { HyperFormula } from 'hyperformula';
import ExcelJS from 'exceljs';
import { shiftFormula } from './formulas';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
if (import.meta.env.VITE_AG_GRID_LICENSE_KEY) LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);

const ROWS = 1000, COLS = 26;
type Value = string | number | boolean | null;
type Pos = { row: number; col: number };
type Style = { bold?: boolean; italic?: boolean; color?: string; background?: string; align?: 'left' | 'center' | 'right'; format?: string };
type Merge = { row: number; col: number; height: number; width: number };
type Snapshot = { data: Value[][]; styles: [string, Style][]; merges: Merge[] };
type RowData = { id: number };
const key = (r: number, c: number) => r + ':' + c;
const name = (n: number) => { let out = ''; for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) out = String.fromCharCode(65 + (x - 1) % 26) + out; return out; };
const sample: Value[][] = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) =>
  r === 0 ? (['제품', '수량', '단가', '금액'][c] ?? null) :
  r === 1 ? (['안마의자', 2, 1500000, '=B2*C2'][c] ?? null) :
  r === 2 ? (['마사지기', 3, 200000, '=B3*C3'][c] ?? null) :
  r === 3 && c === 3 ? '=SUM(D2:D3)' : null
));
const rowData: RowData[] = Array.from({ length: ROWS }, (_, id) => ({ id }));

export default function App() {
  const engine = useMemo(() => HyperFormula.buildFromArray(sample, { licenseKey: 'gpl-v3' }), []);
  const grid = useRef<AgGridReact<RowData>>(null);
  const styles = useRef(new Map<string, Style>());
  const merges = useRef<Merge[]>([]);
  const undo = useRef<Snapshot[]>([]);
  const redo = useRef<Snapshot[]>([]);
  const fillInProgress = useRef(false);
  const fillOrigin = useRef<{top:number;bottom:number;left:number;right:number} | null>(null);
  const internalClipboard = useRef<{ origin: Pos; data: Value[][] } | null>(null);
  const [active, setActive] = useState<Pos>({ row: 1, col: 0 });
  const [formula, setFormula] = useState('');
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('Ready');
  const [styleRevision, setStyleRevision] = useState(0);

  const raw = useCallback((row: number, col: number): Value => {
    const address = { sheet: 0, row, col };
    const f = engine.getCellFormula(address);
    if (f) return f;
    const v = engine.getCellValue(address);
    return v === null || typeof v === 'object' ? null : v;
  }, [engine]);
  const snapshot = useCallback((): Snapshot => ({
    data: Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => raw(r, c))),
    styles: Array.from(styles.current.entries()).map(([k, v]) => [k, { ...v }]),
    merges: merges.current.map(m => ({ ...m }))
  }), [raw]);
  const checkpoint = useCallback(() => {
    undo.current.push(snapshot());
    if (undo.current.length > 15) undo.current.shift();
    redo.current = [];
  }, [snapshot]);
  const restore = useCallback((s: Snapshot) => {
    engine.setSheetContent(0, s.data);
    styles.current = new Map(s.styles);
    merges.current = s.merges;
    setRevision(x => x + 1); setStyleRevision(x => x + 1);
  }, [engine]);
  const undoAction = useCallback(() => {
    const s = undo.current.pop(); if (!s) return;
    redo.current.push(snapshot()); restore(s); setStatus('Undo');
  }, [snapshot, restore]);
  const redoAction = useCallback(() => {
    const s = redo.current.pop(); if (!s) return;
    undo.current.push(snapshot()); restore(s); setStatus('Redo');
  }, [snapshot, restore]);
  const setCell = useCallback((row: number, col: number, value: Value) => {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    engine.setCellContents({ sheet: 0, row, col }, [[value]]);
  }, [engine]);
  const update = useCallback(() => { setRevision(x => x + 1); setStyleRevision(x => x + 1); }, []);
  const selection = useCallback((): { top: number; left: number; bottom: number; right: number } => {
    const ranges = grid.current?.api.getCellRanges?.();
    const range = ranges?.[0];
    if (!range || !range.startRow || !range.endRow || !range.columns.length) return { top: active.row, bottom: active.row, left: active.col, right: active.col };
    const top = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
    const bottom = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
    const cs = range.columns.map(c => Number(c.getColId())).filter(Number.isFinite);
    return cs.length ? { top, bottom, left: Math.min(...cs), right: Math.max(...cs) } : { top: active.row, bottom: active.row, left: active.col, right: active.col };
  }, [active]);
  const copy = useCallback(async () => {
    const s = selection();
    const data = Array.from({ length: s.bottom - s.top + 1 }, (_, r) =>
      Array.from({ length: s.right - s.left + 1 }, (_, c) => raw(s.top + r, s.left + c)));
    internalClipboard.current = { origin: { row: s.top, col: s.left }, data };
    try { await navigator.clipboard.writeText(data.map(row => row.map(v => String(v ?? '')).join('\t')).join('\n')); } catch { /* browser permission: internal clipboard remains available */ }
    setStatus('Copied ' + data.length + ' row(s)');
  }, [selection, raw]);
  const paste = useCallback(async () => {
    const s = selection();
    let source = internalClipboard.current;
    try {
      const text = await navigator.clipboard.readText();
      const own = source?.data.map(row => row.map(v => String(v ?? '')).join('\t')).join('\n');
      if (text && text !== own) source = { origin: { row: s.top, col: s.left }, data: text.replace(/\r/g, '').split('\n').map(line => line.split('\t')) };
    } catch { /* use internal copy */ }
    if (!source) return;
    checkpoint();
    const { origin, data } = source;
    for (let r = 0; r < data.length; r++) for (let c = 0; c < data[r].length; c++) {
      const value = data[r][c];
      const shifted = typeof value === 'string' && value.startsWith('=') ? shiftFormula(value, s.top - origin.row, s.left - origin.col) : value;
      setCell(s.top + r, s.left + c, shifted);
    }
    update(); setStatus('Pasted');
  }, [selection, checkpoint, setCell, update]);
  const fill = useCallback((direction: 'down' | 'right') => {
    const s = selection(); checkpoint();
    if (direction === 'down') for (let r = s.top + 1; r <= s.bottom; r++) for (let c = s.left; c <= s.right; c++) {
      const source = raw(s.top, c);
      setCell(r, c, typeof source === 'string' ? shiftFormula(source, r - s.top, 0) : source);
    }
    if (direction === 'right') for (let c = s.left + 1; c <= s.right; c++) for (let r = s.top; r <= s.bottom; r++) {
      const source = raw(r, s.left);
      setCell(r, c, typeof source === 'string' ? shiftFormula(source, 0, c - s.left) : source);
    }
    update(); setStatus('Filled ' + direction);
  }, [selection, checkpoint, raw, setCell, update]);
  const format = useCallback((patch: Style) => {
    const s = selection(); checkpoint();
    for (let r = s.top; r <= s.bottom; r++) for (let c = s.left; c <= s.right; c++) {
      const k = key(r, c); styles.current.set(k, { ...styles.current.get(k), ...patch });
    }
    update();
  }, [selection, checkpoint, update]);
  const merge = useCallback(() => {
    const s = selection(); checkpoint();
    const width = s.right - s.left + 1, height = s.bottom - s.top + 1;
    if (width === 1 && height === 1) {
      merges.current = merges.current.filter(m => !(active.row >= m.row && active.row < m.row + m.height && active.col >= m.col && active.col < m.col + m.width));
      setStatus('Unmerged overlapping cell');
    } else {
      merges.current = merges.current.filter(m => m.row + m.height <= s.top || m.row > s.bottom || m.col + m.width <= s.left || m.col > s.right);
      merges.current.push({ row: s.top, col: s.left, width, height });
      // Excel-style merge keeps top-left value.
      for (let r = s.top; r <= s.bottom; r++) for (let c = s.left; c <= s.right; c++) if (r !== s.top || c !== s.left) setCell(r, c, null);
      setStatus('Merged region (horizontal span shown; vertical merge has visual limitations)');
    }
    update();
  }, [selection, active, checkpoint, setCell, update]);
  const fillSelection = useMemo(() => ({ handle: {
    mode: 'fill' as const,
    direction: 'xy' as const,
    suppressClearOnFillReduction: true,
    setFillValue: (p: { rowNode: { data?: RowData }; column: { getColId(): string }; direction: 'up' | 'down' | 'left' | 'right'; useValue(value: Value): unknown; useDefault(): unknown; skipCell(): unknown }) => {
      const original = fillOrigin.current;
      const row = p.rowNode.data?.id;
      const col = Number(p.column.getColId());
      if (!original || row === undefined || !Number.isFinite(col)) return p.useDefault();
      const height = original.bottom - original.top + 1;
      const width = original.right - original.left + 1;
      const wrap = (value: number, count: number) => ((value % count) + count) % count;
      const sourceRow = original.top + wrap(row - original.top, height);
      const sourceCol = original.left + wrap(col - original.left, width);
      const source = raw(sourceRow, sourceCol);
      if (typeof source === 'string' && source.startsWith('=')) {
        return p.useValue(shiftFormula(source, row - sourceRow, col - sourceCol));
      }
      // Preserve AG Grid's built-in numeric series generation.
      return p.useDefault();
    }
  } }), [raw]);
  const columns = useMemo<ColDef<RowData>[]>(() => Array.from({ length: COLS }, (_, c) => ({
    colId: String(c), headerName: name(c), width: 128, editable: true,
    valueGetter: p => {
      if (!p.data) return '';
      const v = engine.getCellValue({ sheet: 0, row: p.data.id, col: c });
      return v === null ? '' : typeof v === 'object' ? String(v) : v;
    },
    valueSetter: p => {
      if (!p.data) return false;
      try { if (!fillInProgress.current) checkpoint(); setCell(p.data.id, c, p.newValue ?? null); if (!fillInProgress.current) update(); return true; }
      catch (e) { setStatus(String(e)); return false; }
    },
    cellStyle: p => {
      const st = styles.current.get(key(p.data?.id ?? -1, c));
      return { fontWeight: st?.bold ? 'bold' : 'normal', fontStyle: st?.italic ? 'italic' : 'normal',
        color: st?.color || 'inherit', backgroundColor: st?.background || 'transparent',
        textAlign: st?.align || 'left' };
    },
    colSpan: p => {
      if (!p.data) return 1;
      const m = merges.current.find(m => m.row === p.data!.id && m.col === c);
      return m?.width ?? 1;
    }
  })), [engine, checkpoint, setCell, update, styleRevision]);
  useEffect(() => { setFormula(String(raw(active.row, active.col) ?? '')); }, [active, revision, raw]);
  useEffect(() => { grid.current?.api.refreshCells({ force: true }); }, [revision, styleRevision]);
  useEffect(() => () => engine.destroy(), [engine]);
  const applyFormula = () => { try { checkpoint(); setCell(active.row, active.col, formula || null); update(); } catch (e) { setStatus(String(e)); } };
  const importFile = async (file: File) => {
    try {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await file.arrayBuffer()) as any);
      const ws = wb.worksheets[0]; if (!ws) throw Error('Workbook contains no worksheets');
      const matrix: Value[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      const nextStyles = new Map<string, Style>();
      ws.eachRow((row, r) => {
        if (r > ROWS) return;
        row.eachCell({ includeEmpty: false }, (cell, c) => {
          if (c > COLS) return;
          const v = cell.value;
          if (v && typeof v === 'object' && 'formula' in v) matrix[r - 1][c - 1] = '=' + String(v.formula);
          else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') matrix[r - 1][c - 1] = v;
          else if (v instanceof Date) matrix[r - 1][c - 1] = v.toISOString().slice(0, 10);
          const font = cell.font, fill = cell.fill, alignment = cell.alignment;
          const st: Style = { bold: font?.bold, italic: font?.italic, align: alignment?.horizontal === 'center' ? 'center' : alignment?.horizontal === 'right' ? 'right' : 'left', format: cell.numFmt };
          if (font?.color?.argb) st.color = '#' + font.color.argb.slice(-6);
          if (fill?.type === 'pattern' && fill.fgColor?.argb) st.background = '#' + fill.fgColor.argb.slice(-6);
          nextStyles.set(key(r - 1, c - 1), st);
        });
      });
      checkpoint(); engine.setSheetContent(0, matrix); styles.current = nextStyles; merges.current = [];
      update(); setStatus('Imported ' + file.name + ' (first worksheet, max 1000×26)');
    } catch (e) { setStatus('Import failed: ' + String(e)); }
  };
  const exportFile = async () => {
    try {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sheet1');
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const value = raw(r, c), st = styles.current.get(key(r, c));
        if (value === null && !st) continue;
        const cell = ws.getCell(r + 1, c + 1);
        if (typeof value === 'string' && value.startsWith('=')) {
          const result = engine.getCellValue({ sheet: 0, row: r, col: c });
          cell.value = { formula: value.slice(1), result: typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean' ? result : undefined };
        } else cell.value = value;
        if (st) {
          cell.font = { bold: st.bold, italic: st.italic, color: st.color ? { argb: 'FF' + st.color.replace('#', '') } : undefined };
          if (st.background) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + st.background.replace('#', '') } };
          cell.alignment = { horizontal: st.align }; if (st.format) cell.numFmt = st.format;
        }
      }
      for (const m of merges.current) ws.mergeCells(m.row + 1, m.col + 1, m.row + m.height, m.col + m.width);
      const data = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = 'spreadsheet.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Exported XLSX');
    } catch (e) { setStatus('Export failed: ' + String(e)); }
  };
  const onKeyboard = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (['c', 'v', 'z', 'y', 'd', 'r'].includes(k)) {
      e.preventDefault(); e.stopPropagation();
      if (k === 'c') void copy();
      if (k === 'v') void paste();
      if (k === 'z') undoAction();
      if (k === 'y') redoAction();
      if (k === 'd') fill('down');
      if (k === 'r') fill('right');
    }
  };
  useEffect(() => { window.addEventListener('keydown', onKeyboard, true); return () => window.removeEventListener('keydown', onKeyboard, true); });
  return <main>
    <header><h1>Excel-like Grid</h1><span>AG Grid 35.2.1 · HyperFormula · 1,000 × 26</span></header>
    <div className="toolbar">
      <label className="upload">Import XLSX<input hidden type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} /></label>
      <button onClick={() => void exportFile()}>Export XLSX</button>
      <button onClick={() => void copy()}>Copy</button><button onClick={() => void paste()}>Paste</button>
      <button onClick={() => fill('down')}>Fill ↓</button><button onClick={() => fill('right')}>Fill →</button>
      <button onClick={undoAction}>Undo</button><button onClick={redoAction}>Redo</button>
    </div>
    <div className="toolbar">
      <button onClick={() => format({ bold: !styles.current.get(key(active.row, active.col))?.bold })}><b>B</b></button>
      <button onClick={() => format({ italic: !styles.current.get(key(active.row, active.col))?.italic })}><i>I</i></button>
      <button onClick={() => format({ align: 'left' })}>Left</button><button onClick={() => format({ align: 'center' })}>Center</button><button onClick={() => format({ align: 'right' })}>Right</button>
      <label>Text <input aria-label="Text color" type="color" onChange={e => format({ color: e.target.value })} /></label>
      <label>Fill <input aria-label="Background color" type="color" onChange={e => format({ background: e.target.value })} /></label>
      <button onClick={merge}>Merge / Unmerge</button>
      <span className="status">{status}</span>
    </div>
    <div className="formula"><strong>{name(active.col)}{active.row + 1}</strong><label htmlFor="formula">fx</label>
      <input id="formula" value={formula} onChange={e => setFormula(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFormula(); }} />
      <button onClick={applyFormula}>Apply</button></div>
    <div className="sheet"><AgGridReact<RowData> ref={grid} rowData={rowData} columnDefs={columns}
      getRowId={p => String(p.data.id)} cellSelection={fillSelection} suppressClipboardPaste={true}
      onFillStart={() => { checkpoint(); fillOrigin.current = selection(); fillInProgress.current = true; }}
      onFillEnd={() => { fillInProgress.current = false; fillOrigin.current = null; update(); setStatus('Mouse fill completed'); }}
      defaultColDef={{ resizable: true, sortable: false, filter: false }}
      onCellFocused={e => { if (e.rowIndex === null || !e.column) return; const node = e.api.getDisplayedRowAtIndex(e.rowIndex); if (node?.data) setActive({ row: node.data.id, col: Number(e.column.getColId()) }); }} /></div>
    <footer>Ctrl/Cmd+C/V copy and paste; Ctrl/Cmd+D/R fill down/right; Ctrl/Cmd+Z/Y undo/redo. Select a rectangular range first. Note: merged rows are exported to XLSX, but vertical merging is not fully represented in AG Grid.</footer>
  </main>;
}

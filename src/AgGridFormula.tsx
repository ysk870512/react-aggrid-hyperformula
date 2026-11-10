import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type CellSelectionOptions, type FillOperationParams } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { HyperFormula } from 'hyperformula';
import { shiftFormula } from './formulas';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
if (import.meta.env.VITE_AG_GRID_LICENSE_KEY) LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);

type CellValue = string | number | boolean | null;
type Pos = { row: number; col: number };
type Range = { top: number; bottom: number; left: number; right: number };
export type FormulaColDef<T extends object> = ColDef<T> & { formula?: boolean };
export type AgGridFormulaProps<T extends object> = {
  rowData: T[];
  columnDefs: FormulaColDef<T>[];
  height?: number | string;
  onDataChange?: (rows: T[]) => void;
};
const cell = (row: object, field: string): CellValue => {
  const value = (row as Record<string, unknown>)[field];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
};
const letters = (index: number) => {
  let out = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out;
  return out;
};
const address = (pos: Pos) => letters(pos.col) + (pos.row + 1);
const mod = (n: number, d: number) => ((n % d) + d) % d;

/** A reusable AG Grid with HyperFormula enabled only for columns declaring formula: true. */
export default function AgGridFormula<T extends object>({ rowData, columnDefs, height = 620, onDataChange }: AgGridFormulaProps<T>) {
  const fields = useMemo(() => columnDefs.map((c, i) => c.field ?? '__col_' + i), [columnDefs]);
  const enabled = useMemo(() => columnDefs.map(c => c.formula === true), [columnDefs]);
  const [rows, setRows] = useState<T[]>(() => rowData.map(r => ({ ...r })));
  const rowsRef = useRef(rows);
  const grid = useRef<AgGridReact<T>>(null);
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Pos>({ row: 0, col: 0 });
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const target = useRef<Pos>({ row: 0, col: 0 });
  const [caret, setCaret] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('Ready');
  const filling = useRef(false);
  const origin = useRef<{ range: Range; values: CellValue[][] } | null>(null);
  const matrix = useCallback((data: T[]) => data.map(row => fields.map((field, col) => {
    const value = cell(row, field);
    // Keep a leading equals sign literal for non-formula columns.
    return !enabled[col] && typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
  })), [fields, enabled]);
  // A new key on this component is required if the column schema changes.
  const engine = useMemo(() => HyperFormula.buildFromArray(matrix(rowData), { licenseKey: 'gpl-v3' }), []);
  const raw = useCallback((p: Pos) => {
    const row = rowsRef.current[p.row];
    return row ? cell(row, fields[p.col]) : null;
  }, [fields]);
  const publish = useCallback(() => {
    setRows([...rowsRef.current]);
    onDataChange?.(rowsRef.current.map(r => ({ ...r })));
    setRevision(v => v + 1);
  }, [onDataChange]);
  const write = useCallback((p: Pos, value: CellValue) => {
    const row = rowsRef.current[p.row];
    if (!row || !fields[p.col]) return;
    (row as Record<string, unknown>)[fields[p.col]] = value;
    engine.setCellContents({ sheet: 0, row: p.row, col: p.col }, [[
      !enabled[p.col] && typeof value === 'string' && value.startsWith('=') ? "'" + value : value
    ]]);
  }, [engine, fields, enabled]);
  useEffect(() => {
    rowsRef.current = rowData.map(r => ({ ...r }));
    setRows(rowsRef.current);
    engine.setSheetContent(0, matrix(rowsRef.current));
    setRevision(v => v + 1);
  }, [rowData, engine, matrix]);
  useEffect(() => { grid.current?.api.refreshCells({ force: true }); }, [revision]);
  useEffect(() => () => engine.destroy(), [engine]);
  const functionNames = useMemo(() => engine.getRegisteredFunctionNames().map(f => f.toUpperCase()).sort(), [engine]);
  const suggestions = useMemo(() => {
    if (!editing || !draft.startsWith('=')) return [];
    const token = draft.slice(0, caret).match(/(?:^|[^A-Za-z0-9_.])([A-Za-z][A-Za-z0-9_.]*)$/)?.[1]?.toUpperCase();
    return token ? functionNames.filter(f => f.startsWith(token) && f !== token).slice(0, 12) : [];
  }, [editing, draft, caret, functionNames]);
  const begin = useCallback((p: Pos, value: string) => {
    if (!enabled[p.col]) return;
    grid.current?.api.stopEditing(true);
    target.current = p;
    editingRef.current = true;
    setEditing(true);
    setDraft(value);
    setCaret(value.length);
    setSuggestionIndex(0);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(value.length, value.length); });
  }, [enabled]);
  const commit = () => {
    if (!editingRef.current) return;
    write(target.current, draft || null);
    editingRef.current = false;
    setEditing(false);
    publish();
    grid.current?.api.setFocusedCell(target.current.row, fields[target.current.col]);
    setStatus('Saved ' + address(target.current));
  };
  const cancel = () => { editingRef.current = false; setEditing(false); setDraft(String(raw(target.current) ?? '')); };
  const complete = (fn: string) => {
    const at = input.current?.selectionStart ?? caret;
    const token = draft.slice(0, at).match(/([A-Za-z][A-Za-z0-9_.]*)$/)?.[1];
    if (!token) return;
    const next = draft.slice(0, at - token.length) + fn + '(' + draft.slice(at);
    const position = at - token.length + fn.length + 1;
    setDraft(next); setCaret(position);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(position, position); });
  };
  const insertReference = (p: Pos) => {
    const start = input.current?.selectionStart ?? draft.length;
    const end = input.current?.selectionEnd ?? start;
    const ref = address(p);
    setDraft(draft.slice(0, start) + ref + draft.slice(end));
    setCaret(start + ref.length);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + ref.length, start + ref.length); });
  };
  const selection = useCallback((): Range => {
    const r = grid.current?.api.getCellRanges()?.[0];
    if (!r?.startRow || !r.endRow) return { top: active.row, bottom: active.row, left: active.col, right: active.col };
    const cols = r.columns.map(c => fields.indexOf(c.getColId())).filter(i => i >= 0);
    if (!cols.length) return { top: active.row, bottom: active.row, left: active.col, right: active.col };
    return { top: Math.min(r.startRow.rowIndex, r.endRow.rowIndex), bottom: Math.max(r.startRow.rowIndex, r.endRow.rowIndex), left: Math.min(...cols), right: Math.max(...cols) };
  }, [active, fields]);
  const cellSelection = useMemo<CellSelectionOptions<T>>(() => ({
    handle: {
      mode: 'fill', direction: 'xy', suppressClearOnFillReduction: true,
      setFillValue(params: FillOperationParams<T>) {
        const col = fields.indexOf(params.column.getColId());
        const row = params.rowNode.rowIndex;
        if (col < 0 || row === null || !enabled[col]) return params.skipCell();
        const source = origin.current;
        if (!source) return params.useDefault();
        const { range, values } = source;
        const sourceRow = range.top + mod(row - range.top, range.bottom - range.top + 1);
        const sourceCol = range.left + mod(col - range.left, range.right - range.left + 1);
        const value = values[sourceRow - range.top]?.[sourceCol - range.left];
        if (typeof value === 'string' && value.startsWith('=')) {
          return params.useValue(shiftFormula(value, row - sourceRow, col - sourceCol));
        }
        return params.useDefault();
      },
    },
  }), [fields, enabled]);
  const columns = useMemo<ColDef<T>[]>(() => columnDefs.map((def, col) => {
    const { formula, ...base } = def;
    const field = fields[col];
    if (!formula) return { ...base, colId: field, suppressFillHandle: true };
    return {
      ...base, field, colId: field, editable: true, cellDataType: false,
      valueGetter: p => {
        if (!p.data || p.node.rowIndex === null) return null;
        const value = engine.getCellValue({ sheet: 0, row: p.node.rowIndex, col });
        return value && typeof value === 'object' ? String(value) : value;
      },
      valueSetter: p => {
        if (p.node.rowIndex === null) return false;
        write({ row: p.node.rowIndex, col }, typeof p.newValue === 'object' ? null : p.newValue);
        if (!filling.current) publish();
        return true;
      },
    };
  }), [columnDefs, fields, engine, write, publish]);
  return <div className="formula-grid" onKeyDownCapture={e => {
    if (!editingRef.current && enabled[active.col] && e.key === '=' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault(); e.stopPropagation(); begin(active, '=');
    }
  }}>
    <div className="formula-editor">
      <div className="formula">
        <strong>{address(editing ? target.current : active)}</strong><label htmlFor="formula-input">fx</label>
        <input id="formula-input" ref={input} value={editing ? draft : String(raw(active) ?? '')}
          readOnly={!enabled[editing ? target.current.col : active.col]}
          onFocus={() => { if (!editingRef.current && enabled[active.col]) begin(active, String(raw(active) ?? '')); }}
          onChange={e => { setDraft(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setSuggestionIndex(0); }}
          onClick={e => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            else if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setSuggestionIndex(i => (i + 1) % suggestions.length); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length); }
            else if ((e.key === 'Tab' || e.key === 'Enter') && suggestions.length) { e.preventDefault(); complete(suggestions[suggestionIndex % suggestions.length]); }
            else if (e.key === 'Enter') { e.preventDefault(); commit(); }
          }} />
        <button disabled={!editing} onClick={commit}>Apply</button>
        {editing && <button onClick={cancel}>Cancel</button>}
      </div>
      {editing && suggestions.length > 0 && <div className="formula-suggestions" role="listbox">
        {suggestions.map((fn, i) => <button key={fn} role="option" aria-selected={i === suggestionIndex}
          className={i === suggestionIndex ? 'selected' : ''} onMouseDown={e => e.preventDefault()}
          onClick={() => complete(fn)}>{fn}(…)</button>)}
      </div>}
    </div>
    <div className="sheet" style={{ height }}>
      <AgGridReact<T> ref={grid} rowData={rows} columnDefs={columns}
        defaultColDef={{ resizable: true, editable: true, sortable: false, filter: false }}
        cellSelection={cellSelection} suppressClickEdit={true} suppressClipboardPaste={true}
        onCellFocused={e => {
          if (editingRef.current || e.rowIndex === null || !e.column) return;
          const col = fields.indexOf(e.column.getColId());
          if (col >= 0) setActive({ row: e.rowIndex, col });
        }}
        onCellClicked={e => {
          if (!editingRef.current || e.node.rowIndex === null) return;
          const col = fields.indexOf(e.column.getColId());
          if (col >= 0) insertReference({ row: e.node.rowIndex, col });
        }}
        onCellDoubleClicked={e => {
          if (e.node.rowIndex === null) return;
          const col = fields.indexOf(e.column.getColId());
          if (col < 0) return;
          if (enabled[col]) begin({ row: e.node.rowIndex, col }, String(raw({ row: e.node.rowIndex, col }) ?? ''));
          else e.api.startEditingCell({ rowIndex: e.node.rowIndex, colKey: fields[col] });
        }}
        onCellValueChanged={e => {
          const col = fields.indexOf(e.column.getColId());
          if (col < 0 || enabled[col] || e.node.rowIndex === null) return;
          write({ row: e.node.rowIndex, col }, typeof e.newValue === 'object' ? null : e.newValue);
          publish();
        }}
        onFillStart={() => {
          const range = selection();
          origin.current = { range, values: Array.from({ length: range.bottom - range.top + 1 }, (_, r) =>
            Array.from({ length: range.right - range.left + 1 }, (_, c) => raw({ row: range.top + r, col: range.left + c }))) };
          filling.current = true;
        }}
        onFillEnd={() => { filling.current = false; origin.current = null; publish(); setStatus('Fill completed'); }}
      />
    </div>
    <div className="formula-hint">formula: true 컬럼만 수식 입력·자동 채우기 지원 · = 입력 · 셀 클릭으로 참조 · 핸들 드래그 · {status}</div>
  </div>;
}

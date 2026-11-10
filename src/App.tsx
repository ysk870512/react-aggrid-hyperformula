import { useMemo, useState } from 'react';
import AgGridFormula, { type FormulaColDef } from './AgGridFormula';

type ProductRow = {
  product: string;
  quantity: number;
  price: number;
  amount: string | number | null;
  memo: string;
};

const initialRows: ProductRow[] = [
  { product: '안마의자', quantity: 2, price: 1500000, amount: '=B1*C1', memo: '일반 텍스트' },
  { product: '마사지기', quantity: 3, price: 200000, amount: '=B2*C2', memo: '수식 미지원' },
  { product: '온열기', quantity: 4, price: 120000, amount: null, memo: '드래그로 D3 채우기' },
  ...Array.from({ length: 97 }, (_, i) => ({
    product: '상품 ' + (i + 4), quantity: i + 1, price: 10000, amount: null, memo: '',
  })),
];

export default function App() {
  const [rows, setRows] = useState<ProductRow[]>(initialRows);
  const columns = useMemo<FormulaColDef<ProductRow>[]>(() => [
    { field: 'product', headerName: '상품명', width: 180 },
    { field: 'quantity', headerName: '수량', width: 120 },
    { field: 'price', headerName: '단가', width: 150 },
    { field: 'amount', headerName: '금액 (수식)', width: 190, formula: true },
    { field: 'memo', headerName: '비고 (일반)', width: 220 },
  ], []);

  return <main>
    <header><h1>AG Grid + HyperFormula</h1><span>컬럼별 수식 기능 선택 · AG Grid 35.2.1</span></header>
    <p>금액 컬럼에만 <code>formula: true</code>를 설정했습니다. 나머지는 일반 AG Grid 컬럼입니다.</p>
    <AgGridFormula<ProductRow> rowData={rows} columnDefs={columns} onDataChange={setRows} />
    <footer>D1 셀을 선택한 뒤 오른쪽 아래 채우기 핸들을 D3까지 드래그하면 상대 참조 수식이 복사됩니다.</footer>
  </main>;
}

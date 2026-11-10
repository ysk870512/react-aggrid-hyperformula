import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

// HyperFormula is a stateful engine. Do not destroy and reuse it during
// React StrictMode's development-only effect setup/cleanup replay.
createRoot(document.getElementById('root')!).render(<App />);

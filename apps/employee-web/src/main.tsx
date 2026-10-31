import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app.js';
import { listenForWindowFocus } from './app/window-focus.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root was not found');

listenForWindowFocus();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

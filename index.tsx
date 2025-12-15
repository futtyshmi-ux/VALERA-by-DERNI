
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './Valera-pre-pro-2-14-12-2025-main/Valera-pre-pro-2-main/App';
import WebApp from '@twa-dev/sdk';

// Initialize Telegram Web App SDK
// Wrapped in try-catch to ensure environment-agnostic behavior (won't crash in standard browsers)
try {
    WebApp.ready();
} catch (e) {
    console.warn("Telegram WebApp SDK initialization failed or running in browser mode:", e);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

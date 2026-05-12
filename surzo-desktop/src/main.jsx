import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Widget from './Widget.jsx';
import AlertOverlay from './AlertOverlay.jsx';
import './index.css';

// Sync theme class before first render to avoid flash
const _t = localStorage.getItem('surzo-theme') || 'dark';
if (_t === 'dark') document.documentElement.classList.add('dark');

const hash = window.location.hash;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {hash === '#widget'  ? <Widget /> :
     hash === '#overlay' ? <AlertOverlay /> :
     <App />}
  </React.StrictMode>
);

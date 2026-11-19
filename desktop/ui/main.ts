import { App } from './app.js';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app') || document.body;
  const app = new App(container);
  app.start().catch((err) => {
    console.error('Fatal desktop application initialization error:', err);
  });
});

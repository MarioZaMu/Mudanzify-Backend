import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { app } from 'electron';

// Secrets (e.g. the AI API key) live in `.env`, never in the source code.
loadDotenv({ path: path.join(app.getAppPath(), '.env'), quiet: true });

/** True when the frontend is served by its Vite dev server. */
export const isDev = process.env.MUDANZIFY_DEV === '1';

/** URL of the frontend dev server (mudanzify-frontend `npm run dev`). */
export const frontendDevUrl = process.env.FRONTEND_DEV_URL ?? 'http://localhost:5173';

/** Built frontend copied into this repo by `npm run renderer:copy`. */
export const rendererIndexPath = path.join(app.getAppPath(), 'renderer', 'index.html');

export const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');

export const appIconPath = path.join(app.getAppPath(), 'build', 'icon.png');

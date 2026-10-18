# Mudanzify · Backend

Backend de escritorio de **Mudanzify**, el sistema de traspaso inteligente de datos asistido por IA.
Este repositorio contiene el proceso principal de Electron, el script `preload` y la comunicación IPC.
La interfaz vive en [Mudanzify-Frontend](https://github.com/MarioZaMu/Mudanzify-Frontend).

## Arquitectura

```
mudanzify-backend/            mudanzify-frontend/
├── src/main      ◄── IPC ──► src/ (React + Tailwind)
├── src/preload   (puente seguro: window.mudanzify)
└── src/shared    (contrato IPC, se sincroniza al frontend)
```

- `src/main`: ventana, ciclo de vida de la app y manejadores IPC. Aquí irán el acceso al sistema de archivos y las llamadas a la IA.
- `src/preload`: expone solo funciones explícitas al renderer mediante `contextBridge`.
- `src/shared/contract.ts`: fuente única de verdad de los canales y tipos IPC.
- Preferencias del usuario (por ahora, el tema claro/oscuro/sistema) en `settings.json` dentro de la carpeta de datos de la app (`%APPDATA%/mudanzify-backend`).

Seguridad: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, navegación bloqueada,
validación del origen de cada llamada IPC y CSP estricta en producción.

## Requisitos

- Node.js 22 o superior (probado con 24).
- Ambos repositorios clonados como carpetas hermanas:

```
Mudanzify/
├── mudanzify-backend/
└── mudanzify-frontend/
```

## Instalación

```bash
npm install
cp .env.example .env
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev:all` | Levanta el frontend (Vite) y abre Electron apuntando a él. |
| `npm run dev` | Solo abre Electron; espera a que el frontend esté en `localhost:5173`. |
| `npm start` | Abre Electron con el frontend compilado en `renderer/`. |
| `npm run renderer:build` | Compila el frontend. |
| `npm run renderer:copy` | Copia `mudanzify-frontend/dist` a `renderer/`. |
| `npm run typecheck` | Verifica tipos con TypeScript. |
| `npm run dist` | Compila todo y genera el instalador en `release/`. |

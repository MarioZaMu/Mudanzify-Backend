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
- Preferencias del usuario (tema claro/oscuro/sistema, presentación vista y rol emisor/receptor) en `settings.json` dentro de la carpeta de datos de la app (`%APPDATA%/mudanzify-backend`).
- `src/main/transfers`: traspasos guardados como JSON en `transfers/<id>.json` (escritura atómica). Las rutas solo llegan desde diálogos nativos, nunca desde la interfaz.
- `src/main/inventory`: lectura **de solo lectura** del origen: categorías por extensión, archivos ocultos/temporales/vacíos y perfil de tablas CSV (con detección de separador y codificación) y Excel (ExcelJS).
- `src/main/ai`: entrevista guiada con **Google Gemini** (`@google/genai`, salida estructurada con *function calling*). A la IA solo se envía un resumen del inventario (cantidades, tipos de archivo y nombres de columnas), nunca contenidos, nombres de archivo ni rutas. Todo lo que devuelve el modelo se valida y recorta. Sin `GEMINI_API_KEY` funciona en **modo demo** con preguntas simuladas adaptadas al inventario.
- `src/main/interview`: estado de la entrevista (preguntando → revisando → lista) guardado dentro del traspaso; cada criterio se acepta, edita o rechaza por separado.
- `src/main/analysis`: revisión de la fase 6. La **detección ocurre en el equipo** y en solo lectura: archivos idénticos (SHA-256, solo entre archivos del mismo tamaño), filas repetidas, celdas vacías, columnas con datos personales (correo, teléfono, documento, tarjeta con Luhn; los ejemplos se guardan enmascarados) y archivos temporales/ocultos/vacíos. Las sugerencias siguen los criterios de la entrevista. Después la IA (o el modo demo) propone cómo **unificar columnas** y el **orden de las cajas**, recibiendo solo cantidades y nombres de columnas con tablas anónimas (`T1`, `T2`…); su respuesta se valida contra las columnas reales. Ninguna acción mueve datos.
- `src/main/execution`: plan y copia de la fase 7. El plan sale de la revisión confirmada (duplicados y archivos basura fuera, tablas con cambios). La copia **nunca toca el origen** ni sobrescribe: crea una carpeta nueva en el destino, copia con `COPYFILE_EXCL` y verifica cada archivo (tamaño y SHA-256). Las tablas se escriben ya enmascaradas, sin filas repetidas y con las columnas unificadas (CSV en UTF-8; Excel editado con ExcelJS conservando formato). Al terminar (o al cancelar) se guarda `Informe de Mudanzify.html` en la carpeta, sin valores de las tablas.
- `src/main/receptions`: recepción de la fase 8. La copia lleva `mudanzify.json` (manifiesto con cada archivo, su caja, tamaño y SHA-256, los cambios hechos a las tablas y los criterios del emisor). El receptor elige la carpeta en un diálogo nativo; el manifiesto se valida como **entrada no confiable** (rutas relativas dentro de la carpeta, límites de tamaño). La verificación **solo lee**: recalcula cada huella (idéntico, cambió, falta o mismo tamaño en archivos muy grandes) y detecta archivos que no estaban en el envío. Cada caja se acepta o se reporta con un comentario; al confirmar se escribe `Acuse de recibo.html` en la carpeta. Las recepciones se guardan en `receptions/<id>.json`.
- `samples/mudanza-demo`: datos ficticios para probar el inventario (vacíos, duplicados, temporales, CSV en Windows-1252).

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

Para usar la IA real (gratis, sin tarjeta), sigue la guía [docs/configurar-gemini.md](docs/configurar-gemini.md):
crea una clave en Google AI Studio y ponla en `.env` como `GEMINI_API_KEY=...`.
El archivo `.env` está en `.gitignore` y nunca se sube al repositorio. Sin clave, la entrevista funciona en modo demo.

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

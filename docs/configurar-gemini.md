# Configurar la IA (Google Gemini, gratis)

Mudanzify usa **Google Gemini** para la entrevista guiada. La capa gratuita no pide tarjeta.
Sin clave, la app funciona igual en **modo demo** (preguntas simuladas) y lo indica con una insignia ámbar.

## 1. Crear la API key (una sola vez)

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Si es la primera vez, acepta los términos de Google AI Studio.
3. Pulsa **Create API key** (Crear clave de API). Si te pide un proyecto, elige el que crea por defecto.
4. Copia la clave. Empieza con `AIza…`.
5. **No actives la facturación** (*billing*). Mientras no la actives, todo es gratis: si llegas al límite,
   Gemini solo responde "espera" y nunca te cobra.

## 2. Ponerla en Mudanzify

1. En la carpeta `mudanzify-backend`, crea el archivo `.env` a partir del ejemplo (en PowerShell):

   ```powershell
   Copy-Item C:/Users/MARIO/Desktop/Mudanzify/mudanzify-backend/.env.example C:/Users/MARIO/Desktop/Mudanzify/mudanzify-backend/.env
   ```

2. Abre `.env` con el Bloc de notas o VS Code y completa la línea, sin comillas ni espacios:

   ```
   GEMINI_API_KEY=AIzaTuClaveAqui
   ```

3. Guarda el archivo y reinicia la app (Ctrl+C en la terminal y vuelve a lanzarla):

   ```powershell
   npm --prefix C:/Users/MARIO/Desktop/Mudanzify/mudanzify-backend run dev:all
   ```

4. En la entrevista, la insignia debe decir **"IA conectada · gemini-3.5-flash-lite"** (en índigo).

## 3. Cosas que conviene saber

- **El `.env` nunca se sube a GitHub** (está en `.gitignore`).
  Al generar el instalador con `npm run dist`, si `GEMINI_API_KEY` está en tu `.env`, se copia a `build/ai.key`
  (también ignorado por git) y el `.exe` la lleva dentro: la app instalada en otra PC ya trae IA, sin configurar nada.
  Sin clave en `.env`, el instalador queda en modo demo.
- **Reparte ese instalador en privado** (USB, nube, enlace tuyo). Quien tenga el `.exe` puede extraer la clave.
  Usa una clave solo para la presentación, restringida a la API de Gemini, y bórrala o rótala al terminar.
  No subas ese `.exe` a un Release público.
- **Límites gratuitos**: Google limita las solicitudes por minuto y por día, y a veces cambia esas cifras.
  Puedes ver tus límites actuales en AI Studio. Una entrevista usa unas 4 a 7 solicitudes.
  Si llegas al límite, la app muestra: *"Llegaste al límite gratuito de Gemini por ahora…"*. Espera y vuelve a intentar.
- **Privacidad**: en la capa gratuita Google puede usar lo que se envía para mejorar sus productos.
  Mudanzify solo envía un resumen (cantidades, tipos de archivo y nombres de columnas), nunca el contenido
  de tus archivos, sus nombres ni sus rutas.
- **Cambiar de modelo** (opcional): agrega `GEMINI_MODEL=otro-modelo` al `.env`. Por defecto se usa
  `gemini-3.5-flash-lite`, el que tiene la cuota gratuita más amplia. Si Google retira ese modelo en el futuro,
  basta con poner aquí el nombre del nuevo (la lista está en <https://ai.google.dev/gemini-api/docs/models>).

## 4. Si algo falla

| Mensaje en la app | Qué hacer |
|---|---|
| *Gemini rechazó la API key* | Revisa que la clave esté completa en `.env`, sin comillas ni espacios, y reinicia la app. |
| *Llegaste al límite gratuito* | Espera un minuto, o hasta el día siguiente si fue el límite diario. |
| *La IA no respondió* | Revisa tu conexión a internet. Si sigue fallando, prueba otro modelo con `GEMINI_MODEL`. |
| La insignia sigue diciendo "Modo demo" | El `.env` no está en `mudanzify-backend` o la línea no se llama exactamente `GEMINI_API_KEY`. Reinicia la app. |
| Se filtró la clave (por ejemplo, la subiste por error) | En AI Studio, bórrala y crea otra nueva. |

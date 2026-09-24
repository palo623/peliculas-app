# CineAIros

Aplicación web para descubrir, buscar y guardar películas y series. El catálogo público se almacena en Firestore; la API de OMDb se utiliza únicamente para cargar y mantener ese catálogo mediante scripts administrativos.

## Índice

- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Flujos principales](#flujos-principales)
- [Configuración](#configuración)
- [Ejecución](#ejecución)
- [API del backend](#api-del-backend)
- [Scripts administrativos](#scripts-administrativos)
- [Modelo de datos](#modelo-de-datos)
- [Seguridad y límites conocidos](#seguridad-y-límites-conocidos)

## Arquitectura

El proyecto utiliza una arquitectura monolítica sencilla:

```text
Navegador
	|
	| HTTP / JSON
	v
Express (server.js)
	|
	+--> Rutas de películas ------> MovieModel ------> Firestore (movies)
	|
	+--> Rutas de series --------> SeriesModel ------> Firestore (series)
	|
	+--> Rutas de autenticación -> AuthService ------> Firestore (users/sessions)
	|                                  |
	|                                  +------------> Firebase Authentication Admin
	|
	+--> Archivos estáticos de public/
```

El frontend no está compilado. `public/js/bundle.js` se ejecuta directamente en el navegador y utiliza React mediante CDN. El backend sirve simultáneamente la aplicación web y la API REST.

La aplicación web consulta películas y series únicamente desde Firestore. OMDb no participa en las búsquedas del usuario ni en “Popular ahora”; solo se consulta desde `scripts/seedRandomMovies.js` y `scripts/seedRandomSeries.js` para poblar los catálogos.

## Stack tecnológico

### Frontend

- HTML5 y CSS3.
- JavaScript plano, sin Babel ni bundler.
- React 18 y ReactDOM cargados desde CDN.
- Firebase Authentication Web SDK en formato compat.
- `fetch` para comunicarse con el backend.

### Backend

- Node.js 18 o superior.
- Express 4.
- `cors` para permitir peticiones HTTP.
- `firebase-admin` para Firestore y la verificación de tokens Firebase.
- API nativa `fetch` de Node para OMDb.

### Servicios externos

- Firebase Authentication: registro, login, Google, verificación de correo y recuperación de contraseña.
- Cloud Firestore: usuarios, sesiones, catálogo de películas, catálogo de series y colecciones personales.
- OMDb API: fuente administrativa para importar películas.

## Estructura del proyecto

```text
.
|-- server.js                    # Arranque de Express, .env, middleware y SPA.
|-- package.json                 # Dependencias y comandos npm.
|-- package-lock.json            # Versiones exactas de dependencias.
|-- .env.example                 # Plantilla de configuración local.
|-- firebase-key.json            # Credencial Admin local, ignorada por Git.
|-- public/
|   |-- index.html               # Documento HTML y carga de CDNs.
|   |-- css/style.css            # Estilos de la interfaz.
|   `-- js/bundle.js             # Componentes React y lógica del navegador.
|-- src-backend/
|   |-- models/firebase.js       # Inicialización de Firebase Admin.
|   |-- models/movieModel.js     # Acceso a películas y catálogo Firestore.
|   |-- models/seriesModel.js    # Acceso a series y catálogo Firestore.
|   |-- routes/movieRoutes.js    # API de catálogo y colección personal.
|   |-- routes/seriesRoutes.js   # API de catálogo y colección personal de series.
|   |-- routes/authRoutes.js     # API de sincronización y sesión.
|   `-- services/
|       |-- authService.js       # Verificación Firebase y sesiones técnicas.
|       `-- omdbService.js       # Cliente OMDb usado por scripts.
`-- scripts/
    |-- migrateDatabase.js           # Migración de documentos antiguos.
    |-- migrateSeriesToCollection.js # Mueve series de movies a su colección propia.
    |-- enrichSeriesSeasons.js       # Añade temporadas/episodios desde OMDb.
    |-- deleteAllMovies.js           # Borrado controlado de movies.
    |-- seedRandomMovies.js          # Importación aleatoria desde OMDb.
    `-- seedRandomSeries.js          # Importación aleatoria de series desde OMDb.
```

## Flujos principales

### Registro con email y contraseña

1. El frontend llama a `createUserWithEmailAndPassword` de Firebase.
2. Firebase crea el usuario en `Authentication > Users`.
3. La aplicación envía un correo mediante `sendEmailVerification`.
4. No se crea la sesión propia mientras el correo no esté verificado.
5. Tras confirmar el correo, el usuario pulsa “Ya he verificado mi correo”.
6. El frontend obtiene el ID token y lo envía a `/api/auth/firebase`.
7. El backend verifica el token con Firebase Admin y sincroniza el perfil en Firestore.
8. Si `onboardingDone` es falso, se muestra el cuestionario.
9. Al terminar el cuestionario, el usuario accede a películas.

### Login con email o Google

Firebase Authentication realiza el login. Después, el frontend envía el ID token al backend para crear una sesión técnica propia.

Si el usuario todavía no tiene `onboardingDone: true`, se abre el cuestionario. Esto se aplica tanto al login con Google como al login con email y también cuando se restaura una sesión después de recargar la página.

### Recuperación de contraseña

1. El usuario introduce su email en “Recuperar contraseña”.
2. Firebase envía el enlace con `sendPasswordResetEmail`.
3. El enlace vuelve a la aplicación con un `oobCode`.
4. El frontend valida el código con `verifyPasswordResetCode`.
5. Firebase actualiza la contraseña con `confirmPasswordReset`.

El backend no almacena tokens propios de recuperación ni contraseñas.

### Catálogo de películas y series

El buscador, la portada y “Popular ahora” leen Firestore. Las películas viven en la colección `movies` y las series en la colección `series`. En ambas, el campo `userId` permite separar la colección personal del catálogo público.

## Configuración

### Variables de entorno

Copia `.env.example` a `.env` y completa los valores. No subas `.env`, `firebase-key.json` ni claves privadas al repositorio.

```env
PORT=8080
OMDB_API_KEY=tu_clave_de_omdb

# Firebase Admin: backend y scripts
FIREBASE_PROJECT_ID=tu_project_id
FIREBASE_CLIENT_EMAIL=tu_service_account@tu_project_id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase Web: navegador y Firebase Authentication
FIREBASE_API_KEY=tu_web_api_key
FIREBASE_AUTH_DOMAIN=tu_project_id.firebaseapp.com
FIREBASE_STORAGE_BUCKET=tu_project_id.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
FIREBASE_APP_ID=tu_app_id
```

La configuración Web se obtiene en Firebase Console, dentro de `Configuración del proyecto > Tus aplicaciones > App web > Config`. La configuración Admin es distinta y no debe sustituirse por la Web.

### Firebase Console

Activa lo siguiente:

1. `Authentication > Sign-in method > Email/Password`.
2. Google, si se quiere permitir login con Google.
3. `Authentication > Settings > Authorized domains` con `localhost` y el dominio de producción.
4. Firestore Database en el proyecto correcto.

## Ejecución

Instala las dependencias:

```powershell
npm install
```

Inicia el servidor:

```powershell
npm start
```

En PowerShell, si Node está instalado en una carpeta que no está en `PATH`, puede ejecutarse así:

```powershell
$env:PATH = "C:\ruta\a\node;" + $env:PATH
cmd /c "npm.cmd start"
```

Abre `http://localhost:8080`. El modo desarrollo usa:

```powershell
npm run dev
```

## API del backend

Todas las rutas están montadas bajo `/api`.

### Catálogo público

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/movies/health` | Comprueba conexión de Firestore. |
| `GET` | `/api/movies/search?t=...&y=...` | Busca una película exacta en Firestore. |
| `GET` | `/api/movies/search-list?s=...&page=...&y=...` | Lista coincidencias del catálogo Firestore. |
| `GET` | `/api/movies/popular?limit=12&y=...` | Devuelve una muestra aleatoria de Firestore. |
| `GET` | `/api/series/health` | Comprueba conexión de Firestore. |
| `GET` | `/api/series/search?t=...&y=...` | Busca una serie exacta en Firestore. |
| `GET` | `/api/series/search-list?s=...&page=...&y=...` | Lista coincidencias del catálogo de series. |
| `GET` | `/api/series/popular?limit=12&y=...` | Devuelve una muestra aleatoria de series. |

Si la colección `movies` o `series` está vacía, el buscador y “Popular ahora” no obtienen resultados. Estas rutas no consultan OMDb.

### Sesión y colecciones personales

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/auth/firebase` | Verifica un ID token Firebase y crea sesión técnica. |
| `GET` | `/api/auth/me` | Devuelve el usuario de la sesión técnica. |
| `POST` | `/api/auth/logout` | Elimina la sesión técnica. |
| `PUT` | `/api/auth/prefs` | Guarda las preferencias del cuestionario. |
| `GET` | `/api/movies` | Lista películas guardadas por el usuario autenticado. |
| `POST` | `/api/movies` | Guarda una película en la colección personal. |
| `GET` | `/api/movies/:id` | Obtiene una película personal. |
| `DELETE` | `/api/movies/:id` | Elimina una película personal. |
| `GET` | `/api/series` | Lista series guardadas por el usuario autenticado. |
| `POST` | `/api/series` | Guarda una serie en la colección personal. |
| `GET` | `/api/series/:id` | Obtiene una serie personal. |
| `DELETE` | `/api/series/:id` | Elimina una serie personal. |

Las rutas privadas reciben el token propio en:

```text
Authorization: Bearer <token>
```

## Scripts administrativos

Los scripts usan Firebase Admin y deben ejecutarse desde la raíz del proyecto.

### Migrar datos antiguos

```powershell
node scripts/migrateDatabase.js
```

Completa preferencias de usuarios antiguos y normaliza documentos de películas que no tengan `type` o `title`. No crea usuarios en Firebase Authentication.

### Vaciar películas

Simulación:

```powershell
node scripts/deleteAllMovies.js --confirm --dry-run
```

Borrado real:

```powershell
node scripts/deleteAllMovies.js --confirm
```

Cuenta los documentos y borra toda la colección `movies` por lotes. No toca `series`, `users`, `sessions` ni Firebase Authentication.

### Poblar el catálogo de películas

```powershell
node scripts/seedRandomMovies.js --count=400
```

Añade películas aleatorias desde OMDb sin borrar las existentes. Evita duplicados por `imdbID`, procesa las peticiones progresivamente y se detiene si OMDb alcanza el límite. Para una simulación:

```powershell
node scripts/seedRandomMovies.js --count=400 --dry-run
```

Por defecto utiliza `catalog-seed` como `userId`, lo que permite que las películas formen parte del catálogo público sin aparecer en la colección personal de un usuario. Se puede indicar otro propietario con:

```powershell
node scripts/seedRandomMovies.js --count=400 --userId=usuario@example.com
```

### Poblar el catálogo de series

```powershell
node scripts/seedRandomSeries.js --count=200
```

Añade series aleatorias desde OMDb a la colección `series` sin borrar las existentes. Acepta los mismos parámetros que el de películas (`--count`, `--dry-run`, `--userId`).

### Separar las series en su propia colección

```powershell
node scripts/migrateSeriesToCollection.js --dry-run
node scripts/migrateSeriesToCollection.js
```

Mueve los documentos con `type: "series"` desde la colección `movies` a la colección `series`, conservando sus IDs y sin tocar las películas.

### Añadir temporadas y episodios

```powershell
node scripts/enrichSeriesSeasons.js --limit=30
node scripts/enrichSeriesSeasons.js --limit=30 --dry-run
node scripts/enrichSeriesSeasons.js --ids=tt0944947,tt4574334
```

Rellena `totalSeasons` y `seasons[]` de cada serie del catálogo consultando OMDb temporada a temporada. Como OMDb Free tiene cuota diaria, se recomienda procesar en tandas con `--limit`. Ignora las series ya enriquecidas y actualiza también las copias guardadas por usuarios.

## Modelo de datos

### `users/{email}`

```text
id
name
email
provider
firebaseUid
photoURL
emailVerified
prefs.favoriteGenres[]
prefs.likesMovies
prefs.onboardingDone
createdAt
```

### `movies/{movieId}`

```text
title
year
type: "movie"
imdbID
poster
director
genre
plot
actors
runtime
rating
userId
createdAt
```

El ID de una película guardada combina título, año y propietario. Así varios usuarios pueden guardar la misma película sin compartir el documento personal.

### `series/{seriesId}`

```text
title
year
type: "series"
imdbID
poster
director
genre
plot
actors
runtime
rating
totalSeasons     # nº total de temporadas (OMDb)
seasons[]        # [{ season: 1, episodes: 11 }, ...]
dateEnriched     # cuándo se rellenaron las temporadas
userId
createdAt
```

Al igual que `movies`, combina el catálogo público (`userId: "catalog-seed"`) con las colecciones personales de cada usuario. El ID combina título, año y propietario. Los campos de temporadas se rellenan con el script de enriquecimiento para no consumir cuota de OMDb durante el uso normal de la web.

### `sessions/{token}`

```text
userId
createdAt
expiresAt
```

Son sesiones técnicas del backend, independientes de la sesión interna que mantiene Firebase Authentication en el navegador.

## Seguridad y límites conocidos

- `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` y `.env` son secretos; no deben exponerse en el frontend ni subirse a Git.
- `FIREBASE_API_KEY` pertenece a la configuración Web y puede aparecer en el navegador; aun así deben configurarse correctamente los dominios autorizados y los proveedores de login.
- La autorización real de las operaciones privadas se hace en el backend mediante la sesión técnica.
- El catálogo público se lee desde Firestore y está limitado a un número máximo de documentos por consulta para controlar costes.
- El buscador realiza coincidencias en memoria después de leer el catálogo; para catálogos mucho mayores convendría añadir índices o un motor de búsqueda.
- OMDb tiene cuota y límites de peticiones. Por eso la carga se hace mediante scripts progresivos y no durante las búsquedas normales.
- `firebase-key.json` está incluido en `.gitignore`; debe mantenerse fuera del control de versiones.
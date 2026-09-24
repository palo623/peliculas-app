# CineAIros

Aplicación web para descubrir, buscar y guardar películas. El catálogo público se almacena en Firestore; la API de OMDb se utiliza únicamente para cargar y mantener ese catálogo mediante scripts administrativos.

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
	+--> Rutas de películas ------> MovieModel ------> Firestore
	|
	+--> Rutas de autenticación -> AuthService -----> Firestore
	|                                  |
	|                                  +------------> Firebase Authentication Admin
	|
	+--> Archivos estáticos de public/
```

El frontend no está compilado. `public/js/bundle.js` se ejecuta directamente en el navegador y utiliza React mediante CDN. El backend sirve simultáneamente la aplicación web y la API REST.

La aplicación web consulta películas únicamente desde Firestore. OMDb no participa en las búsquedas del usuario ni en “Popular ahora”; solo se consulta desde `scripts/seedRandomMovies.js` para poblar el catálogo.

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
- Cloud Firestore: usuarios, sesiones, catálogo y películas guardadas.
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
|   |-- routes/movieRoutes.js    # API de catálogo y colección personal.
|   |-- routes/authRoutes.js     # API de sincronización y sesión.
|   `-- services/
|       |-- authService.js       # Verificación Firebase y sesiones técnicas.
|       `-- omdbService.js       # Cliente OMDb usado por scripts.
`-- scripts/
		|-- migrateDatabase.js       # Migración de documentos antiguos.
		|-- deleteAllMovies.js       # Borrado controlado de movies.
		`-- seedRandomMovies.js      # Importación aleatoria desde OMDb.
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

### Catálogo de películas

El buscador, la portada y “Popular ahora” leen Firestore. La colección `movies` contiene tanto las películas del catálogo como las películas guardadas por usuarios; `userId` permite separar la colección personal del catálogo público.

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

Si la colección `movies` está vacía, el buscador y “Popular ahora” no obtienen resultados. Estas rutas no consultan OMDb.

### Sesión y colección personal

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

### Amistades

Todas requieren `Authorization: Bearer <token>`. La información privada de otro
usuario solo se devuelve si existe una amistad aceptada (o es el propio usuario).

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/users/search?q=...` | Busca usuarios por nombre o email para añadir amigos. |
| `POST` | `/api/friends/requests` | Envía una solicitud (`{ to: "email" }`). |
| `GET` | `/api/friends/requests/received` | Solicitudes pendientes recibidas. |
| `GET` | `/api/friends/requests/sent` | Solicitudes pendientes enviadas. |
| `POST` | `/api/friends/requests/:id/accept` | Acepta una solicitud (solo el destinatario). |
| `POST` | `/api/friends/requests/:id/reject` | Rechaza una solicitud (solo el destinatario). |
| `DELETE` | `/api/friends/requests/:id` | Cancela una solicitud enviada. |
| `GET` | `/api/friends` | Lista de amigos del usuario autenticado. |
| `DELETE` | `/api/friends/:friendId` | Elimina a un amigo. |
| `GET` | `/api/friends/:friendId/profile` | Perfil visible para amigos, con Top 5 y contadores. |
| `GET` | `/api/friends/:friendId/full-profile` | Perfil completo: usuario + Top 5 + películas y series guardadas. |
| `GET` | `/api/friends/:friendId/movies` | Películas guardadas del amigo. |
| `GET` | `/api/friends/:friendId/series` | Series guardadas del amigo. |
| `GET` | `/api/users/me/top5` | Top 5 propio. |
| `PUT` | `/api/users/me/top5` | Guarda el Top 5 (`{ top5: [...] }`, máx. 5 referencias). |

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

Cuenta los documentos y borra toda la colección `movies` por lotes. No toca `users`, `sessions` ni Firebase Authentication.

### Poblar el catálogo

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

### `sessions/{token}`

```text
userId
createdAt
expiresAt
```

Son sesiones técnicas del backend, independientes de la sesión interna que mantiene Firebase Authentication en el navegador.

### `friendships/{from__to}`

```text
from        # email del remitente (minúsculas)
to          # email del destinatario (minúsculas)
status      # "pending" | "accepted"
createdAt
updatedAt
```

El id es direccional (`emisor__receptor`). Solo se guarda la solicitud pendiente
o la amistad aceptada; rechazar o eliminar borra el documento. Las lecturas usan
`where()` de un solo campo y filtran en memoria, igual que `movies`.

### Top 5 (`users/{email}.top5`)

```text
top5[]      # hasta 5 referencias: { movieId?, imdbID?, title, year?, poster?, type?, addedAt }
top5UpdatedAt
```

Son referencias ligeras a películas/series ya guardadas, no fichas duplicadas.
El perfil de amigo (`GET /api/friends/:friendId/profile`) lo devuelve junto a
contadores de películas/series. Preparado para el futuro chat entre amigos
(la relación de amistad aceptada será la condición de acceso).

## Seguridad y límites conocidos

- `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` y `.env` son secretos; no deben exponerse en el frontend ni subirse a Git.
- `FIREBASE_API_KEY` pertenece a la configuración Web y puede aparecer en el navegador; aun así deben configurarse correctamente los dominios autorizados y los proveedores de login.
- La autorización real de las operaciones privadas se hace en el backend mediante la sesión técnica.
- El catálogo público se lee desde Firestore y está limitado a un número máximo de documentos por consulta para controlar costes.
- El buscador realiza coincidencias en memoria después de leer el catálogo; para catálogos mucho mayores convendría añadir índices o un motor de búsqueda.
- OMDb tiene cuota y límites de peticiones. Por eso la carga se hace mediante scripts progresivos y no durante las búsquedas normales.
- `firebase-key.json` está incluido en `.gitignore`; debe mantenerse fuera del control de versiones.

## Diseño recomendado para Chat entre amigos (no implementado)

### Identificación de conversación
- Una conversación es **1-a-1** entre dos usuarios amigos.
- ID determinista: `chat_<email1>__<email2>` (emails en minúsculas, ordenados lexicográficamente).
- Ejemplo: `chat_a@x.com__b@y.com`.

### Almacenamiento en Firestore
- Colección `chats/{chatId}` — metadatos de la conversación:
  ```text
  chatId
  participants: [email1, email2]
  createdAt
  updatedAt
  lastMessage: { text, senderId, sentAt }  # opcional, para listar conversaciones
  ```
- Subcolección `chats/{chatId}/messages/{messageId}` — mensajes:
  ```text
  messageId (auto)
  senderId        # email del remitente
  text            # contenido (máx. 4000 chars)
  type            # "text" | "movie_ref" | "series_ref" (futuro)
  ref             # { imdbID, title, type } opcional para compartir fichas
  sentAt
  readAt          # timestamp de lectura (para check azul / visto)
  ```

### Control de acceso
- **Crear/abrir chat**: solo si `FriendshipModel.areFriends(a, b) === true`.
- **Enviar mensaje**: verificar que el `senderId` es uno de los `participants` y que la amistad sigue vigente.
- **Listar conversaciones**: leer `chats` donde `participants` incluye `me` (query `array-contains`).
- **Historial**: leer `messages` ordenados por `sentAt` (paginado con cursor).

### Tiempo real (futuro)
- **Opción A (Firebase Realtime Database)**: migrar solo `messages` a RTDB para `onSnapshot` listeners. Requiere habilitar RTDB en el proyecto.
- **Opción B (Firestore `onSnapshot`)**: escuchar `chats/{chatId}/messages` con `orderBy("sentAt")`. Firestore soporta listeners en tiempo real nativamente; escalabilidad suficiente para chats 1-a-1 moderados.
- **Opción C (WebSockets propio)**: añadir `socket.io` o `ws` + Redis pub/sub. Más control, pero nueva infraestructura.

### Cambios necesarios en Firebase/Firestore
1. Habilitar índice compuesto para `chats`: `participants` (array-contains) + `updatedAt` (desc) para listar conversaciones recientes.
2. Índice para `messages`: `chatId` + `sentAt` (asc) ya lo crea Firestore automáticamente en subcolección.
3. Reglas de seguridad (`firestore.rules`):
   ```javascript
   match /chats/{chatId} {
     allow read, write: if request.auth != null
       && request.auth.token.email in resource.data.participants;
     match /messages/{messageId} {
       allow read: if request.auth != null
         && request.auth.token.email in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
       allow create: if request.auth != null
         && request.auth.token.email == request.resource.data.senderId
         && request.auth.token.email in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
     }
   }
   ```
4. Endpoints backend (REST, sin WebSockets por ahora):
   - `GET /api/chats` — lista mis conversaciones (con `lastMessage`).
   - `POST /api/chats` — crea/obtiene chat con amigo (`{ friendId }`).
   - `GET /api/chats/:chatId/messages` — historial paginado.
   - `POST /api/chats/:chatId/messages` — envía mensaje (`{ text, ref? }`).
   - `PUT /api/chats/:chatId/messages/:messageId/read` — marca como leído.

### Preparación actual
- `FriendshipModel.areFriends(a,b)` ya expone la comprobación atómica.
- `users/{email}` usa email como ID, compatible con `participants`.
- Colección `friendships` ya valida amistad aceptada.
- El backend usa transacciones para operaciones críticas (aceptar/eliminar amistad), patrón reutilizable para crear chat + primer mensaje atómicamente.
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
- [Maratones](#maratones)
- [Backend de administración (admin)](docs/ADMIN_API.md)
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
 	+--> Rutas de series ---------> SeriesModel -----> Firestore
 	|
 	+--> Rutas de maratones ------> MarathonModel ---> Firestore
 	|                                   +-> marathons, marathon_progress,
 	|                                      marathon_achievements
 	|
 	+--> Rutas de reseñas --------> ReviewModel -----> Firestore
 	|                                   +-> reviews, review_votes, replies
 	|
 	+--> Rutas de autenticación -> AuthService -----> Firestore
	|                                  |
	|                                  +------------> Firebase Authentication Admin
	|
	+--> Archivos estáticos de public/
```

El frontend no está compilado. `public/js/bundle.js` se ejecuta directamente en el navegador y utiliza React mediante CDN. El backend sirve simultáneamente la aplicación web y la API REST.

La aplicación web consulta películas únicamente desde Firestore. OMDb no participa en las búsquedas del usuario ni en “Popular ahora”; solo se consulta desde los scripts de carga (`scripts/seedRandomMovies.js`, `scripts/seedRandomSeries.js` y `scripts/seedMarathons.js`) para poblar el catálogo.

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
 |   |-- routes/seriesRoutes.js   # API de catálogo y colección personal de series.
 |   |-- routes/marathonRoutes.js # API de maratones, progreso y logros.
 |   |-- models/marathonModel.js  # Maratones, progreso secuencial y logros.
 |   |-- data/marathonCatalog.js  # Catálogo curado de sagas y actores.
 |   |-- routes/reviewRoutes.js   # API de reseñas, votos y respuestas.
 |   |-- models/reviewModel.js    # Acceso a reseñas, votos y respuestas.
 |   |-- routes/authRoutes.js     # API de sincronización y sesión.
|   `-- services/
|       |-- authService.js       # Verificación Firebase y sesiones técnicas.
|       `-- omdbService.js       # Cliente OMDb usado por scripts.
`-- scripts/
		|-- migrateDatabase.js       # Migración de documentos antiguos.
		|-- deleteAllMovies.js       # Borrado controlado de movies.
		|-- seedRandomMovies.js      # Importación aleatoria desde OMDb.
		`-- seedMarathons.js         # Resuelve sagas/actores en OMDb y crea los maratones.
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
| `GET` | `/api/users/search?q=...` | Busca personas por nombre, apodo o email (mín. 2 caracteres). Cada resultado trae su `relationship` y su `requestId`. |
| `POST` | `/api/auth/friends/request` | Envía una solicitud (`{ to: "email" }`; también acepta `{ toNickname }`). |
| `GET` | `/api/auth/friends/requests` | Solicitudes pendientes recibidas (`{ request, fromUser }`). |
| `GET` | `/api/auth/friends/requests/sent` | Solicitudes pendientes enviadas (`{ request, toUser }`). |
| `POST` | `/api/auth/friends/request/accept` | Acepta una solicitud (`{ requestId }`, solo el destinatario). |
| `POST` | `/api/auth/friends/request/decline` | Rechaza una solicitud (`{ requestId }`, solo el destinatario). |
| `DELETE` | `/api/auth/friends/request/:requestId` | Cancela una solicitud enviada. |
| `GET` | `/api/auth/friends` | Lista de amigos del usuario autenticado. |
| `DELETE` | `/api/auth/friends/:friendId` | Elimina a un amigo. |
| `PUT` | `/api/users/me/top5` | Guarda el Top 5 propio (`{ top5: [...] }`, máx. 5 referencias). |

El apodo público se cambia con `PUT /api/auth/profile` (`{ nickname, colorTheme }`)
o `POST /api/auth/nickname`; es único, en minúsculas y de 3 a 30 caracteres.

`friendsRoutes` mantiene una familia paralela de compatibilidad
(`/api/friends/...`, con `{ results, totalResults }`) para el perfil de amigo con
Top 5 y contadores (`/api/friends/:friendId/profile`, `/api/friends/:friendId/full-profile`).
El buscador y el Top 5 propios viven solo en las rutas de arriba (las copias
duplicadas se eliminaron para no tener dos respuestas para la misma URL).

### Perfil público

Sin sesión (igual que el catálogo). Nunca devuelven datos sensibles: la ficha
sale de `socialProfile()`, sin email, rol, hash de contraseña ni sesiones.
La web abre este perfil al pulsar a alguien en **Buscar** o **Amistades**
(también en enlaces directos `/perfil?id=usuario`).

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/users/:id` | Perfil público de un usuario (`404` si no existe). |
| `GET` | `/api/users/:id/movies` | Películas guardadas de un usuario. |
| `GET` | `/api/users/:id/series` | Series guardadas de un usuario. |
| `GET` | `/api/users/:id/top5` | Top 5 del usuario (`me` = el de la sesión). |
| `GET` | `/api/users/:id/marathons` | Maratones empezadas/completadas, logros y última obra vista. |
| `GET` | `/api/users/:id/relationship` | Estado de amistad con esa persona, para pintar el botón del perfil (`self`, `friends`, `request-sent`, `request-received`, `none` + `requestId`). Requiere sesión. |

### Chat

Todas requieren `Authorization: Bearer <token>`. Solo amigos pueden acceder.

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/chats` | Lista mis conversaciones (con `lastMessage`). |
| `GET` | `/api/chats/:friendId` | Obtiene/crea conversación con ese amigo. |
| `GET` | `/api/chats/:friendId/messages` | Historial paginado (`limit`, `before` cursor). |
| `POST` | `/api/chats/:friendId/messages` | Envía mensaje (`{ text }`, máx. 4000 chars). |

Las rutas privadas reciben el token propio en:

```text
Authorization: Bearer <token>
```

### Reseñas de películas y series

Lecturas públicas (con `Bearer` opcional se añade `userVote`); escritura solo con sesión.

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/reviews?mediaType=movie&imdbID=tt0111161&sort=relevance&page=1&limit=20` | Lista reseñas de una obra (`sort`: `relevance`, `votes`, `recent`). También acepta `title`+`year` en vez de `imdbID`. |
| `GET` | `/api/reviews/summary?mediaType=movie&imdbID=...` | Resumen: `count`, `avgRating`, `ratingsCount`, `score`. |
| `GET` | `/api/reviews/mine?page=1&limit=20` | Reseñas del usuario autenticado. |
| `GET` | `/api/reviews/:id` | Detalle de una reseña. |
| `POST` | `/api/reviews` | Crea reseña `{ mediaType, imdbID?, mediaTitle, mediaYear?, text (50-2000), rating? (1-10) }`. Una por usuario y obra (`409` si duplica). |
| `PUT` | `/api/reviews/:id` | Edita texto/nota (solo el autor). |
| `DELETE` | `/api/reviews/:id` | Borra reseña, votos y respuestas (solo el autor). |
| `POST` | `/api/reviews/:id/vote` | Vota `{ value: 1 \| -1 \| 0 }` (retirar con `0`). Transaccional e idempotente. |
| `GET` | `/api/reviews/:id/replies` | Lista respuestas. |
| `POST` | `/api/reviews/:id/replies` | Responde `{ text (1-1000) }`. |
| `DELETE` | `/api/reviews/:id/replies/:replyId` | Borra respuesta (solo su autor). |

Anti-spam: 30 escrituras (`POST`/`PUT`/`DELETE`) por IP y minuto (`429`).

`mediaKey` identifica la obra: `movie:tt1234567` si hay `imdbID`, o `movie:slug-titulo-yyyy` si no.

El modal de reseñas del front (Películas, Series y MiCuenta) consume esta API mediante el componente compartido `ReviewsModal` de `public/js/bundle.js` (listar, publicar, votar, responder y borrar la reseña propia).

## Maratones

Sección de visionado guiado con gamificación. Cada maratón es una lista **ordenada** de obras, y el progreso es estrictamente secuencial:

- El apartado **exige sesión**: un invitado ve el catálogo como escaparate bloqueado (carátulas difuminadas y un aviso con «Crear cuenta» / «Iniciar sesión»), pero no puede abrir el detalle ni marcar obras. El backend responde `401` en `GET /api/marathons/:id`.

- Sólo se puede marcar como vista la **primera obra pendiente**. Mientras no marques la 1ª, el resto aparecen **con candado** (el backend responde `403 MARATHON_LOCKED` indicando qué título falta).
- Sólo se puede desmarcar la **última** obra vista, así que `watched` es siempre un prefijo de la lista y el progreso nunca se puede “saltar”.
- Los logros son **permanentes**: se sellan en `marathon_achievements` al conseguirlos, por lo que reiniciar un maratón no retira la insignia.

Hay dos tipos de maratón, con dos órdenes distintos:

| Tipo | Orden de visionado |
|---|---|
| `saga` | Orden argumental / de estreno de la saga. |
| `actor` | De la película **más antigua** a la **más reciente** del actor o actriz. |

El catálogo curado (6 sagas y 6 actores/actrices) vive en `src-backend/data/marathonCatalog.js`. Sólo son datos: no requiere red ni Firestore.

### API de maratones

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/marathons` | Catálogo completo. Sin sesión no incluye progreso; con `Bearer` añade resumen por maratón, estadísticas globales y logros. |
| `GET` | `/api/marathons/:id` | Un maratón con el estado de cada obra (`watched`, `locked`, `unlockable`, `canUnmark`). **Requiere sesión** (`401` sin `Bearer`). |
| `POST` | `/api/marathons/:id/items/:itemId/watched` | Marca la primera obra pendiente. `403` si hay una anterior sin ver. |
| `DELETE` | `/api/marathons/:id/items/:itemId/watched` | Desmarca, sólo si es la última vista. |
| `DELETE` | `/api/marathons/:id/progress` | Reinicia el maratón y devuelve el detalle ya a cero. |

### Colecciones de Maratones

```text
marathons/{marathonId}            # id = slug (ej. "saga-matrix")
title
kind: "saga" | "actor"
order
description
poster
itemCount
totalMinutes
items[]                           # dentro del propio documento: leer un maratón es 1 lectura
  itemId                          # imdbID en minúsculas, o "slug-titulo-aaaa"
  order
  title
  year
  mediaType: "movie" | "series"
  imdbID
  poster
  genre
  rating
  runtime
  plot                            # sinopsis en castellano (la que muestra la web)
  plotOriginal                    # sinopsis original en inglés (OMDb)
  plotLang: "es"                  # marca de "ya traducida"
  director
  actors
updatedAt
```

El doc del maratón sólo aporta orden, agrupación y contexto: la ficha completa de cada obra (sinopsis, reparto, dirección) sale del catálogo `movies`/`series`, que es la misma fuente que usan las secciones de Películas y Series.

```text
marathon_progress/{userId__marathonId}
userId
marathonId
watched[]                         # ids en orden de visionado (siempre un prefijo)
watchedAt{}                       # itemId -> ISO date
startedAt
completedAt
updatedAt
```

```text
marathon_achievements/{userId}
userId
unlocked{}                        # achievementId -> ISO date (permanente)
completed{}                       # marathonId -> ISO date (histórico, nunca se borra)
updatedAt
```

Logros disponibles: `primer-paso`, `doble-sesion`, `maratonista`, `triple-sesion`, `fan-de-actor` y `leyenda-del-cine`.

### En el perfil público (social)

El perfil (`/perfil?id=usuario`) es la ficha que se abre al pulsar a cualquier
persona, sea amigo o no: avatar, nombre y apodo, miembro desde, géneros
favoritos, contadores, sus **5 favoritas**, sus **películas** y **series**
guardadas (con ficha de detalle y reseñas) y sus **maratones**.

Arriba a la derecha vive la acción de amistad, siempre según el estado real:
**Añadir amigo**, **Solicitud enviada** (con «Cancelar»), **Aceptar solicitud** /
**Rechazar** o **✓ Amigos** (con «Eliminar amigo»). Si el perfil es el tuyo,
aparecen los accesos a Configuración y Mi cuenta. Cada acción se confirma
contra la API antes de pintar el nuevo estado y el resultado (éxito o error) se
avisa en el propio perfil.

El perfil de un usuario muestra además un bloque **Maratones** con las que ha empezado o
completado, ordenadas por última actividad, indicando su **última obra vista**, la
siguiente pendiente, la barra de progreso y las insignias conseguidas. Las
tarjetas no son interactivas: el progreso de otro se mira, no se toca (si el
perfil es el tuyo, aparece un botón «Ir a mis maratones»).

Lo alimenta `GET /api/users/:id/marathons`, que devuelve
`{ stats, achievements, marathons[] }` con el mismo criterio de visibilidad que
las películas guardadas. Las maratones sin empezar no se listan, así que un
usuario sin progreso comparte un perfil vacío en lugar de 12 tarjetas a cero.
Los logros son permanentes, así que siguen visibles aunque se reinicie la maratón.
La misma información viaja en `GET /api/friends/:friendId/profile` y
`GET /api/friends/:friendId/full-profile`.

## Scripts administrativos

Los scripts usan Firebase Admin y deben ejecutarse desde la raíz del proyecto.

### Migrar datos antiguos

```powershell
node scripts/migrateDatabase.js
```

Completa preferencias de usuarios antiguos y normaliza documentos de películas que no tengan `type` o `title`. No crea usuarios en Firebase Authentication.

### Unificar el campo del apodo

```powershell
node scripts/migrateNicknameField.js
node scripts/migrateNicknameField.js --confirm
```

Deja un único campo `nickname` en cada usuario: recupera el apodo que solo estuviera en `prefs.nickname` y elimina esa copia duplicada. Sin `--confirm` es una simulación que no escribe nada.

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

### Enriquecimiento automático

El servidor lanza una tanda diaria en segundo plano (una al arrancar y otra a la hora fijada) sin bloquear la web. Se configura con variables del `.env`:

```env
SEASON_ENRICH_ENABLED=true
SEASON_ENRICH_DAILY_LIMIT=25
SEASON_ENRICH_HOUR=4
SEASON_ENRICH_DELAY=300
```

Con `SEASON_ENRICH_ENABLED=false` se desactiva por completo.

### Poblar los maratones

```powershell
node scripts/seedMarathons.js
```

O con el atajo de npm:

```powershell
npm run seed:marathons
```

Recorre el catálogo curado y, para cada obra: la resuelve en OMDb (por `imdbID` y, si no cuadra, por título+año), se asegura de que existe en el catálogo `movies`/`series` de Firestore y escribe el documento del maratón en `marathons` con las obras ya ordenadas. Es idempotente (reejecutarlo no duplica nada) y no borra contenido del catálogo. Opciones:

```powershell
node scripts/seedMarathons.js --dry-run          # comprueba OMDb sin escribir nada
node scripts/seedMarathons.js --only=saga-matrix # un único maratón
node scripts/seedMarathons.js --sync-plots       # re-copia las sinopsis ya traducidas
node scripts/seedMarathons.js --cleanup          # borra los maratones cargados
```

Usa `--dry-run` la primera vez: valida que cada `imdbID` del catálogo curado resuelve al título correcto antes de tocar la base de datos. Requiere `OMDB_API_KEY` y las credenciales de Firebase Admin del `.env`.

### Traducir las sinopsis de los maratones

OMDb devuelve las sinopsis en inglés y el seed las copia tal cual. Para pasarlas al castellano (y dejar el catálogo `movies`/`series` también traducido, para que `--sync-plots` no vuelva a copiar el inglés):

```powershell
npm run translate:marathons
node scripts/translateMarathonPlots.js --dry-run    # sólo cuenta lo pendiente
node scripts/translateMarathonPlots.js --limit=20   # tanda pequeña
node scripts/translateMarathonPlots.js --force      # retraduce desde plotOriginal
```

Es idempotente: omite las obras marcadas con `plotLang: "es"` y reaprovecha las sinopsis ya traducidas del catálogo, así que se puede relanzar sin repetir trabajo. Guarda `plot` (castellano), `plotOriginal` (inglés) y `plotLang`. Usa Gemini si hay `GEMINI_API_KEY`; si no, un modelo local de Ollama (`--provider=ollama`, `--model=...`).

## Modelo de datos

### `users/{email}`

```text
id
name
email
nickname                # apodo público único (solo aquí, nunca dentro de prefs)
provider
firebaseUid
photoURL
emailVerified
prefs.favoriteGenres[]
prefs.likesMovies
prefs.onboardingDone
prefs.colorTheme
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

### `reviews/{reviewId}`

```text
mediaType: "movie" | "series"
mediaKey            # ej. "movie:tt0111161" o "series:breaking-bad-2008"
imdbID | null
mediaTitle
mediaYear | null
userId
userName
text (50-2000)
rating (1-10) | null
upvotes, downvotes, score (upvotes - downvotes)
replyCount
createdAt, updatedAt
```

Una reseña por pareja (`mediaKey`, `userId`). `score` y `replyCount` están desnormalizados para ordenar por relevancia sin leer subcolecciones.

### `review_votes/{reviewId__userSlug}`

```text
reviewId
userId
value: 1 | -1
updatedAt
```

Un voto por usuario y reseña; el cambio de voto se hace en transacción para no descuadrar contadores.

### `reviews/{reviewId}/replies/{replyId}`

```text
userId
userName
text (1-1000)
createdAt
```

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

### Chat

#### `chats/{chatId}`

```text
chatId          # "chat_<email1>__<email2>" (emails en minúsculas, ordenados)
participants[]  # [email1, email2] (ordenados)
createdAt
updatedAt
lastMessage     # { id, senderId, text, createdAt } del último mensaje
```

#### `chats/{chatId}/messages/{messageId}`

```text
messageId       # "msg_<timestamp>_<random>"
chatId
senderId        # email del remitente
text            # texto del mensaje (máx. 4000 chars)
createdAt
```

El `chatId` es determinista e independiente de quién inicie la conversación.
El acceso a chats y mensajes requiere amistad aceptada verificada en backend
(`FriendshipModel.areFriends`). Si se elimina la amistad, los endpoints
bloquean el acceso (no borran el historial automáticamente).

Para tiempo real, el frontend puede escuchar `onSnapshot` en
`chats/{chatId}/messages` ordenado por `createdAt` (Firestore nativo).

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
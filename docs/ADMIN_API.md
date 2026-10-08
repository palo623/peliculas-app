# Backend de administración (vista del administrador)

Implementación de las tareas **de backend** del documento del proyecto
("Vista del Administrador - Dashboard de Gestión y Análisis de Reviews").
El frontend se encarga de las pantallas; aquí está todo lo que el backend
ofrece para construirlas.

## Qué se ha hecho (mapa con el documento)

| Tarea del PDF | Backend implementado |
| --- | --- |
| 1. Sistema de roles Admin/User | `role` en el usuario, `ADMIN_EMAILS`, `/api/admin/users`, `/api/admin/users/:id/role`, backfill en `migrateDatabase.js` |
| 4. Buscador de series y películas | `GET /api/admin/catalog/search` (usa el catálogo ya existente en Firestore, sin API externa) |
| 5. Información de la obra seleccionada | `GET /api/admin/catalog/item` |
| 6. Listar y administrar reviews | `GET /api/admin/reviews` y `DELETE /api/admin/reviews/:id` |
| 7. Análisis de sentimiento con IA | `sentimentService` + clasificación al guardar + `POST /api/admin/reviews/analyze` |
| 8. Estadísticas de reviews por contenido | `GET /api/admin/stats/media` |
| 10. Filtro por género | `GET /api/admin/reviews?genre=` y `GET /api/admin/catalog/genres` |
| 11. Estadísticas globales por género | `GET /api/admin/stats/genres` |
| 13. Dataset de pruebas (100 usuarios + 100 reviews) | `scripts/seedAdminDataset.js` |
| 14. Panel resumen del administrador | `GET /api/admin/summary` |
| 15. Testing y validación | `npm test` (`scripts/test/adminBackend.test.js`) |

## Seguridad: roles y permisos

- Cada usuario tiene un campo `role`: `"user"` (por defecto) o `"admin"`.
- **Todas** las rutas de `/api/admin` exigen sesión (`Bearer`) con rol admin:
  - Sin sesión → **401**.
  - Sesión de usuario normal → **403**.
- El primer administrador se crea con la variable `ADMIN_EMAILS` del `.env`:
  al entrar con esa cuenta, el rol se asigna automáticamente.
  ```env
  ADMIN_EMAILS=tu@email.com,otro@email.com
  ```
- Un administrador **no puede quitarse a sí mismo** el rol (evita quedarse sin acceso).
- El rol se comprueba en el servidor, no solo ocultando el botón en la interfaz.

## Autenticación de las peticiones

Todas las rutas privadas usan el mismo esquema que el resto de la app:

```http
Authorization: Bearer <token de sesión>
```

El token se obtiene con `POST /api/auth/firebase` (flujo normal de login).

## Endpoints

### `GET /api/admin/summary`
Panel resumen (tarea 14): totales y últimas reseñas ya clasificadas.
Query opcional: `latest` (1-50, por defecto 10).

```json
{
  "users": { "total": 100 },
  "reviews": { "total": 100, "sampled": 100 },
  "sentiments": {
    "positive": 42, "negative": 25, "neutral": 33, "unclassified": 0, "total": 100,
    "percent": { "positive": 42, "negative": 25, "neutral": 33, "unclassified": 0 }
  },
  "latestReviews": [ { "id": "...", "mediaTitle": "Inception", "sentimentLabel": "positive", "genre": "Sci-Fi, Action", "userName": "...", "rating": 9, "createdAt": "..." } ],
  "provider": { "provider": "lexicon", "aiEnabled": false, "version": "lexicon-es-en-v1" }
}
```

### `GET /api/admin/reviews`
Listar y filtrar reseñas (tareas 6 y 10). Query:
`mediaType`, `imdbID`, `title`, `year`, `mediaKey`, `genre`, `sentiment`
(`positive|negative|neutral|unclassified`), `q` (busca en título, autor y texto),
`sort` (`recent|oldest|votes|rating`), `page`, `limit` (máx. 100).

Respuesta: `{ results, total, page, limit, sort }`. Cada reseña incluye
`sentimentLabel`, `sentiment` y `genres`.

### `DELETE /api/admin/reviews/:id`
Borra **cualquier** reseña (tarea 6), también las de otros usuarios. Limpia sus
votos y respuestas. El front debe pedir confirmación antes de llamar.
`200 { ok: true }` · `404` si no existe.

### `POST /api/admin/reviews/analyze`
Clasifica el sentimiento de las reseñas pendientes (tarea 7).
Body opcional: `{ mediaKey?, ids?, limit?, force?, useAI? }`.
- `force: true` recalcula también las ya clasificadas.
- `useAI: false` usa solo el analizador léxico (sin red).
Respuesta: `{ analyzed, failed, skipped, candidates, provider }`.

### `GET /api/admin/stats/media`
Estadísticas de una obra (tarea 8). Query: `mediaType`, `imdbID`, `title`,
`year` o directamente `mediaKey`.

```json
{
  "media": { "mediaKey": "movie:tt1375666", "title": "Inception", "type": "movie", "year": "2010", "genres": ["Sci-Fi","Action"], "inCatalog": true },
  "sentiments": { "positive": 30, "negative": 10, "neutral": 5, "unclassified": 0, "total": 45, "percent": { "...": 0 } },
  "avgRating": 7.8, "ratingsCount": 40, "score": 120
}
```

### `GET /api/admin/stats/genres`
Estadísticas agregadas por género (tarea 11). Query opcional: `genre`.

```json
{
  "results": [ { "genre": "Drama", "positive": 12, "negative": 4, "neutral": 6, "unclassified": 0, "total": 22, "percent": { "...": 0 } } ],
  "totals": { "positive": 42, "negative": 25, "neutral": 33, "total": 100 },
  "genres": ["Action", "Crime", "Drama", "Sci-Fi"]
}
```

### `GET /api/admin/catalog/search`
Buscador de películas y series (tarea 4). Usa el catálogo de Firestore ya
existente. Query: `s` (texto) o `q`, `type` (`movie|series`), `genre`, `page`, `limit`.

### `GET /api/admin/catalog/item`
Ficha de una obra (tarea 5). Query: `mediaType`, `imdbID`, `title`, `year` o `mediaKey`.
`404` si no está en el catálogo.

### `GET /api/admin/catalog/genres`
Lista de géneros disponibles para el selector del filtro (tarea 10):
`{ results: ["Action", "Crime", ...], totalResults }`.

### `GET /api/admin/users`
Listado de usuarios con filtro por rol (tarea 1). Query: `q`, `role`, `page`, `limit`.
Respuesta: `{ results: [{ id, name, email, role, isAdmin, ... }], total, page, limit, byRole: { admin, user } }`.

### `PUT /api/admin/users/:id/role`
Cambiar rol (tarea 1). Body: `{ "role": "admin" }` o `{ "role": "user" }`.
`:id` es el email del usuario (codifícalo con `encodeURIComponent`).
`409` si intentas quitarte tu propio rol de admin.

### `GET /api/admin/health`
Comprueba que la sesión de admin es válida: estado, si Firestore está conectado
y el proveedor de sentimiento activo.

## Análisis de sentimiento

`src/backend/services/sentimentService.js` clasifica cada reseña como
`positive`, `negative` o `neutral`.

1. **Por defecto (léxico ES/EN, sin clave ni coste):** se ejecuta al crear o
   editar una reseña, así que **ninguna reseña queda sin clasificar** y el
   guardado no se bloquea esperando a la red. Maneja negaciones ("no es buena"
   → negativo) e intensificadores.
2. **IA opcional:** si se configura una clave de Gemini o OpenAI, el endpoint
   `/api/admin/reviews/analyze` y el script de dataset pueden refinar la
   clasificación con el modelo. Si la llamada falla, se devuelve la clasificación
   léxica (nunca rompe).

Variables (todas opcionales):

```env
SENTIMENT_PROVIDER=auto          # auto | lexicon | gemini | openai
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o-mini
# SENTIMENT_AI_TIMEOUT_MS=8000
```

> Si prefieres **no** depender de una API de IA externa, no hace falta configurar
> nada: el analizador léxico ya clasifica las tres categorías y alimenta los
> gráficos.

La clasificación se guarda en la reseña:

```json
{
  "sentiment": { "label": "positive", "score": 7, "confidence": 0.97, "provider": "lexicon", "version": "lexicon-es-en-v1", "analyzedAt": "..." },
  "sentimentLabel": "positive",
  "genre": "Sci-Fi, Action"
}
```

## Dataset de pruebas (tarea 13)

```bash
# Ver qué se generaría, sin escribir nada (funciona incluso sin Firestore):
node scripts/seedAdminDataset.js --dry-run

# Generar 100 usuarios + 100 reseñas en Firebase:
node scripts/seedAdminDataset.js

# Opciones
node scripts/seedAdminDataset.js --users=50 --count=200   # tamaños
node scripts/seedAdminDataset.js --ai                     # sentimiento con IA
node scripts/seedAdminDataset.js --admin=tu@email.com     # un usuario admin
node scripts/seedAdminDataset.js --cleanup                # borra lo generado
```

- Asocia las reseñas a películas/series del catálogo; si está vacío, usa un
  catálogo de reserva con obras conocidas.
- Cada reseña se clasifica y se guarda con su género, así que el panel y los
  gráficos funcionan desde el primer momento.
- Todos los documentos llevan `seedSource: "admin-dataset"`: `--cleanup` solo
  borra esos datos de prueba, nunca usuarios reales.
- **Escribe en la base de datos real**: revisa antes con `--dry-run`.

## Pruebas y validación (tarea 15)

```bash
npm test
```

Se ejecutan 19 pruebas con `node --test` en **modo local (memoria)**, sin tocar
Firestore (`DISABLE_FIREBASE=1`), levantando la app real y llamándola por HTTP:
sentimiento, creación de reseñas con género y clasificación, permisos
401/403/200, cambio de rol, listado, filtrado por género y sentimiento, borrado
administrativo, estadísticas por obra y por género, análisis masivo, buscador de
catálogo y generador de dataset.

Para trabajar sin tocar la base de datos real (por ejemplo en pruebas manuales):

```bash
DISABLE_FIREBASE=1 npm start
```

## Notas

- Las lecturas de estadísticas leen como máximo 5000 reseñas y cachean el
  catálogo unos minutos (`CATALOG_CACHE_TTL_MS`), para no disparar los costes de
  Firestore en un proyecto de este tamaño.
- `GET /api/reviews` (ruta pública ya existente) ahora devuelve además `genre`,
  `sentiment` y `sentimentLabel` en cada reseña; el resto de campos no cambia.
- Se completaron también funciones que `friendsRoutes.js` ya usaba pero no
  existían (`authService.getById`, `searchUsers`, `getTop5`, `setTop5` y
  `cardUser`); esa ruta se rompía en tiempo de ejecución.

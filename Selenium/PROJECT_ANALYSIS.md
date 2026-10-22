# Análisis del Proyecto CineAIros

## Resumen de Arquitectura

### Stack Tecnológico
- **Frontend**: React 18 (CDN), JavaScript plano (sin Babel/JSX), `public/js/bundle.js` único
- **Backend**: Node.js + Express 4
- **Base de Datos**: Cloud Firestore (Firebase)
- **Autenticación**: Firebase Authentication (email/password + Google OAuth)
- **API Externa**: OMDb (solo para scripts de carga administrativa)
- **IA**: Gemini API (análisis de sentimiento de reseñas)

### Estructura del Proyecto
```
peliculas-app/
├── server.js                 # Entry point Express + middleware
├── package.json
├── public/
│   ├── index.html            # SPA entry point
│   ├── css/style.css         # Estilos completos
│   └── js/bundle.js          # React components (plain JS)
├── src-backend/
│   ├── routes/               # API routes (/api/*)
│   ├── models/               # Firestore models
│   └── services/             # Business logic
└── scripts/                  # Admin/seeding scripts
```

## Páginas y Rutas Principales

### Públicas (sin login)
- `/` - Landing page (Hero, features, CTA)
- `/peliculas` - Buscador de películas con filtros
- `/series` - Buscador de series con filtros
- `/maratones` - Catálogo de maratones (sagas/actores)
- `/perfil?id=<email>` - Perfil público de usuario

### Autenticación
- `/auth` - Pantalla inicial (Entrar / Crear cuenta)
- `/auth?mode=login` - Login email/password + Google
- `/auth?mode=register` - Registro multi-paso (datos → cuestionario)
- `/auth?mode=forgot` - Recuperar contraseña
- `/?mode=verifyEmail&oobCode=...` - Verificación email
- `/?mode=resetPassword&oobCode=...` - Reset contraseña

### Privadas (requieren login + onboardingDone)
- `/cuenta` - Mi colección (películas/series guardadas, Top 5)
- `/perfil` - Mi perfil público editable
- `/amigos` - Buscar usuarios, solicitudes, chat
- `/configuracion` - Apodo, tema de color

### Administración (requiere rol admin)
- `/admin` - Panel de administración (React + Bootstrap)

## Roles de Usuario
- **USER** (default): Acceso a funcionalidades estándar
- **ADMIN**: Acceso a `/admin` + APIs `/api/admin/*`
  - Determinado por campo `role: "admin"` en Firestore
  - O email en variable de entorno `ADMIN_EMAILS`

## Flujos Críticos Identificados

| Flujo | Descripción | Endpoints Clave |
|-------|-------------|-----------------|
| Login usuario | Email/password → Firebase → `/api/auth/firebase` → token localStorage | `POST /api/auth/firebase` |
| Login admin | Igual + rol admin en Firestore | `GET /api/admin/*` |
| Registro | Firebase createUser → email verification → onboarding (3 géneros + 3 preguntas) | `POST /api/auth/prefs` |
| Buscar/Guardar película | Search Firestore → POST `/api/movies` (guarda en colección personal) | `GET /api/movies/search*`, `POST /api/movies` |
| Maratones | Ver catálogo → POST `/api/marathons/:id/items/:itemId/watched` (secuencial) | `GET/POST/DELETE /api/marathons/*` |
| Reseñas | Modal compartido → CRUD `/api/reviews` | `GET/POST/PUT/DELETE /api/reviews` |
| Amistades | Buscar → solicitar → aceptar → chat | `/api/auth/friends/*`, `/api/chats/*` |
| Admin | Panel stats, users, reviews, catalog | `/api/admin/*` |

## Selectores CSS Recomendados para Selenium

### Autenticación
```python
# Login
EMAIL_INPUT = (By.CSS_SELECTOR, '.auth-field input[type="email"]')
PASSWORD_INPUT = (By.CSS_SELECTOR, '.auth-field input[type="password"]')
LOGIN_BTN = (By.CSS_SELECTOR, '.auth-card .btn-primary[type="submit"]')
GOOGLE_BTN = (By.CSS_SELECTOR, '.btn-google')
SWITCH_TO_REGISTER = (By.CSS_SELECTOR, '.auth-switch button')

# Registro - Paso 1
NAME_INPUT = (By.CSS_SELECTOR, '.auth-field input[type="text"]')
NICKNAME_INPUT = (By.CSS_SELECTOR, '.nickname-field input')
REGISTER_CONTINUE_BTN = (By.CSS_SELECTOR, 'form .btn-primary[type="submit"]')

# Registro - Paso 2 (Cuestionario)
GENRE_CHIPS = (By.CSS_SELECTOR, '.genre-chip')
YN_BUTTONS = (By.CSS_SELECTOR, '.yn-btn')
FINISH_BTN = (By.CSS_SELECTOR, 'form .btn-primary[type="submit"]')
VERIFY_EMAIL_BTN = (By.CSS_SELECTOR, '.result-actions .btn-primary')
```

### Navegación
```python
NAV_HOME = (By.CSS_SELECTOR, '.nav-link[onclick*="home"]')
NAV_MOVIES = (By.CSS_SELECTOR, '.nav-link[onclick*="peliculas"]')
NAV_SERIES = (By.CSS_SELECTOR, '.nav-link[onclick*="series"]')
NAV_MARATHONS = (By.CSS_SELECTOR, '.nav-link[onclick*="maratones"]')
USER_CHIP = (By.CSS_SELECTOR, '.user-chip')
USER_DROPDOWN = (By.CSS_SELECTOR, '.user-dropdown')
LOGOUT_BTN = (By.CSS_SELECTOR, '.dropdown-item.danger')
ADMIN_LINK = (By.CSS_SELECTOR, '.dropdown-item[onclick*="admin"]')
```

### Películas (Búsqueda y Colección)
```python
SEARCH_INPUT = (By.CSS_SELECTOR, '.search-form input[type="text"]')
SEARCH_BTN = (By.CSS_SELECTOR, '.search-form button[type="submit"]')
YEAR_FILTER = (By.CSS_SELECTOR, '.filter input[type="number"]')
RATING_FILTER = (By.CSS_SELECTOR, '.filter select')
GENRE_FILTER = (By.CSS_SELECTOR, '.filter select')
SORT_FILTER = (By.CSS_SELECTOR, '.filter select')
CLEAR_FILTERS = (By.CSS_SELECTOR, '.filters .btn-ghost')

# Resultado exacto
RESULT_CARD = (By.CSS_SELECTOR, '.result')
RESULT_POSTER = (By.CSS_SELECTOR, '.result .poster')
RESULT_TITLE = (By.CSS_SELECTOR, '.result-info h2')
SAVE_BTN = (By.CSS_SELECTOR, '.result-actions .btn-primary')
DISMISS_BTN = (By.CSS_SELECTOR, '.result-actions .btn-ghost')

# Carrusel / Grid
MOVIE_CARDS = (By.CSS_SELECTOR, '.movie-card')
MOVIE_CARD_POSTER = (By.CSS_SELECTOR, '.movie-card-poster img')
MOVIE_CARD_TITLE = (By.CSS_SELECTOR, '.movie-card h3')
DELETE_BTN = (By.CSS_SELECTOR, '.delete-btn')
```

### Modal de Detalle / Reseñas
```python
MODAL_BACKDROP = (By.CSS_SELECTOR, '.modal-backdrop')
MODAL = (By.CSS_SELECTOR, '.modal')
MODAL_CLOSE = (By.CSS_SELECTOR, '.modal-close')
MODAL_POSTER = (By.CSS_SELECTOR, '.modal-content img')
MODAL_TITLE = (By.CSS_SELECTOR, '.modal-content h2')
REVIEWS_MODAL = (By.CSS_SELECTOR, '.modal-reviews')
REVIEW_TEXTAREA = (By.CSS_SELECTOR, '.review-form textarea')
PUBLISH_REVIEW_BTN = (By.CSS_SELECTOR, '.review-form .btn-primary')
REVIEW_ITEM = (By.CSS_SELECTOR, '.review-item')
VOTE_UP_BTN = (By.CSS_SELECTOR, '.vote-btn:first-child')
VOTE_DOWN_BTN = (By.CSS_SELECTOR, '.vote-btn:nth-child(2)')
```

### Admin
```python
ADMIN_DASHBOARD = (By.CSS_SELECTOR, '.admin-dashboard')
ADMIN_STATS_CARDS = (By.CSS_SELECTOR, '.card.h-100')
ADMIN_USERS_TABLE = (By.CSS_SELECTOR, 'table tbody tr')
ADMIN_REVIEWS_TABLE = (By.CSS_SELECTOR, 'table tbody tr')
```

## Datos de Prueba Requeridos

### Usuarios
| Usuario | Email | Contraseña | Rol | Estado |
|---------|-------|------------|-----|--------|
| Usuario normal | `testuser@example.com` | `TestPass123!` | user | Verificado, onboardingDone=true |
| Administrador | `admin@example.com` | `AdminPass123!` | admin | Verificado, onboardingDone=true |
| Usuario sin verificar | `unverified@example.com` | `TestPass123!` | user | Email NO verificado |

### Películas de Prueba (ya en Firestore tras seeding)
- Buscar "Inception" (tt1375666)
- Buscar "The Matrix" (tt0133093)
- Buscar "Interstellar" (tt0816692)

## Dependencias Python Necesarias
```txt
selenium>=4.15.0
pytest>=7.4.0
pytest-html>=4.1.0
webdriver-manager>=4.0.0
python-dotenv>=1.0.0
```

## Ejecución
```bash
# 1. Iniciar servidor (terminal 1)
npm start

# 2. Ejecutar tests (terminal 2)
cd tests
python -m pytest -v --html=report.html --self-contained-html
```

## Evidencias para Demo
1. **Screenshots** en cada assertion clave (login, navegación, CRUD)
2. **Video** de la suite completa (opcional: `pytest --video`)
3. **Report HTML** con pytest-html (pasos, tiempos, capturas en fallos)
4. **Logs** de consola del navegador (errors/warnings)
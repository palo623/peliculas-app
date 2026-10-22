# Tests Automatizados Selenium - CineAIros

Suite de pruebas automatizadas con Selenium WebDriver + pytest para la aplicación CineAIros (React + Node.js + Firebase).

## 📋 Resumen de Cobertura

| Test Case | Descripción | Archivo |
|-----------|-------------|---------|
| 1 | Login usuario normal | `test_auth.py::TestLogin::test_login_standard_user` |
| 2 | Login administrador | `test_auth.py::TestLogin::test_login_admin_user` |
| 3 | Navegación páginas principales | `test_navigation.py::TestMainNavigation` |
| 4 | Crear elemento (guardar película) | `test_movies.py::TestMoviesCRUD::test_save_movie_from_search_result` |
| 5 | Edición/Detalle (modal película) | `test_movies.py::TestMoviesCRUD::test_open_movie_detail_modal` |
| 6 | Eliminación (borrar de colección) | `test_movies.py::TestMoviesCRUD::test_delete_movie_from_collection` |
| 7 | Logout | `test_auth.py::TestLogout::test_logout_via_dropdown` |
| 8 | Assertions en cada paso | Incluidas en todos los tests |

## 🚀 Requisitos Previos

1. **Aplicación corriendo**: `npm start` en `http://localhost:8080`
2. **Base de datos poblada**: Ejecutar scripts de seeding
   ```bash
   npm run seed:marathons
   node scripts/seedRandomMovies.js --count=100
   ```
3. **Usuarios de prueba creados** en Firebase Auth:
   - `testuser@example.com` / `TestPass123!` (rol user, verificado, onboardingDone)
   - `admin@example.com` / `AdminPass123!` (rol admin, verificado, onboardingDone)
   - O usar modo local con `seedLocalUser` via API

## 📦 Instalación

```bash
cd tests
pip install -r requirements.txt
# O instalar globalmente
pip install selenium pytest pytest-html webdriver-manager python-dotenv
```

## ⚙️ Configuración

Copiar y ajustar variables de entorno:
```bash
cp .env.test.example .env.test
# Editar .env.test con tus valores
```

Variables principales:
- `BASE_URL`: URL de la app (default: http://localhost:8080)
- `BROWSER`: chrome, firefox, edge (default: chrome)
- `HEADLESS`: true/false (default: false)
- Credenciales de usuarios de prueba

## ▶️ Ejecución

### Todos los tests
```bash
cd tests
python -m pytest -v --html=reports/report.html --self-contained-html
```

### Solo smoke tests (rápidos)
```bash
python -m pytest -m smoke -v
```

### Tests específicos
```bash
# Solo autenticación
python -m pytest -m auth -v

# Solo películas
python -m pytest -m movies -v

# Solo admin (requiere usuario admin)
python -m pytest -m admin -v

# Un test específico
python -m pytest test_cases/test_auth.py::TestLogin::test_login_standard_user -v
```

### Con navegador headless
```bash
HEADLESS=true python -m pytest -v
```

### Con Firefox
```bash
BROWSER=firefox python -m pytest -v
```

## 📊 Reportes

- **HTML**: `reports/report.html` (abrir en navegador)
- **Screenshots en fallos**: `reports/screenshots/`
- **JUnit XML** (para CI/CD):
  ```bash
  python -m pytest --junitxml=reports/junit.xml
  ```

## 🏗️ Estructura del Proyecto

```
tests/
├── conftest.py              # Fixtures globales, driver, screenshots
├── pytest.ini               # Configuración pytest
├── requirements.txt         # Dependencias Python
├── .env.test.example        # Template variables de entorno
├── data/
│   └── test_data.py         # Usuarios, películas, constantes de prueba
├── page_objects/
│   ├── base_page.py         # BasePage + AssertionHelper
│   ├── auth_page.py         # Login, Registro, Recuperación
│   ├── header_page.py       # Header, navegación, menú usuario
│   ├── movies_page.py       # Películas: búsqueda, CRUD, reseñas
│   ├── account_page.py      # Mi Cuenta: colección, Top 5
│   ├── marathons_page.py    # Maratones: lista, detalle, progresión
│   └── admin_page.py        # Panel admin: stats, gestión, actividad
├── test_cases/
│   ├── test_auth.py         # Login, logout, registro
│   ├── test_navigation.py   # Navegación principal
│   ├── test_movies.py       # CRUD películas
│   ├── test_admin.py        # Panel administración
│   ├── test_marathons.py    # Progresión maratones
│   └── test_reviews.py      # Reseñas
└── utils/
    └── helpers.py           # Utilidades: login/logout helpers, localStorage, etc.
```

## 🎯 Page Object Pattern

Todos los tests usan **Page Objects** para:
- Encapsular selectores CSS
- Proporcionar métodos de alto nivel (`login()`, `save_movie()`)
- Separar lógica de test de detalles de implementación
- Facilitar mantenimiento cuando cambie la UI

Ejemplo:
```python
def test_save_movie(self, driver, base_url):
    movies = MoviesPage(driver, base_url)
    movies.open()
    movies.search("Inception")
    movies.save_result()
    movies.assert_saved_success()
```

## 🔧 Selectores CSS Utilizados

Los selectores se basan en las clases CSS reales de `public/css/style.css`:

| Componente | Selectores Clave |
|------------|------------------|
| Login | `.auth-field input[type="email"]`, `.btn-primary` |
| Registro | `.nickname-field input`, `.genre-chip`, `.yn-btn` |
| Header | `.nav-link`, `.user-chip`, `.dropdown-item` |
| Películas | `.search-form input`, `.movie-card`, `.result`, `.delete-btn` |
| Modal | `.modal-backdrop`, `.modal`, `.review-form textarea` |
| Admin | `.admin-dashboard`, `.card.h-100`, `table.table` |

## 📝 Datos de Prueba Requeridos

### Usuarios en Firebase
```javascript
// Usuario normal
{ email: "testuser@example.com", password: "TestPass123!", role: "user" }

// Admin (role: "admin" en Firestore o email en ADMIN_EMAILS)
{ email: "admin@example.com", password: "AdminPass123!", role: "admin" }
```

### Películas en Firestore (colección `movies`)
Deben existir al menos:
- Inception (tt1375666)
- The Matrix (tt0133093)
- Interstellar (tt0816692)

## 🐛 Debugging

### Ver browser en fallos
```bash
HEADLESS=false python -m pytest test_cases/test_auth.py -v -s
```

### Pausar en test (breakpoint)
```python
import ipdb; ipdb.set_trace()  # En el test
```

### Logs del navegador
```python
# En conftest.py o test
for entry in driver.get_log('browser'):
    print(entry)
```

## 🔄 Integración CI/CD (GitHub Actions ejemplo)

```yaml
name: Selenium Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      # Si necesitas Firebase emulator, añadir aquí
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run seed:marathons
      - run: npm start &  # Background
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: cd tests && pip install -r requirements.txt
      - run: cd tests && HEADLESS=true python -m pytest -m smoke --junitxml=reports/junit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-reports
          path: tests/reports/
```

## 📸 Evidencias para Demo/Presentación

1. **Reporte HTML** (`reports/report.html`): Resultados detallados, tiempos, capturas en fallos
2. **Screenshots**: Capturas automáticas en cada fallo (`reports/screenshots/`)
3. **Video** (opcional): `pytest --video` requiere `pytest-video`
4. **Métricas clave**:
   - Tiempo de login < 3s
   - Búsqueda y guardado < 5s
   - Navegación entre páginas < 2s
   - 0 flaky tests en 3 ejecuciones consecutivas

## 🛠️ Mantenimiento

### Añadir nuevo test
1. Crear/actualizar Page Object en `page_objects/`
2. Añadir test en `test_cases/test_<feature>.py`
3. Usar fixtures de `conftest.py` (`driver`, `base_url`, `test_credentials`)
4. Marcar con `@pytest.mark.<categoría>`

### Actualizar selectores
Si cambia la UI, actualizar solo en el Page Object correspondiente.

### Añadir datos de prueba
Editar `data/test_data.py` y asegurar que existan en Firebase/Firestore.

## ⚠️ Problemas Conocidos

1. **Rate limiting**: La API tiene límites (120 req/min search, 20 auth/min). Tests espaciados o usar `time.sleep()`.
2. **Firebase Auth en headless**: Google OAuth no funciona en headless sin configuración extra. Tests usan email/password.
3. **Datos de prueba**: Requieren usuarios/películas reales en BD. Usar scripts de seeding.
4. **Timing**: Animaciones React pueden causar flakiness. Usar `WebDriverWait` explícito.

## 📞 Soporte

Para dudas o problemas:
1. Verificar que `npm start` corre en `localhost:8080`
2. Verificar usuarios en Firebase Console > Authentication
3. Verificar datos en Firestore > Data
4. Revisar logs en `reports/screenshots/` y consola pytest
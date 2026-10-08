# Development Branch Diff Summary (vs Rama-Dani)

## New/Modified Files (25 files changed, +4619/-1723 lines)

### 🆕 New Files
- `src-backend/models/reviewModel.js` - Reviews, votes, replies model
- `src-backend/routes/reviewRoutes.js` - Reviews API endpoints
- `src-backend/services/seasonEnrichmentService.js` - Automatic series season enrichment
- `scripts/enrichSeriesSeasons.js` - Script to enrich series seasons
- `scripts/migrateSeriesToCollection.js` - Migration script for series
- `check_reviews.ps1`, `check_reviews2.ps1`, `fix_reviews.js`, `fix_reviews.ps1` - Review maintenance scripts

### 📝 Key Backend Changes

#### Reviews System (NEW)
- **reviewModel.js** (533 lines): Full CRUD for reviews, votes, replies
  - `mediaKey` format: `movie:tt1234567` or `series:slug-titulo-yyyy`
  - Visibility: `public` / `friends` / `private`
  - Transactions for votes (idempotent)
- **reviewRoutes.js** (227 lines): REST API
  - `GET /api/reviews` - list with filters (mediaType, imdbID, sort, page, limit)
  - `GET /api/reviews/summary` - aggregate stats
  - `POST /api/reviews` - create (50-2000 chars, rating 1-10)
  - `PUT/DELETE /api/reviews/:id` - edit/delete own
  - `POST /api/reviews/:id/vote` - vote 1/-1/0
  - `POST /api/reviews/:id/replies` - replies
  - Anti-spam: 30 writes/IP/min (429)

#### Auth & Friends Updates
- **authRoutes.js**: Added review-related endpoints, updated prefs
- **friendsRoutes.js**: Enhanced with nickname support
- **authService.js**: Added `searchUsers` for friend discovery

#### Series Enhancements
- **seriesRoutes.js**: Added seasons/episodes endpoints
- **seriesModel.js**: Updated for seasons/episodes
- **seasonEnrichmentService.js** (110 lines): Automatic daily enrichment via OMDb
  - Config via env: `SEASON_ENRICH_ENABLED`, `SEASON_ENRICH_DAILY_LIMIT`, `SEASON_ENRICH_HOUR`, `SEASON_ENRICH_DELAY`
- **seriesModel.js**: Added `getSeasons`, `getEpisodes` via OMDb

#### Friendship Model
- **friendshipModel.js**: Added nickname field, profile data

### 📝 Frontend Changes

#### public/js/bundle.js (major updates)
- **ReviewsModal component** - Shared modal for reviews (list, create, vote, reply, delete)
- **SeriesPage**: 
  - Seasons/episodes modal (click "Ver temporadas")
  - Advanced filters: year range, duration min/max, PEGI
  - "Popular ahora" section loads from `/api/series/popular`
- **MediaPage**: Advanced filters (year range, duration, PEGI)
- **MiCuenta**: Tabs (Películas, Series, Amigos, Top 5)
- **ThemePicker**: 6 color themes with localStorage persistence
- **ChatWidget**: Real-time friend chat with Firebase listener
- **FriendsPage**: 3 tabs (Amigos, Solicitudes, Buscar)
- **Hero posters**: Clickable → auto-search via sessionStorage
- **Feature cards**: Accessible buttons
- **Duration badge** on MovieCard (YouTube style)

#### public/css/style.css
- Theme system: 6 color palettes via `[data-theme]`
- `.theme-picker` fixed button + panel
- `.seasons-modal`, `.episodes-list`, `.episode-item`
- `.reviews-modal`, `.review-item`, `.vote-btn`
- `.friends-tabs`, `.theme-option`, `.theme-swatch`
- Duration badge `.runtime-badge`

### ⚙️ Configuration
- **.env.example**: Added `SEASON_ENRICH_*` variables
- **server.js**: Mounted reviewRoutes, season enrichment cron
- **package.json**: Added `cheerio` dependency

### 📚 Documentation
- **README.md**: Added Reviews API docs, updated architecture diagram, new scripts

---

## To Port to Rama-Dani

Priority order:
1. **Reviews system** (model + routes + modal)
2. **Season enrichment** (service + script + env vars)
3. **Series seasons/episodes modal** + API
4. **Friends nickname** support
5. **ThemePicker** + CSS theme system
5. **Advanced filters** (already partially in Rama-Dani)
6. **Frontend components**: ReviewsModal, ThemePicker, seasons/episodes modal
7. **CSS**: theme system, reviews modal, seasons modal
8. **Scripts**: enrichSeriesSeasons, migrateSeriesToCollection
9. **Docs**: README updates
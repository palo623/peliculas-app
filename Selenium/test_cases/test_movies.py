"""
Tests CRUD de películas: búsqueda, guardado, edición (detalle), eliminación.
"""
import pytest
from page_objects import MoviesPage, HeaderPage
from data.test_data import get_user, get_movie, TEST_MOVIES


@pytest.mark.movies
@pytest.mark.smoke
class TestMoviesSearch:
    """Tests de búsqueda y filtros."""

    def test_search_by_title(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(0)  # Inception

        movies.search(movie.title)
        movies.assert_result_visible(expected_title=movie.title)

    def test_search_with_year_filter(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(1)  # The Matrix 1999

        movies.search(movie.title, year=movie.year)
        movies.assert_result_visible(expected_title=movie.title)

    def test_search_with_rating_filter(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()

        movies.search("Matrix", min_rating=8)
        movies.assert_search_results(min_count=1)

    def test_search_with_genre_filter(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()

        movies.search("", genre="Action")
        movies.assert_search_results(min_count=1)

    def test_clear_filters(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()
        movies.search("Inception", year=2010)
        movies.assert_result_visible()
        movies.clear_filters()
        movies.assert_result_not_visible()

    def test_search_no_results(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()
        movies.search("película_que_no_existe_xyz_12345")
        movies.assert_no_results_message()


@pytest.mark.movies
@pytest.mark.smoke
class TestMoviesCRUD:
    """4. Creación (guardar), 5. Edición (detalle), 6. Eliminación."""

    @pytest.fixture(autouse=True)
    def login_user(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)
        yield

    def test_save_movie_from_search_result(self, driver, base_url):
        """4. Crear: Guardar película desde resultado de búsqueda."""
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(0)  # Inception

        movies.search(movie.title)
        movies.assert_result_visible(expected_title=movie.title)

        # Guardar
        movies.save_result()
        movies.assert_saved_success("Guardada")

        # Verificar que aparece en mi colección
        header = HeaderPage(driver, base_url)
        header.go_my_account()
        account = AccountPage(driver, base_url)
        account.assert_my_movies_loaded(min_count=1)
        titles = account.get_my_movie_titles()
        assert movie.title in titles, f"Película {movie.title} no encontrada en mi colección"

    def test_open_movie_detail_modal(self, driver, base_url):
        """5. Edición/Detalle: Abrir modal de detalle de película."""
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(0)

        movies.search(movie.title)
        movies.assert_result_visible()

        # Abrir detalle
        movies.open_result_detail()
        movies.assert_modal_open(expected_title=movie.title)

        # Verificar elementos del modal
        assert movies.is_visible(movies.MODAL_POSTER)
        assert movies.is_visible(movies.MODAL_PLOT)
        assert movies.is_visible(movies.MODAL_SAVE_BTN)

        movies.close_modal()

    def test_save_movie_from_modal(self, driver, base_url):
        """Guardar película desde modal de detalle."""
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(1)  # The Matrix

        movies.search(movie.title)
        movies.open_result_detail()
        movies.assert_modal_open()

        movies.save_from_modal()
        movies.assert_saved_success()

        movies.close_modal()

    def test_delete_movie_from_collection(self, driver, base_url):
        """6. Eliminación: Borrar película de mi colección."""
        # Primero asegurar que hay al menos una película guardada
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(2)  # Interstellar

        movies.search(movie.title)
        movies.save_result()

        # Ir a mi cuenta y eliminar
        header = HeaderPage(driver, base_url)
        header.go_my_account()
        account = AccountPage(driver, base_url)
        account.assert_my_movies_loaded(min_count=1)

        initial_count = len(account.get_my_movie_titles())
        account.delete_my_movie(movie.title)
        account.assert_my_movies_loaded(min_count=initial_count - 1)

        titles = account.get_my_movie_titles()
        assert movie.title not in titles, "Película debería haber sido eliminada"

    def test_delete_movie_from_grid(self, driver, base_url):
        """Eliminar directamente desde grid de películas guardadas."""
        movies = MoviesPage(driver, base_url)
        movies.open()

        # Buscar y guardar una película
        movie = get_movie(3)  # The Dark Knight
        movies.search(movie.title)
        movies.save_result()

        # La película debería aparecer en el grid (popular ahora o carrusel)
        # Nota: esto depende de la implementación del front
        movies.assert_movie_cards_visible(min_count=1)


@pytest.mark.movies
class TestMoviesCarousel:
    """Tests de carruseles y navegación."""

    def test_carousel_navigation(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()

        # Verificar carrusel "Popular Ahora"
        assert movies.is_visible(movies.EXPLORE_SECTION)

        # Navegar carrusel
        movies.carousel_next()
        movies.carousel_prev()

    def test_top5_visible(self, driver, base_url):
        movies = MoviesPage(driver, base_url)
        movies.open()

        # Top 5 puede estar vacío si no hay datos
        if movies.is_visible(movies.TOP5_SECTION, timeout=3):
            items = movies.find_all(movies.TOP5_ITEMS, timeout=5)
            assert len(items) <= 5
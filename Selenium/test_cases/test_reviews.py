"""
Tests de Reseñas (CRUD en modal compartido).
"""
import pytest
from page_objects import MoviesPage, AuthPage
from data.test_data import get_user, get_movie
import time


@pytest.mark.reviews
class TestReviews:
    """Tests de reseñas en películas."""

    @pytest.fixture(autouse=True)
    def login_user(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)
        yield

    def test_write_review_from_modal(self, driver, base_url):
        """Escribir y publicar reseña."""
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(0)

        movies.search(movie.title)
        movies.open_result_detail()
        movies.assert_modal_open()

        # Abrir reseñas
        movies.open_reviews_from_modal()
        assert movies.is_visible(movies.REVIEWS_MODAL)

        # Escribir reseña
        review_text = f"Esta es una reseña de prueba automatizada {int(time.time())}. La película es excelente, la recomiendo mucho."
        movies.write_review(review_text)

        # Verificar que se publicó
        movies.assert_review_published(text_fragment="prueba automatizada")

    def test_vote_review(self, driver, base_url):
        """Votar una reseña (upvote)."""
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(1)

        movies.search(movie.title)
        movies.open_result_detail()
        movies.open_reviews_from_modal()

        # Si hay reseñas, votar la primera
        if movies.is_visible(movies.REVIEW_ITEMS, timeout=3):
            movies.vote_review(0, up=True)
            # Verificar que el voto se registró (UI debería actualizar)

    def test_cancel_review(self, driver, base_url):
        """Cancelar escritura de reseña."""
        movies = MoviesPage(driver, base_url)
        movies.open()
        movie = get_movie(2)

        movies.search(movie.title)
        movies.open_result_detail()
        movies.open_reviews_from_modal()

        # Empezar a escribir
        movies.type(movies.REVIEW_TEXTAREA, "Reseña que se cancela...")
        # Cancelar
        movies.cancel_review()
        # El formulario debería ocultarse
        assert not movies.is_visible(movies.REVIEW_TEXTAREA, timeout=2)
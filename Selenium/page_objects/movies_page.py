"""
Page Object para la página de Películas (búsqueda, filtros, guardado, colección).
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from page_objects.base_page import BasePage, AssertionHelper
import time


class MoviesPage(BasePage):
    """Page Object para /peliculas."""

    # Selectores
    PAGE_TITLE = (By.CSS_SELECTOR, '.page-head h1')
    SEARCH_INPUT = (By.CSS_SELECTOR, '.search-form input[type="text"]')
    SEARCH_BTN = (By.CSS_SELECTOR, '.search-form button[type="submit"]')
    YEAR_FILTER = (By.CSS_SELECTOR, '.filter input[type="number"]')
    RATING_FILTER = (By.CSS_SELECTOR, '.filter select')
    GENRE_FILTER = (By.CSS_SELECTOR, '.filter select')
    SORT_FILTER = (By.CSS_SELECTOR, '.filter select:last-of-type')
    CLEAR_FILTERS_BTN = (By.CSS_SELECTOR, '.filters .btn-ghost')

    # Resultado exacto
    RESULT_CARD = (By.CSS_SELECTOR, '.result')
    RESULT_POSTER = (By.CSS_SELECTOR, '.result .poster')
    RESULT_TITLE = (By.CSS_SELECTOR, '.result-info h2')
    RESULT_PLOT = (By.CSS_SELECTOR, '.result-info p')
    RESULT_SAVE_BTN = (By.CSS_SELECTOR, '.result-actions .btn-primary')
    RESULT_DISMISS_BTN = (By.CSS_SELECTOR, '.result-actions .btn-ghost')

    # Grid / Carrusel
    MOVIE_CARDS = (By.CSS_SELECTOR, '.movie-card')
    MOVIE_CARD_POSTER = (By.CSS_SELECTOR, '.movie-card-poster img')
    MOVIE_CARD_TITLE = (By.CSS_SELECTOR, '.movie-card h3')
    MOVIE_CARD_RATING = (By.CSS_SELECTOR, '.rating-badge')
    MOVIE_CARD_GENRE = (By.CSS_SELECTOR, '.movie-genre')
    MOVIE_CARD_DELETE_BTN = (By.CSS_SELECTOR, '.delete-btn')

    # Explora / Carrusel resultados
    EXPLORE_SECTION = (By.CSS_SELECTOR, '.carousel-section')
    EXPLORE_TITLE = (By.CSS_SELECTOR, '.carousel-section h2')
    CAROUSEL_TRACK = (By.CSS_SELECTOR, '.carousel-track')
    CAROUSEL_PREV = (By.CSS_SELECTOR, '.carousel-controls button:first-child')
    CAROUSEL_NEXT = (By.CSS_SELECTOR, '.carousel-controls button:last-child')

    # Top 5
    TOP5_SECTION = (By.CSS_SELECTOR, '.toprank-section')
    TOP5_ITEMS = (By.CSS_SELECTOR, '.toprank-item')

    # Mensajes
    ERROR_MSG = (By.CSS_SELECTOR, '.error')
    SUCCESS_MSG = (By.CSS_SELECTOR, '.success')
    LOADING = (By.CSS_SELECTOR, '.muted:contains("Cargando")')
    LOADING_DETAILS = (By.CSS_SELECTOR, '.muted:contains("detalles")')

    # Modal detalle
    MODAL_BACKDROP = (By.CSS_SELECTOR, '.modal-backdrop')
    MODAL = (By.CSS_SELECTOR, '.modal')
    MODAL_CLOSE = (By.CSS_SELECTOR, '.modal-close')
    MODAL_POSTER = (By.CSS_SELECTOR, '.modal-content img')
    MODAL_TITLE = (By.CSS_SELECTOR, '.modal-content h2')
    MODAL_PLOT = (By.CSS_SELECTOR, '.modal-content p')
    MODAL_SAVE_BTN = (By.CSS_SELECTOR, '.modal-content .btn-primary')
    MODAL_REVIEWS_BTN = (By.CSS_SELECTOR, '.modal-content .btn-ghost:contains("Reseñas")')

    # Modal reseñas
    REVIEWS_MODAL = (By.CSS_SELECTOR, '.modal-reviews')
    REVIEW_TEXTAREA = (By.CSS_SELECTOR, '.review-form textarea')
    PUBLISH_REVIEW_BTN = (By.CSS_SELECTOR, '.review-form .btn-primary')
    CANCEL_REVIEW_BTN = (By.CSS_SELECTOR, '.review-form .btn-ghost')
    REVIEW_ITEMS = (By.CSS_SELECTOR, '.review-item')
    VOTE_UP_BTN = (By.CSS_SELECTOR, '.vote-btn:first-child')
    VOTE_DOWN_BTN = (By.CSS_SELECTOR, '.vote-btn:nth-child(2)')

    def __init__(self, driver, base_url=None):
        super().__init__(driver, base_url)

    def open(self):
        """Abre la página de películas."""
        super().open("peliculas")
        self.wait.until(EC.visibility_of_element_located(self.PAGE_TITLE))
        return self

    # --- Búsqueda ---
    def search(self, query, year=None, min_rating=None, genre=None, sort=None):
        """Realiza búsqueda con filtros opcionales."""
        self.type(self.SEARCH_INPUT, query)
        if year:
            self.type(self.YEAR_FILTER, str(year))
        if min_rating:
            self.driver.find_element(*self.RATING_FILTER).send_keys(str(min_rating))
        if genre:
            self.driver.find_element(*self.GENRE_FILTER).send_keys(genre)
        if sort:
            self.driver.find_element(*self.SORT_FILTER).send_keys(sort)
        self.click(self.SEARCH_BTN)
        self.wait.until(lambda d: not self.is_visible(self.LOADING, timeout=2))
        return self

    def clear_filters(self):
        """Limpia todos los filtros."""
        if self.is_visible(self.CLEAR_FILTERS_BTN, timeout=2):
            self.click(self.CLEAR_FILTERS_BTN)
        return self

    def clear_search(self):
        """Limpia solo el input de búsqueda."""
        self.driver.find_element(*self.SEARCH_INPUT).clear()
        return self

    # --- Resultado exacto ---
    def assert_result_visible(self, expected_title=None):
        AssertionHelper.assert_visible(self, self.RESULT_CARD, "Debe mostrar resultado exacto")
        if expected_title:
            AssertionHelper.assert_text_contains(self, self.RESULT_TITLE, expected_title, "Título de resultado no coincide")
        return self

    def assert_result_not_visible(self):
        AssertionHelper.assert_not_visible(self, self.RESULT_CARD, "No debe mostrar resultado exacto")
        return self

    def save_result(self):
        """Guarda la película del resultado exacto."""
        self.click(self.RESULT_SAVE_BTN)
        self.wait.until(EC.visibility_of_element_located(self.SUCCESS_MSG))
        return self

    def dismiss_result(self):
        """Descarta el resultado exacto."""
        self.click(self.RESULT_DISMISS_BTN)
        return self

    def open_result_detail(self):
        """Clic en el póster del resultado para abrir modal."""
        self.click(self.RESULT_POSTER)
        self.wait.until(EC.visibility_of_element_located(self.MODAL))
        return self

    # --- Grid / Carrusel ---
    def assert_movie_cards_visible(self, min_count=1):
        cards = self.find_all(self.MOVIE_CARDS, timeout=10)
        assert len(cards) >= min_count, f"Esperadas al menos {min_count} tarjetas, encontradas {len(cards)}"
        return self

    def get_movie_card_titles(self):
        """Retorna lista de títulos de tarjetas visibles."""
        cards = self.find_all(self.MOVIE_CARDS)
        return [card.find_element(*self.MOVIE_CARD_TITLE).text for card in cards]

    def click_movie_card(self, title_or_index):
        """Clic en una tarjeta por título o índice."""
        cards = self.find_all(self.MOVIE_CARDS)
        if isinstance(title_or_index, int):
            card = cards[title_or_index]
        else:
            for card in cards:
                if title_or_index.lower() in card.find_element(*self.MOVIE_CARD_TITLE).text.lower():
                    card.click()
                    break
            else:
                raise ValueError(f"Película '{title_or_index}' no encontrada")
        self.wait.until(EC.visibility_of_element_located(self.MODAL))
        return self

    def delete_saved_movie(self, title_or_index):
        """Elimina una película guardada (botón Eliminar en tarjeta)."""
        cards = self.find_all(self.MOVIE_CARDS)
        if isinstance(title_or_index, int):
            card = cards[title_or_index]
        else:
            for card in cards:
                if title_or_index.lower() in card.find_element(*self.MOVIE_CARD_TITLE).text.lower():
                    break
            else:
                raise ValueError(f"Película '{title_or_index}' no encontrada")
        delete_btn = card.find_element(*self.MOVIE_CARD_DELETE_BTN)
        delete_btn.click()
        self.wait.until(EC.visibility_of_element_located(self.SUCCESS_MSG))
        return self

    # --- Carrusel navegación ---
    def carousel_next(self):
        self.click(self.CAROUSEL_NEXT)
        time.sleep(0.5)
        return self

    def carousel_prev(self):
        self.click(self.CAROUSEL_PREV)
        time.sleep(0.5)
        return self

    # --- Modal detalle ---
    def assert_modal_open(self, expected_title=None):
        AssertionHelper.assert_visible(self, self.MODAL, "Modal debe estar abierto")
        if expected_title:
            AssertionHelper.assert_text_contains(self, self.MODAL_TITLE, expected_title, "Título modal no coincide")
        return self

    def close_modal(self):
        self.click(self.MODAL_CLOSE)
        self.wait.until(EC.invisibility_of_element_located(self.MODAL))
        return self

    def save_from_modal(self):
        self.click(self.MODAL_SAVE_BTN)
        self.wait.until(EC.visibility_of_element_located(self.SUCCESS_MSG))
        return self

    def open_reviews_from_modal(self):
        self.click(self.MODAL_REVIEWS_BTN)
        self.wait.until(EC.visibility_of_element_located(self.REVIEWS_MODAL))
        return self

    # --- Reseñas ---
    def write_review(self, text, rating=None):
        """Escribe y publica una reseña."""
        self.type(self.REVIEW_TEXTAREA, text)
        self.click(self.PUBLISH_REVIEW_BTN)
        self.wait.until(EC.invisibility_of_element_located(self.REVIEW_TEXTAREA))
        return self

    def cancel_review(self):
        self.click(self.CANCEL_REVIEW_BTN)
        return self

    def assert_review_published(self, text_fragment=None):
        AssertionHelper.assert_visible(self, self.REVIEW_ITEMS, "Debe haber al menos una reseña")
        if text_fragment:
            reviews = self.find_all(self.REVIEW_ITEMS)
            found = any(text_fragment in r.text for r in reviews)
            assert found, f"Reseña con texto '{text_fragment}' no encontrada"
        return self

    def vote_review(self, review_index=0, up=True):
        """Vota una reseña (up/down)."""
        reviews = self.find_all(self.REVIEW_ITEMS)
        if up:
            reviews[review_index].find_element(*self.VOTE_UP_BTN).click()
        else:
            reviews[review_index].find_element(*self.VOTE_DOWN_BTN).click()
        time.sleep(0.5)
        return self

    # --- Assertions generales ---
    def assert_on_movies_page(self):
        AssertionHelper.assert_text_contains(self, self.PAGE_TITLE, "Películas", "Debe estar en página Películas")
        return self

    def assert_search_results(self, min_count=1):
        self.assert_movie_cards_visible(min_count)
        return self

    def assert_no_results_message(self):
        # Buscar mensaje de "Sin resultados" o similar
        no_results = (By.XPATH, "//*[contains(text(), 'Sin resultados') or contains(text(), 'Nada coincide') or contains(text(), 'no hay')]")
        AssertionHelper.assert_visible(self, no_results, "Debe mostrar mensaje sin resultados")
        return self

    def assert_saved_success(self, expected_text="Guardada"):
        AssertionHelper.assert_visible(self, self.SUCCESS_MSG, "Debe mostrar mensaje de éxito")
        AssertionHelper.assert_text_contains(self, self.SUCCESS_MSG, expected_text, "Mensaje de éxito no coincide")
        return self
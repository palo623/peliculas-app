"""
Page Object para página de Cuenta (/cuenta) - colección personal, Top 5, etc.
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from page_objects.base_page import BasePage, AssertionHelper


class AccountPage(BasePage):
    """Page Object para /cuenta (requiere login)."""

    # Selectores
    PAGE_TITLE = (By.CSS_SELECTOR, '.page-head h1, h1:contains("Mi cuenta")')
    TABS = (By.CSS_SELECTOR, '.tabs .tab')
    TAB_PELICULAS = (By.CSS_SELECTOR, '.tab:contains("Películas")')
    TAB_SERIES = (By.CSS_SELECTOR, '.tab:contains("Series")')
    TAB_TOP5 = (By.CSS_SELECTOR, '.tab:contains("Top 5")')

    # Películas guardadas
    MY_MOVIES_GRID = (By.CSS_SELECTOR, '.movies-grid')
    MY_MOVIE_CARDS = (By.CSS_SELECTOR, '.movie-card')
    MY_MOVIE_DELETE_BTN = (By.CSS_SELECTOR, '.delete-btn')

    # Top 5
    TOP5_LIST = (By.CSS_SELECTOR, '.top5-list, .toprank-track')
    TOP5_ITEMS = (By.CSS_SELECTOR, '.top5-item, .toprank-item')
    TOP5_ADD_BTN = (By.CSS_SELECTOR, '.btn-primary:contains("Añadir"), .btn-primary:contains("Editar")')

    # Mensajes
    EMPTY_STATE = (By.CSS_SELECTOR, '.muted:contains("No tienes"), .muted:contains("vacía")')
    SUCCESS_MSG = (By.CSS_SELECTOR, '.success')
    ERROR_MSG = (By.CSS_SELECTOR, '.error')

    def __init__(self, driver, base_url=None):
        super().__init__(driver, base_url)

    def open(self):
        super().open("cuenta")
        self.wait.until(EC.visibility_of_element_located(self.TABS))
        return self

    def go_to_movies_tab(self):
        self.click(self.TAB_PELICULAS)
        return self

    def go_to_series_tab(self):
        self.click(self.TAB_SERIES)
        return self

    def go_to_top5_tab(self):
        self.click(self.TAB_TOP5)
        return self

    def assert_my_movies_loaded(self, min_count=0):
        self.go_to_movies_tab()
        if min_count == 0:
            # Puede mostrar estado vacío
            if self.is_visible(self.EMPTY_STATE, timeout=3):
                return self
        cards = self.find_all(self.MY_MOVIE_CARDS, timeout=10)
        assert len(cards) >= min_count, f"Esperadas al menos {min_count} películas, encontradas {len(cards)}"
        return self

    def get_my_movie_titles(self):
        self.go_to_movies_tab()
        cards = self.find_all(self.MY_MOVIE_CARDS)
        return [card.find_element(By.CSS_SELECTOR, 'h3').text for card in cards]

    def delete_my_movie(self, title_or_index):
        self.go_to_movies_tab()
        cards = self.find_all(self.MY_MOVIE_CARDS)
        if isinstance(title_or_index, int):
            card = cards[title_or_index]
        else:
            for card in cards:
                if title_or_index.lower() in card.find_element(By.CSS_SELECTOR, 'h3').text.lower():
                    break
            else:
                raise ValueError(f"Película '{title_or_index}' no encontrada en mi colección")
        delete_btn = card.find_element(*self.MY_MOVIE_DELETE_BTN)
        delete_btn.click()
        self.wait.until(EC.visibility_of_element_located(self.SUCCESS_MSG))
        return self

    def assert_top5_loaded(self):
        self.go_to_top5_tab()
        # Verificar que la sección Top 5 está visible
        AssertionHelper.assert_visible(self, self.TOP5_LIST, "Top 5 debe ser visible")
        return self

    def assert_on_account_page(self):
        AssertionHelper.assert_visible(self, self.TABS, "Debe estar en página Mi Cuenta (tabs visible)")
        return self
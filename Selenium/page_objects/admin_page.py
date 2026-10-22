"""
Page Object para el panel de Administración (/admin).
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from page_objects.base_page import BasePage, AssertionHelper


class AdminPage(BasePage):
    """Page Object para /admin (requiere rol admin)."""

    # Selectores
    DASHBOARD = (By.CSS_SELECTOR, '.admin-dashboard')
    HEADER_TITLE = (By.CSS_SELECTOR, 'header h2')
    HEADER_DESC = (By.CSS_SELECTOR, 'header p.lead')

    # Stats cards
    STATS_CARDS = (By.CSS_SELECTOR, '.card.h-100')
    STAT_CARD_TITLE = (By.CSS_SELECTOR, '.card-title')
    STAT_CARD_VALUE = (By.CSS_SELECTOR, '.card-text.fw-bold')

    # Gestión section
    MANAGEMENT_SECTION = (By.CSS_SELECTOR, 'section.bg-light')
    MANAGEMENT_CARDS = (By.CSS_SELECTOR, 'section.bg-light .card')
    MANAGEMENT_CARD_TITLES = (By.CSS_SELECTOR, 'section.bg-light .card-title')

    # Actividad reciente
    ACTIVITY_SECTION = (By.CSS_SELECTOR, 'section:has(table)')
    ACTIVITY_TABLE = (By.CSS_SELECTOR, 'table.table')
    ACTIVITY_ROWS = (By.CSS_SELECTOR, 'table.table tbody tr')
    ACTIVITY_HEADERS = (By.CSS_SELECTOR, 'table.table thead th')

    def __init__(self, driver, base_url=None):
        super().__init__(driver, base_url)

    def open(self):
        """Abre el panel de administración."""
        super().open("admin")
        self.wait.until(EC.visibility_of_element_located(self.DASHBOARD))
        return self

    # --- Assertions ---
    def assert_admin_dashboard_loaded(self):
        AssertionHelper.assert_visible(self, self.DASHBOARD, "Dashboard admin debe cargar")
        AssertionHelper.assert_text_contains(self, self.HEADER_TITLE, "Panel de Administración", "Título incorrecto")
        return self

    def assert_stats_cards(self, expected_count=4):
        cards = self.find_all(self.STATS_CARDS, timeout=10)
        assert len(cards) == expected_count, f"Esperadas {expected_count} cards de stats, encontradas {len(cards)}"
        # Verificar títulos esperados
        titles = [card.find_element(*self.STAT_CARD_TITLE).text for card in cards]
        expected_titles = ["Total de Usuarios", "Total de Reseñas", "Reviews Positivas", "Reviews Negativas"]
        for exp in expected_titles:
            assert any(exp in t for t in titles), f"Falta card: {exp}"
        return self

    def assert_management_section(self):
        AssertionHelper.assert_visible(self, self.MANAGEMENT_SECTION, "Sección Gestión debe estar visible")
        cards = self.find_all(self.MANAGEMENT_CARDS)
        assert len(cards) == 4, f"Esperadas 4 cards de gestión, encontradas {len(cards)}"
        titles = [card.find_element(*self.MANAGEMENT_CARD_TITLES).text for card in cards]
        expected = ["Gestión de Reviews", "Estadísticas", "Análisis de Sentimiento", "Gestión de Usuarios"]
        for exp in expected:
            assert any(exp in t for t in titles), f"Falta card de gestión: {exp}"
        return self

    def assert_activity_table(self, min_rows=1):
        AssertionHelper.assert_visible(self, self.ACTIVITY_TABLE, "Tabla de actividad debe estar visible")
        headers = self.find_all(self.ACTIVITY_HEADERS)
        header_texts = [h.text for h in headers]
        assert "Usuario" in header_texts and "Acción" in header_texts and "Fecha" in header_texts, "Headers incorrectos"
        rows = self.find_all(self.ACTIVITY_ROWS)
        assert len(rows) >= min_rows, f"Esperadas al menos {min_rows} filas de actividad, encontradas {len(rows)}"
        return self

    def get_stats(self):
        """Retorna dict con valores de stats."""
        cards = self.find_all(self.STATS_CARDS)
        stats = {}
        for card in cards:
            title = card.find_element(*self.STAT_CARD_TITLE).text
            value = card.find_element(*self.STAT_CARD_VALUE).text
            stats[title] = value
        return stats

    def assert_access_denied(self):
        """Verifica que se muestra error 403 o redirección."""
        # Si no es admin, debería redirigir o mostrar error
        current_url = self.get_current_url()
        assert "admin" not in current_url or self.is_visible((By.CSS_SELECTOR, '.error'), timeout=3), \
            "Usuario sin permisos no debería acceder a /admin"
        return self
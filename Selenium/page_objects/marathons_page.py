"""
Page Object para página de Maratones (/maratones).
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from page_objects.base_page import BasePage, AssertionHelper


class MarathonsPage(BasePage):
    """Page Object para /maratones."""

    # Selectores
    PAGE_TITLE = (By.CSS_SELECTOR, '.page-head h1, h1:contains("Maratones")')
    MARATHON_CARDS = (By.CSS_SELECTOR, '.marathon-card, .movie-card[data-marathon]')
    MARATHON_CARD_TITLE = (By.CSS_SELECTOR, 'h3, .marathon-title')
    MARATHON_CARD_PROGRESS = (By.CSS_SELECTOR, '.progress-bar, .marathon-progress')
    MARATHON_CARD_LOCKED = (By.CSS_SELECTOR, '.locked, .candado')
    MARATHON_DETAIL_BTN = (By.CSS_SELECTOR, '.btn-primary:contains("Ver"), .btn-primary:contains("Continuar")')

    # Detalle de maratón
    MARATHON_DETAIL = (By.CSS_SELECTOR, '.marathon-detail')
    MARATHON_ITEMS = (By.CSS_SELECTOR, '.marathon-item, .item-row')
    MARATHON_ITEM_WATCHED = (By.CSS_SELECTOR, '.watched, .check')
    MARATHON_ITEM_LOCKED = (By.CSS_SELECTOR, '.locked')
    MARATHON_ITEM_UNLOCKABLE = (By.CSS_SELECTOR, '.unlockable')
    MARATHON_ITEM_CAN_UNMARK = (By.CSS_SELECTOR, '.can-unmark')
    MARATHON_MARK_WATCHED_BTN = (By.CSS_SELECTOR, '.btn-primary:contains("Marcar"), button:contains("Marcar como vista")')
    MARATHON_UNMARK_BTN = (By.CSS_SELECTOR, '.btn-ghost:contains("Desmarcar")')
    MARATHON_RESET_BTN = (By.CSS_SELECTOR, '.btn-ghost:contains("Reiniciar")')

    # Achievements
    ACHIEVEMENTS_SECTION = (By.CSS_SELECTOR, '.achievements, .logros')
    ACHIEVEMENT_ITEMS = (By.CSS_SELECTOR, '.achievement-item, .badge')

    def __init__(self, driver, base_url=None):
        super().__init__(driver, base_url)

    def open(self):
        super().open("maratones")
        self.wait.until(EC.visibility_of_element_located(self.PAGE_TITLE))
        return self

    def assert_marathons_loaded(self, min_count=1):
        cards = self.find_all(self.MARATHON_CARDS, timeout=10)
        assert len(cards) >= min_count, f"Esperadas al menos {min_count} maratones, encontradas {len(cards)}"
        return self

    def open_marathon(self, title_or_index):
        cards = self.find_all(self.MARATHON_CARDS)
        if isinstance(title_or_index, int):
            card = cards[title_or_index]
        else:
            for card in cards:
                if title_or_index.lower() in card.find_element(*self.MARATHON_CARD_TITLE).text.lower():
                    break
            else:
                raise ValueError(f"Maratón '{title_or_index}' no encontrada")
        card.click()
        self.wait.until(EC.visibility_of_element_located(self.MARATHON_DETAIL))
        return self

    def assert_marathon_detail_open(self):
        AssertionHelper.assert_visible(self, self.MARATHON_DETAIL, "Detalle de maratón debe abrirse")
        return self

    def mark_next_as_watched(self):
        """Marca el siguiente item pendiente como visto."""
        self.click(self.MARATHON_MARK_WATCHED_BTN)
        self.wait.until(lambda d: self.is_visible(self.MARATHON_ITEM_WATCHED, timeout=2))
        return self

    def assert_item_watched(self, item_index=0):
        items = self.find_all(self.MARATHON_ITEMS)
        item = items[item_index]
        AssertionHelper.assert_visible(item.find_element(*self.MARATHON_ITEM_WATCHED), f"Item {item_index} debe estar marcado como visto")
        return self

    def assert_item_locked(self, item_index=1):
        items = self.find_all(self.MARATHON_ITEMS)
        item = items[item_index]
        AssertionHelper.assert_visible(item.find_element(*self.MARATHON_ITEM_LOCKED), f"Item {item_index} debe estar bloqueado")
        return self

    def assert_item_unlockable(self, item_index=0):
        items = self.find_all(self.MARATHON_ITEMS)
        item = items[item_index]
        AssertionHelper.assert_visible(item.find_element(*self.MARATHON_ITEM_UNLOCKABLE), f"Item {item_index} debe estar desbloqueable")
        return self

    def unmark_last_watched(self):
        self.click(self.MARATHON_UNMARK_BTN)
        return self

    def reset_marathon(self):
        self.click(self.MARATHON_RESET_BTN)
        # Confirmar en modal si aparece
        try:
            confirm = (By.CSS_SELECTOR, '.modal .btn-primary')
            self.click(confirm)
        except:
            pass
        return self

    def assert_achievements_visible(self, min_count=0):
        AssertionHelper.assert_visible(self, self.ACHIEVEMENTS_SECTION, "Sección logros debe ser visible")
        if min_count > 0:
            items = self.find_all(self.ACHIEVEMENT_ITEMS)
            assert len(items) >= min_count, f"Esperados al menos {min_count} logros"
        return self

    def assert_on_marathons_page(self):
        AssertionHelper.assert_text_contains(self, self.PAGE_TITLE, "Maratones", "Debe estar en página Maratones")
        return self
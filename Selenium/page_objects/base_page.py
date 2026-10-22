"""
Clase base para Page Objects.
Proporciona métodos comunes de navegación, esperas y utilidades.
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time


class BasePage:
    """Clase base para todos los Page Objects."""

    def __init__(self, driver, base_url=None):
        self.driver = driver
        self.base_url = base_url or getattr(driver, 'base_url', 'http://localhost:8080')
        self.wait = WebDriverWait(driver, 15)

    def open(self, path=""):
        """Navega a una ruta relativa a base_url."""
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        self.driver.get(url)
        return self

    def find(self, locator, timeout=10):
        """Espera y retorna un elemento."""
        return WebDriverWait(self.driver, timeout).until(
            EC.presence_of_element_located(locator)
        )

    def find_clickable(self, locator, timeout=10):
        """Espera y retorna un elemento clickeable."""
        return WebDriverWait(self.driver, timeout).until(
            EC.element_to_be_clickable(locator)
        )

    def find_visible(self, locator, timeout=10):
        """Espera y retorna un elemento visible."""
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located(locator)
        )

    def find_all(self, locator, timeout=10):
        """Espera y retorna todos los elementos que coincidan."""
        WebDriverWait(self.driver, timeout).until(
            EC.presence_of_all_elements_located(locator)
        )
        return self.driver.find_elements(*locator)

    def click(self, locator, timeout=10):
        """Clic en elemento (espera a que sea clickeable)."""
        element = self.find_clickable(locator, timeout)
        element.click()
        return self

    def type(self, locator, text, clear_first=True, timeout=10):
        """Escribe texto en un input."""
        element = self.find_clickable(locator, timeout)
        if clear_first:
            element.clear()
        element.send_keys(text)
        return self

    def get_text(self, locator, timeout=10):
        """Obtiene el texto de un elemento."""
        element = self.find_visible(locator, timeout)
        return element.text

    def get_attribute(self, locator, attribute, timeout=10):
        """Obtiene un atributo de un elemento."""
        element = self.find(locator, timeout)
        return element.get_attribute(attribute)

    def is_visible(self, locator, timeout=5):
        """Verifica si un elemento es visible."""
        try:
            self.find_visible(locator, timeout)
            return True
        except TimeoutException:
            return False

    def is_present(self, locator, timeout=5):
        """Verifica si un elemento está presente en el DOM."""
        try:
            self.find(locator, timeout)
            return True
        except TimeoutException:
            return False

    def wait_for_url_contains(self, substring, timeout=10):
        """Espera a que la URL contenga un substring."""
        WebDriverWait(self.driver, timeout).until(
            EC.url_contains(substring)
        )
        return self

    def wait_for_title(self, title, timeout=10):
        """Espera a que el título contenga un texto."""
        WebDriverWait(self.driver, timeout).until(
            EC.title_contains(title)
        )
        return self

    def get_current_url(self):
        """Retorna la URL actual."""
        return self.driver.current_url

    def refresh(self):
        """Recarga la página."""
        self.driver.refresh()
        return self

    def go_back(self):
        """Navega hacia atrás."""
        self.driver.back()
        return self

    def execute_script(self, script, *args):
        """Ejecuta JavaScript."""
        return self.driver.execute_script(script, *args)

    def scroll_to_element(self, locator):
        """Hace scroll hasta un elemento."""
        element = self.find(locator)
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        time.sleep(0.3)
        return self

    def take_screenshot(self, name):
        """Toma captura de pantalla."""
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{timestamp}.png"
        path = f"reports/screenshots/{filename}"
        self.driver.save_screenshot(path)
        return path


class AssertionHelper:
    """Helper para assertions comunes con mensajes descriptivos."""

    @staticmethod
    def assert_visible(page, locator, msg=None, timeout=5):
        assert page.is_visible(locator, timeout), msg or f"Elemento no visible: {locator}"

    @staticmethod
    def assert_not_visible(page, locator, msg=None, timeout=5):
        assert not page.is_visible(locator, timeout), msg or f"Elemento debería estar oculto: {locator}"

    @staticmethod
    def assert_text_contains(page, locator, expected_text, msg=None, timeout=5):
        actual = page.get_text(locator, timeout)
        assert expected_text in actual, msg or f"Texto '{expected_text}' no encontrado en '{actual}'"

    @staticmethod
    def assert_text_equals(page, locator, expected_text, msg=None, timeout=5):
        actual = page.get_text(locator, timeout)
        assert actual.strip() == expected_text.strip(), msg or f"Texto '{actual}' != '{expected_text}'"

    @staticmethod
    def assert_url_contains(page, substring, msg=None):
        actual = page.get_current_url()
        assert substring in actual, msg or f"URL '{actual}' no contiene '{substring}'"

    @staticmethod
    def assert_element_count(page, locator, expected_count, msg=None, timeout=5):
        elements = page.find_all(locator, timeout)
        actual_count = len(elements)
        assert actual_count == expected_count, msg or f"Esperados {expected_count} elementos, encontrados {actual_count}"

    @staticmethod
    def assert_attribute_equals(page, locator, attribute, expected_value, msg=None, timeout=5):
        actual = page.get_attribute(locator, attribute, timeout)
        assert actual == expected_value, msg or f"Atributo {attribute}='{actual}' != '{expected_value}'"

    @staticmethod
    def assert_page_loaded(page, expected_title_part=None, expected_url_part=None):
        if expected_title_part:
            AssertionHelper.assert_text_contains(
                page, (By.TAG_NAME, "title"), expected_title_part, "Título de página incorrecto"
            )
        if expected_url_part:
            AssertionHelper.assert_url_contains(page, expected_url_part, "URL de página incorrecta")
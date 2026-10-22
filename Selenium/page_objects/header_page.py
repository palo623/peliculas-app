"""
Page Object para el Header y navegación principal.
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from page_objects.base_page import BasePage, AssertionHelper


class HeaderPage(BasePage):
    """Page Object para el header/site-header."""

    # Selectores
    LOGO = (By.CSS_SELECTOR, '.logo')
    NAV_HOME = (By.CSS_SELECTOR, '.nav-link[onclick*="home"], .nav-link:contains("Inicio")')
    NAV_MOVIES = (By.CSS_SELECTOR, '.nav-link[onclick*="peliculas"], .nav-link:contains("Películas")')
    NAV_SERIES = (By.CSS_SELECTOR, '.nav-link[onclick*="series"], .nav-link:contains("Series")')
    NAV_MARATHONS = (By.CSS_SELECTOR, '.nav-link[onclick*="maratones"], .nav-link:contains("Maratones")')
    NAV_LOGIN = (By.CSS_SELECTOR, '.nav-link[onclick*="auth"], .nav-cta:contains("Entrar")')
    NAV_LOGOUT = (By.CSS_SELECTOR, '.nav-link:contains("Salir")')
    USER_CHIP = (By.CSS_SELECTOR, '.user-chip')
    USER_DROPDOWN = (By.CSS_SELECTOR, '.user-dropdown')
    DROPDOWN_MY_ACCOUNT = (By.CSS_SELECTOR, '.dropdown-item[onclick*="cuenta"]')
    DROPDOWN_MY_PROFILE = (By.CSS_SELECTOR, '.dropdown-item[onclick*="perfil"]')
    DROPDOWN_FRIENDS = (By.CSS_SELECTOR, '.dropdown-item[onclick*="amigos"]')
    DROPDOWN_SETTINGS = (By.CSS_SELECTOR, '.dropdown-item[onclick*="configuracion"]')
    DROPDOWN_ADMIN = (By.CSS_SELECTOR, '.dropdown-item[onclick*="admin"]')
    DROPDOWN_LOGOUT = (By.CSS_SELECTOR, '.dropdown-item.danger')
    MOBILE_MENU_TOGGLE = (By.CSS_SELECTOR, '.menu-toggle')
    MOBILE_NAV = (By.CSS_SELECTOR, '.main-nav.open')

    def __init__(self, driver, base_url=None):
        super().__init__(driver, base_url)

    # --- Navegación principal ---
    def go_home(self):
        self.click(self.NAV_HOME)
        self.wait_for_url_contains("", timeout=10)
        return self

    def go_movies(self):
        self.click(self.NAV_MOVIES)
        self.wait_for_url_contains("peliculas", timeout=10)
        return self

    def go_series(self):
        self.click(self.NAV_SERIES)
        self.wait_for_url_contains("series", timeout=10)
        return self

    def go_marathons(self):
        self.click(self.NAV_MARATHONS)
        self.wait_for_url_contains("maratones", timeout=10)
        return self

    def go_login(self):
        self.click(self.NAV_LOGIN)
        self.wait_for_url_contains("auth", timeout=10)
        return self

    def logout_via_nav(self):
        """Logout directo desde nav (si visible)."""
        self.click(self.NAV_LOGOUT)
        self.wait_for_url_contains("", timeout=10)
        return self

    # --- Menú de usuario ---
    def open_user_menu(self):
        """Abre el dropdown del usuario."""
        self.click(self.USER_CHIP)
        self.wait.until(EC.visibility_of_element_located(self.USER_DROPDOWN))
        return self

    def close_user_menu(self):
        """Cierra el dropdown (clic fuera)."""
        self.click(self.LOGO)
        return self

    def go_my_account(self):
        self.open_user_menu()
        self.click(self.DROPDOWN_MY_ACCOUNT)
        self.wait_for_url_contains("cuenta", timeout=10)
        return self

    def go_my_profile(self):
        self.open_user_menu()
        self.click(self.DROPDOWN_MY_PROFILE)
        self.wait_for_url_contains("perfil", timeout=10)
        return self

    def go_friends(self):
        self.open_user_menu()
        self.click(self.DROPDOWN_FRIENDS)
        self.wait_for_url_contains("amigos", timeout=10)
        return self

    def go_settings(self):
        self.open_user_menu()
        self.click(self.DROPDOWN_SETTINGS)
        self.wait_for_url_contains("configuracion", timeout=10)
        return self

    def go_admin(self):
        self.open_user_menu()
        self.click(self.DROPDOWN_ADMIN)
        self.wait_for_url_contains("admin", timeout=10)
        return self

    def logout_via_dropdown(self):
        self.open_user_menu()
        self.click(self.DROPDOWN_LOGOUT)
        self.wait_for_url_contains("", timeout=10)
        return self

    # --- Mobile ---
    def toggle_mobile_menu(self):
        self.click(self.MOBILE_MENU_TOGGLE)
        return self

    def assert_mobile_menu_open(self):
        AssertionHelper.assert_visible(self, self.MOBILE_NAV, "Menú móvil debe estar abierto")
        return self

    # --- Assertions ---
    def assert_user_logged_in(self, nickname=None):
        """Verifica que hay usuario logueado (ve user-chip)."""
        AssertionHelper.assert_visible(self, self.USER_CHIP, "Usuario debe estar logueado (user-chip visible)")
        if nickname:
            AssertionHelper.assert_text_contains(self, self.USER_CHIP, nickname, f"Nickname debe ser {nickname}")
        return self

    def assert_user_not_logged_in(self):
        """Verifica que NO hay usuario logueado (ve botón Entrar)."""
        AssertionHelper.assert_visible(self, self.NAV_LOGIN, "Debe mostrar botón Entrar")
        AssertionHelper.assert_not_visible(self, self.USER_CHIP, "No debe mostrar user-chip")
        return self

    def assert_admin_visible(self):
        """Verifica que el enlace a Admin es visible en dropdown."""
        self.open_user_menu()
        AssertionHelper.assert_visible(self, self.DROPDOWN_ADMIN, "Enlace Admin debe ser visible para admins")
        return self

    def assert_admin_not_visible(self):
        """Verifica que el enlace a Admin NO es visible."""
        self.open_user_menu()
        AssertionHelper.assert_not_visible(self, self.DROPDOWN_ADMIN, "Enlace Admin no debe ser visible para usuarios normales")
        return self

    def assert_on_page(self, page_name):
        """Verifica que el nav-link correspondiente está activo."""
        active_selector = (By.CSS_SELECTOR, f'.nav-link.active:contains("{page_name}")')
        AssertionHelper.assert_visible(self, active_selector, f"Nav {page_name} debe estar activo")
        return self
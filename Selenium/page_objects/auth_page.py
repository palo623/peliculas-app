"""
Page Object para páginas de autenticación (Login, Registro, Recuperación).
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from page_objects.base_page import BasePage, AssertionHelper


class AuthPage(BasePage):
    """Page Object para flujos de autenticación."""

    # Selectores comunes
    AUTH_CARD = (By.CSS_SELECTOR, '.auth-card')
    AUTH_WRAP = (By.CSS_SELECTOR, '.auth-wrap')
    ERROR_MSG = (By.CSS_SELECTOR, '.error')
    SUCCESS_MSG = (By.CSS_SELECTOR, '.success')
    MUTED_TEXT = (By.CSS_SELECTOR, '.muted')

    # Botones de navegación entre modos
    SWITCH_TO_LOGIN = (By.CSS_SELECTOR, '.auth-switch button[onclick*="login"], .auth-switch button:contains("Entrar")')
    SWITCH_TO_REGISTER = (By.CSS_SELECTOR, '.auth-switch button[onclick*="register"], .auth-switch button:contains("Regístrate")')
    FORGOT_PASSWORD_LINK = (By.CSS_SELECTOR, '.auth-switch button[onclick*="forgot"], .auth-switch button:contains("Recuperar")')
    BACK_TO_LOGIN = (By.CSS_SELECTOR, '.auth-switch button[onclick*="back"], .auth-switch button:contains("Volver")')

    # Login form
    LOGIN_EMAIL = (By.CSS_SELECTOR, '.auth-field input[type="email"]')
    LOGIN_PASSWORD = (By.CSS_SELECTOR, '.auth-field input[type="password"]')
    LOGIN_SUBMIT = (By.CSS_SELECTOR, '.auth-card form .btn-primary[type="submit"]')
    GOOGLE_LOGIN_BTN = (By.CSS_SELECTOR, '.btn-google')
    GOOGLE_ICON = (By.CSS_SELECTOR, '.google-g')

    # Register form - Paso 1
    REGISTER_NAME = (By.CSS_SELECTOR, '.auth-field input[type="text"][placeholder*="nombre" i], .auth-field input[type="text"][autocomplete="name"]')
    REGISTER_EMAIL = (By.CSS_SELECTOR, '.auth-field input[type="email"]')
    REGISTER_PASSWORD = (By.CSS_SELECTOR, '.auth-field input[type="password"][placeholder*="mínimo" i], .auth-field input[type="password"][autocomplete="new-password"]')
    REGISTER_PASSWORD2 = (By.CSS_SELECTOR, '.auth-field input[type="password"][placeholder*="volver" i], .auth-field input[type="password"][autocomplete="new-password"]:last-of-type')
    REGISTER_NICKNAME = (By.CSS_SELECTOR, '.nickname-field input')
    REGISTER_NICKNAME_ERROR = (By.CSS_SELECTOR, '.nickname-field .error.hint')
    REGISTER_CONTINUE_BTN = (By.CSS_SELECTOR, 'form .btn-primary[type="submit"]')
    GOOGLE_REGISTER_BTN = (By.CSS_SELECTOR, '.btn-google')

    # Register form - Paso 2 (Cuestionario)
    STEP_INDICATOR = (By.CSS_SELECTOR, '.step-indicator')
    GENRE_CHIPS = (By.CSS_SELECTOR, '.genre-chip')
    GENRE_CHIP_SELECTED = (By.CSS_SELECTOR, '.genre-chip.selected')
    LIKES_MOVIES_YES = (By.CSS_SELECTOR, '.yn-buttons .yn-btn:first-child')
    LIKES_MOVIES_NO = (By.CSS_SELECTOR, '.yn-buttons .yn-btn:last-child')
    LIKES_SERIES_YES = (By.CSS_SELECTOR, 'fieldset:nth-of-type(3) .yn-btn:first-child')
    LIKES_SERIES_NO = (By.CSS_SELECTOR, 'fieldset:nth-of-type(3) .yn-btn:last-child')
    LIKES_MINISERIES_YES = (By.CSS_SELECTOR, 'fieldset:nth-of-type(4) .yn-btn:first-child')
    LIKES_MINISERIES_NO = (By.CSS_SELECTOR, 'fieldset:nth-of-type(4) .yn-btn:last-child')
    FINISH_BTN = (By.CSS_SELECTOR, 'form .btn-primary[type="submit"]')

    # Email verification / Password reset
    VERIFY_EMAIL_BTN = (By.CSS_SELECTOR, '.result-actions .btn-primary')
    RESEND_EMAIL_BTN = (By.CSS_SELECTOR, '.result-actions .btn-ghost')
    RESET_PASSWORD_NEW = (By.CSS_SELECTOR, '.auth-field input[type="password"]:first-of-type')
    RESET_PASSWORD_CONFIRM = (By.CSS_SELECTOR, '.auth-field input[type="password"]:last-of-type')
    RESET_PASSWORD_BTN = (By.CSS_SELECTOR, '.auth-card .btn-primary[type="submit"]')

    def __init__(self, driver, base_url=None):
        super().__init__(driver, base_url)

    # --- Navegación ---
    def go_to_login(self):
        """Navega a la página de login."""
        self.open("auth?mode=login")
        self.wait_for_login_form()
        return self

    def go_to_register(self):
        """Navega a la página de registro."""
        self.open("auth?mode=register")
        self.wait_for_register_form()
        return self

    def go_to_forgot_password(self):
        """Navega a recuperar contraseña."""
        self.open("auth?mode=forgot")
        self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.auth-card')))
        return self

    def click_switch_to_login(self):
        """Clic en 'Entrar' desde registro."""
        self.click(self.SWITCH_TO_LOGIN)
        self.wait_for_login_form()
        return self

    def click_switch_to_register(self):
        """Clic en 'Regístrate' desde login."""
        self.click(self.SWITCH_TO_REGISTER)
        self.wait_for_register_form()
        return self

    def click_forgot_password(self):
        """Clic en 'Recuperar contraseña'."""
        self.click(self.FORGOT_PASSWORD_LINK)
        self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.auth-card')))
        return self

    def click_back_to_login(self):
        """Clic en 'Volver a entrar'."""
        self.click(self.BACK_TO_LOGIN)
        self.wait_for_login_form()
        return self

    # --- Esperas ---
    def wait_for_login_form(self, timeout=10):
        self.wait.until(EC.visibility_of_element_located(self.LOGIN_EMAIL))
        self.wait.until(EC.visibility_of_element_located(self.LOGIN_PASSWORD))
        return self

    def wait_for_register_form(self, timeout=10):
        self.wait.until(EC.visibility_of_element_located(self.REGISTER_NAME))
        self.wait.until(EC.visibility_of_element_located(self.REGISTER_EMAIL))
        return self

    def wait_for_questionnaire(self, timeout=10):
        self.wait.until(EC.visibility_of_element_located(self.STEP_INDICATOR))
        self.wait.until(EC.visibility_of_element_located(self.GENRE_CHIPS))
        return self

    # --- Login ---
    def login(self, email, password):
        """Realiza login con email y contraseña."""
        self.type(self.LOGIN_EMAIL, email)
        self.type(self.LOGIN_PASSWORD, password)
        self.click(self.LOGIN_SUBMIT)
        # Esperar redirección a home o página principal
        self.wait_for_url_contains("", timeout=15)
        return self

    def login_with_google(self):
        """Inicia login con Google (abre popup)."""
        self.click(self.GOOGLE_LOGIN_BTN)
        return self

    # --- Registro ---
    def register_step1(self, name, email, password, nickname):
        """Completa paso 1 de registro."""
        self.type(self.REGISTER_NAME, name)
        self.type(self.REGISTER_EMAIL, email)
        self.type(self.REGISTER_PASSWORD, password)
        self.type(self.REGISTER_PASSWORD2, password)
        self.type(self.REGISTER_NICKNAME, nickname)
        # Esperar validación de nickname
        self.wait.until(lambda d: not self.is_visible(self.REGISTER_NICKNAME_ERROR, timeout=2))
        self.click(self.REGISTER_CONTINUE_BTN)
        self.wait_for_questionnaire()
        return self

    def register_with_google(self):
        """Registro con Google."""
        self.click(self.GOOGLE_REGISTER_BTN)
        return self

    def complete_questionnaire(self, genres=None, likes_movies=True, likes_series=True, likes_miniseries=True):
        """Completa el cuestionario de onboarding."""
        if genres:
            for genre in genres:
                chip = self.driver.find_element(By.XPATH, f"//button[contains(@class,'genre-chip') and text()='{genre}']")
                if 'selected' not in chip.get_attribute('class'):
                    chip.click()
        if likes_movies:
            self.click(self.LIKES_MOVIES_YES)
        else:
            self.click(self.LIKES_MOVIES_NO)
        if likes_series:
            self.click(self.LIKES_SERIES_YES)
        else:
            self.click(self.LIKES_SERIES_NO)
        if likes_miniseries:
            self.click(self.LIKES_MINISERIES_YES)
        else:
            self.click(self.LIKES_MINISERIES_NO)
        self.click(self.FINISH_BTN)
        self.wait_for_url_contains("", timeout=15)
        return self

    def verify_email_and_continue(self):
        """Clic en 'Ya he verificado mi correo'."""
        self.click(self.VERIFY_EMAIL_BTN)
        self.wait_for_url_contains("", timeout=15)
        return self

    # --- Assertions ---
    def assert_login_error(self, expected_text=None):
        AssertionHelper.assert_visible(self, self.ERROR_MSG, "Debe mostrar error de login")
        if expected_text:
            AssertionHelper.assert_text_contains(self, self.ERROR_MSG, expected_text, "Error de login no coincide")
        return self

    def assert_register_error(self, expected_text=None):
        AssertionHelper.assert_visible(self, self.ERROR_MSG, "Debe mostrar error de registro")
        if expected_text:
            AssertionHelper.assert_text_contains(self, self.ERROR_MSG, expected_text, "Error de registro no coincide")
        return self

    def assert_nickname_error(self, expected_text=None):
        AssertionHelper.assert_visible(self, self.REGISTER_NICKNAME_ERROR, "Debe mostrar error de nickname")
        if expected_text:
            AssertionHelper.assert_text_contains(self, self.REGISTER_NICKNAME_ERROR, expected_text, "Error de nickname no coincide")
        return self

    def assert_on_questionnaire(self):
        AssertionHelper.assert_visible(self, self.STEP_INDICATOR, "Debe estar en paso 2 (cuestionario)")
        AssertionHelper.assert_visible(self, self.GENRE_CHIPS, "Debe mostrar chips de géneros")
        return self

    def assert_logged_in(self):
        """Verifica que el usuario está logueado (ve user-chip en header)."""
        from page_objects.header_page import HeaderPage
        header = HeaderPage(self.driver, self.base_url)
        header.assert_user_logged_in()
        return self

    def assert_on_auth_page(self):
        AssertionHelper.assert_visible(self, self.AUTH_CARD, "Debe estar en página de auth")
        return self
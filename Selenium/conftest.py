"""
Configuración global de pytest para tests Selenium.
Fixtures, configuración de driver, screenshots en fallos, etc.
"""
import os
import pytest
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.firefox import GeckoDriverManager
from webdriver_manager.microsoft import EdgeChromiumDriverManager
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "http://localhost:8080")
BROWSER = os.getenv("BROWSER", "edge").lower()
HEADLESS = os.getenv("HEADLESS", "false").lower() == "true"
IMPLICIT_WAIT = int(os.getenv("IMPLICIT_WAIT", "10"))
PAGE_LOAD_TIMEOUT = int(os.getenv("PAGE_LOAD_TIMEOUT", "30"))

TEST_USER_EMAIL = os.getenv("TEST_USER_EMAIL", "testuser@example.com")
TEST_USER_PASSWORD = os.getenv("TEST_USER_PASSWORD", "TestPass123!")
ADMIN_USER_EMAIL = os.getenv("ADMIN_USER_EMAIL", "admin@example.com")
ADMIN_USER_PASSWORD = os.getenv("ADMIN_USER_PASSWORD", "AdminPass123!")


def get_driver(browser: str = BROWSER, headless: bool = HEADLESS):
    """Factory para crear WebDriver según configuración (Selenium 4 compatible)."""
    if browser == "chrome":
        options = ChromeOptions()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-extensions")
        options.add_experimental_option("excludeSwitches", ["enable-logging"])
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
    elif browser == "firefox":
        options = FirefoxOptions()
        if headless:
            options.add_argument("--headless")
        options.add_argument("--width=1920")
        options.add_argument("--height=1080")
        service = FirefoxService(GeckoDriverManager().install())
        driver = webdriver.Firefox(service=service, options=options)
    elif browser == "edge":
        options = EdgeOptions()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-extensions")
        options.add_argument("--inprivate")
        options.add_argument("--disable-web-security")
        options.add_argument("--disable-features=TranslateUI")
        options.add_argument("--disable-ipc-flooding-protection")
        options.add_argument("--no-first-run")
        options.add_argument("--no-default-browser-check")
        options.add_experimental_option("excludeSwitches", ["enable-logging", "enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        
        # Usar driver descargado manualmente (versión exacta para Edge 155)
        from webdriver_manager.microsoft import EdgeChromiumDriverManager
        driver_path = EdgeChromiumDriverManager(version="155.0.4283.62").install()
        service = EdgeService(driver_path)
        driver = webdriver.Edge(service=service, options=options)
    else:
        raise ValueError(f"Navegador no soportado: {browser}")

    driver.implicitly_wait(IMPLICIT_WAIT)
    driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    return driver


@pytest.fixture(scope="session")
def base_url():
    """URL base de la aplicación."""
    return BASE_URL


@pytest.fixture(scope="session")
def test_credentials():
    """Credenciales de prueba."""
    return {
        "user": {"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        "admin": {"email": ADMIN_USER_EMAIL, "password": ADMIN_USER_PASSWORD},
    }


@pytest.fixture(scope="function")
def driver(request):
    """Fixture de WebDriver por test (function scope para aislamiento)."""
    drv = get_driver()
    drv.base_url = BASE_URL

    def take_screenshot_on_failure():
        if hasattr(request.node, "rep_call") and request.node.rep_call.failed:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            test_name = request.node.name.replace("[", "_").replace("]", "_")
            screenshot_dir = os.path.join(os.path.dirname(__file__), "reports", "screenshots")
            os.makedirs(screenshot_dir, exist_ok=True)
            screenshot_path = os.path.join(screenshot_dir, f"{test_name}_{timestamp}.png")
            drv.save_screenshot(screenshot_path)
            print(f"\nScreenshot guardado: {screenshot_path}")

    request.addfinalizer(lambda: (take_screenshot_on_failure(), drv.quit()))
    return drv


@pytest.fixture(scope="function")
def wait(driver):
    """Fixture para WebDriverWait."""
    from selenium.webdriver.support.ui import WebDriverWait
    return WebDriverWait(driver, 15)


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Hook para capturar resultado del test y usarlo en fixture driver."""
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)


def pytest_configure(config):
    """Configuración adicional de pytest."""
    config.addinivalue_line("markers", "smoke: tests rápidos de humo")
    config.addinivalue_line("markers", "regression: tests de regresión completos")
    config.addinivalue_line("markers", "admin: tests que requieren usuario admin")
    config.addinivalue_line("markers", "auth: tests de autenticación")
    config.addinivalue_line("markers", "movies: tests de películas")
    config.addinivalue_line("markers", "marathons: tests de maratones")
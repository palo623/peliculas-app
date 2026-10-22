"""
Utilidades comunes para tests Selenium.
"""
import time
import os
from datetime import datetime
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException


def wait_for_ajax(driver, timeout=10):
    """Espera a que terminen las peticiones AJAX/fetch (si usa jQuery o similar)."""
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: d.execute_script("return typeof jQuery === 'undefined' || jQuery.active === 0")
        )
    except TimeoutException:
        pass  # No hay jQuery o no se pudo verificar


def wait_for_fetch(driver, timeout=10):
    """Espera aproximada para fetches (no hay forma estándar, usa sleep corto)."""
    time.sleep(0.5)


def safe_click(driver, locator, timeout=10):
    """Clic seguro con scroll y espera."""
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable(locator)
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    time.sleep(0.2)
    element.click()
    return element


def safe_type(driver, locator, text, clear=True, timeout=10):
    """Escritura segura con clear y verificación."""
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable(locator)
    )
    if clear:
        element.clear()
    element.send_keys(text)
    # Verificar que se escribió
    actual = element.get_attribute("value")
    assert actual == text, f"Texto no coincide: esperado '{text}', actual '{actual}'"
    return element


def get_element_text(driver, locator, timeout=10):
    """Obtiene texto de elemento de forma segura."""
    element = WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located(locator)
    )
    return element.text


def is_element_visible(driver, locator, timeout=5):
    """Verifica visibilidad sin excepción."""
    try:
        WebDriverWait(driver, timeout).until(
            EC.visibility_of_element_located(locator)
        )
        return True
    except TimeoutException:
        return False


def is_element_present(driver, locator, timeout=5):
    """Verifica presencia en DOM sin excepción."""
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located(locator)
        )
        return True
    except TimeoutException:
        return False


def take_screenshot(driver, test_name, suffix=""):
    """Toma screenshot con nombre descriptivo."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix_str = f"_{suffix}" if suffix else ""
    filename = f"{test_name}{suffix_str}_{timestamp}.png"
    screenshot_dir = os.path.join(os.path.dirname(__file__), "..", "reports", "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)
    path = os.path.join(screenshot_dir, filename)
    driver.save_screenshot(path)
    return path


def login_user(driver, base_url, email, password, auth_page_class=None):
    """Helper rápido para login."""
    if auth_page_class:
        auth_page = auth_page_class(driver, base_url)
        auth_page.go_to_login().login(email, password)
        return auth_page
    else:
        driver.get(f"{base_url}/auth?mode=login")
        WebDriverWait(driver, 10).until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.auth-field input[type="email"]')))
        driver.find_element(By.CSS_SELECTOR, '.auth-field input[type="email"]').send_keys(email)
        driver.find_element(By.CSS_SELECTOR, '.auth-field input[type="password"]').send_keys(password)
        driver.find_element(By.CSS_SELECTOR, '.auth-card form .btn-primary[type="submit"]').click()
        WebDriverWait(driver, 15).until(lambda d: "auth" not in d.current_url)


def logout_user(driver, base_url, header_page_class=None):
    """Helper rápido para logout."""
    if header_page_class:
        header = header_page_class(driver, base_url)
        header.logout_via_dropdown()
    else:
        # Intentar logout via header
        try:
            driver.find_element(By.CSS_SELECTOR, '.user-chip').click()
            WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.dropdown-item.danger')))
            driver.find_element(By.CSS_SELECTOR, '.dropdown-item.danger').click()
            WebDriverWait(driver, 10).until(lambda d: "auth" in d.current_url or d.current_url == base_url + "/")
        except:
            pass


def create_test_user_via_api(base_url, email, password, name, role="user"):
    """
    Crea usuario de prueba via API (requiere backend corriendo y modo local o admin token).
    Solo funciona en modo local (sin Firestore) o con token admin.
    """
    import requests
    try:
        # En modo local, usar seedLocalUser
        resp = requests.post(f"{base_url}/api/auth/seed-local", json={
            "email": email,
            "name": name,
            "role": role
        }, timeout=10)
        return resp.json()
    except Exception as e:
        print(f"No se pudo crear usuario via API: {e}")
        return None


def wait_for_url_change(driver, original_url, timeout=10):
    """Espera a que la URL cambie."""
    WebDriverWait(driver, timeout).until(
        lambda d: d.current_url != original_url
    )


def switch_to_window(driver, index=-1):
    """Cambia a ventana/pestaña por índice."""
    driver.switch_to.window(driver.window_handles[index])


def close_current_window(driver):
    """Cierra ventana actual y vuelve a la principal."""
    driver.close()
    driver.switch_to.window(driver.window_handles[0])


def execute_async_script(driver, script, *args):
    """Ejecuta script async y espera resultado."""
    return driver.execute_async_script(script, *args)


def get_local_storage(driver, key):
    """Obtiene valor de localStorage."""
    return driver.execute_script(f"return window.localStorage.getItem('{key}');")


def set_local_storage(driver, key, value):
    """Establece valor en localStorage."""
    driver.execute_script(f"window.localStorage.setItem('{key}', '{value}');")


def clear_local_storage(driver):
    """Limpia localStorage."""
    driver.execute_script("window.localStorage.clear();")


def get_session_token(driver):
    """Obtiene token de sesión de CineAIros."""
    return get_local_storage(driver, "cineairos_token")


def set_session_token(driver, token):
    """Establece token de sesión (útil para saltar login en tests)."""
    set_local_storage(driver, "cineairos_token", token)
    driver.refresh()
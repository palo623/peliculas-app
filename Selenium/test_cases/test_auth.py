"""
Tests de autenticación: Login usuario normal, Login admin, Logout.
"""
import pytest
from page_objects import AuthPage, HeaderPage
from data.test_data import get_user, TEST_GENRES


@pytest.mark.auth
@pytest.mark.smoke
class TestLogin:
    """Tests de login para usuario normal y admin."""

    def test_login_standard_user(self, driver, base_url, test_credentials):
        """1. Login usuario normal."""
        auth = AuthPage(driver, base_url)
        user = get_user("standard")

        # Navegar a login
        auth.go_to_login()
        auth.assert_on_auth_page()

        # Realizar login
        auth.login(user.email, user.password)

        # Verificar login exitoso
        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in(nickname=user.nickname)
        header.assert_user_not_logged_in()  # No debe mostrar botón Entrar

        # Verificar que está en página principal
        header.assert_on_page("Inicio")

    def test_login_admin_user(self, driver, base_url, test_credentials):
        """2. Login administrador."""
        auth = AuthPage(driver, base_url)
        admin = get_user("admin")

        auth.go_to_login()
        auth.login(admin.email, admin.password)

        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in(nickname=admin.nickname)

        # Verificar que tiene acceso a admin en dropdown
        header.assert_admin_visible()

    def test_login_invalid_credentials(self, driver, base_url):
        """Login con credenciales inválidas debe mostrar error."""
        auth = AuthPage(driver, base_url)
        auth.go_to_login()
        auth.login("inexistente@example.com", "wrongpassword")
        auth.assert_login_error("incorrectos")

    def test_login_empty_fields(self, driver, base_url):
        """Login sin rellenar campos debe mostrar error."""
        auth = AuthPage(driver, base_url)
        auth.go_to_login()
        driver.find_element(*auth.LOGIN_SUBMIT).click()
        auth.assert_login_error("correo y tu contraseña")


@pytest.mark.auth
@pytest.mark.smoke
class TestLogout:
    """Tests de logout."""

    def test_logout_via_dropdown(self, driver, base_url, test_credentials):
        """7. Logout desde menú de usuario."""
        auth = AuthPage(driver, base_url)
        user = get_user("standard")

        # Login previo
        auth.go_to_login().login(user.email, user.password)

        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in()

        # Logout
        header.logout_via_dropdown()

        # Verificar logout
        header.assert_user_not_logged_in()
        auth.assert_on_auth_page()

    def test_logout_via_nav_button(self, driver, base_url, test_credentials):
        """Logout desde botón 'Salir' en nav (mobile)."""
        auth = AuthPage(driver, base_url)
        user = get_user("standard")

        auth.go_to_login().login(user.email, user.password)

        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in()

        # En móvil, el botón 'Salir' está visible en nav
        header.logout_via_nav()

        header.assert_user_not_logged_in()


@pytest.mark.auth
class TestRegister:
    """Tests de registro (opcional, para cobertura completa)."""

    def test_register_flow(self, driver, base_url):
        """Registro completo: datos + cuestionario."""
        import time
        unique = int(time.time())
        email = f"testreg_{unique}@example.com"
        password = "TestPass123!"
        nickname = f"testreg{unique}"

        auth = AuthPage(driver, base_url)
        auth.go_to_register()
        auth.assert_on_auth_page()

        # Paso 1: Datos básicos
        auth.register_step1("Usuario Registro", email, password, nickname)
        auth.assert_on_questionnaire()

        # Paso 2: Cuestionario
        auth.complete_questionnaire(
            genres=TEST_GENRES,
            likes_movies=True,
            likes_series=True,
            likes_miniseries=True
        )

        # Verificar login automático tras registro
        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in(nickname=nickname)

    def test_register_duplicate_email(self, driver, base_url, test_credentials):
        """Registro con email ya existente debe fallar."""
        auth = AuthPage(driver, base_url)
        user = get_user("standard")

        auth.go_to_register()
        auth.register_step1("Otro Nombre", user.email, "OtherPass123!", "otro_nick")
        # Debería mostrar error de email ya en uso
        auth.assert_register_error("ya está registrado")


@pytest.mark.auth
class TestAuthNavigation:
    """Tests de navegación entre páginas de auth."""

    def test_switch_login_to_register(self, driver, base_url):
        auth = AuthPage(driver, base_url)
        auth.go_to_login()
        auth.click_switch_to_register()
        auth.wait_for_register_form()

    def test_switch_register_to_login(self, driver, base_url):
        auth = AuthPage(driver, base_url)
        auth.go_to_register()
        auth.click_switch_to_login()
        auth.wait_for_login_form()

    def test_forgot_password_link(self, driver, base_url):
        auth = AuthPage(driver, base_url)
        auth.go_to_login()
        auth.click_forgot_password()
        # Debe ir a página de recuperar contraseña
        auth.wait.until(lambda d: "forgot" in d.current_url or "recuperar" in d.current_url)
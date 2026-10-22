"""
Tests de navegación principal y páginas públicas.
"""
import pytest
from page_objects import HeaderPage, MoviesPage, MarathonsPage, AccountPage
from data.test_data import get_user


@pytest.mark.navigation
@pytest.mark.smoke
class TestMainNavigation:
    """3. Navegación por páginas principales."""

    def test_nav_home_to_movies(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_home()
        header.assert_on_page("Inicio")

        header.go_movies()
        movies = MoviesPage(driver, base_url)
        movies.assert_on_movies_page()

    def test_nav_movies_to_series(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_movies()
        header.go_series()
        # Verificar que está en series (título página)
        movies = MoviesPage(driver, base_url)  # Reutiliza selectores similares
        movies.wait.until(lambda d: "series" in d.current_url)

    def test_nav_series_to_marathons(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_series()
        header.go_marathons()
        marathons = MarathonsPage(driver, base_url)
        marathons.assert_on_marathons_page()

    def test_nav_marathons_to_home(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_marathons()
        header.go_home()
        header.assert_on_page("Inicio")

    def test_logo_goes_home(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_movies()
        header.click(header.LOGO)
        header.assert_on_page("Inicio")


@pytest.mark.navigation
class TestAuthenticatedNavigation:
    """Navegación con usuario logueado."""

    @pytest.fixture(autouse=True)
    def login_user(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)
        yield
        # Logout al final
        header = HeaderPage(driver, base_url)
        try:
            header.logout_via_dropdown()
        except:
            pass

    def test_user_menu_opens(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in()
        header.open_user_menu()
        # Verificar items del dropdown
        assert header.is_visible(header.DROPDOWN_MY_ACCOUNT)
        assert header.is_visible(header.DROPDOWN_MY_PROFILE)
        assert header.is_visible(header.DROPDOWN_FRIENDS)
        assert header.is_visible(header.DROPDOWN_SETTINGS)
        assert header.is_visible(header.DROPDOWN_LOGOUT)

    def test_go_my_account(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_my_account()
        account = AccountPage(driver, base_url)
        account.assert_on_account_page()

    def test_go_my_profile(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_my_profile()
        # Verificar URL de perfil
        assert "perfil" in driver.current_url

    def test_go_friends(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_friends()
        assert "amigos" in driver.current_url

    def test_go_settings(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_settings()
        assert "configuracion" in driver.current_url


@pytest.mark.navigation
class TestPublicPages:
    """Tests de páginas públicas (sin login)."""

    def test_landing_page_loads(self, driver, base_url):
        driver.get(base_url)
        header = HeaderPage(driver, base_url)
        header.assert_user_not_logged_in()
        # Verificar elementos del hero
        assert header.is_visible((HeaderPage.LOGO[0], HeaderPage.LOGO[1]))

    def test_public_profile_accessible(self, driver, base_url, test_credentials):
        # Login para obtener un usuario válido
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)

        # Ir a perfil público propio
        header = HeaderPage(driver, base_url)
        header.go_my_profile()
        # Verificar elementos de perfil público
        assert "perfil" in driver.current_url
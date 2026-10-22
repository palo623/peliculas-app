"""
Tests del panel de administración (requiere usuario admin).
"""
import pytest
from page_objects import AdminPage, HeaderPage, AuthPage
from data.test_data import get_user


@pytest.mark.admin
class TestAdminAccess:
    """Tests de acceso al panel de admin."""

    @pytest.fixture(autouse=True)
    def login_admin(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        admin = get_user("admin")
        auth.go_to_login().login(admin.email, admin.password)
        yield

    def test_admin_can_access_dashboard(self, driver, base_url):
        """Admin puede acceder a /admin."""
        header = HeaderPage(driver, base_url)
        header.go_admin()

        admin = AdminPage(driver, base_url)
        admin.assert_admin_dashboard_loaded()

    def test_admin_sees_stats_cards(self, driver, base_url):
        admin = AdminPage(driver, base_url)
        admin.open()
        admin.assert_stats_cards(expected_count=4)

        stats = admin.get_stats()
        assert "Total de Usuarios" in stats
        assert "Total de Reseñas" in stats
        assert stats["Total de Usuarios"].isdigit()

    def test_admin_sees_management_section(self, driver, base_url):
        admin = AdminPage(driver, base_url)
        admin.open()
        admin.assert_management_section()

    def test_admin_sees_activity_table(self, driver, base_url):
        admin = AdminPage(driver, base_url)
        admin.open()
        admin.assert_activity_table(min_rows=1)


@pytest.mark.admin
class TestAdminNavigation:
    """Tests de navegación dentro del panel admin."""

    @pytest.fixture(autouse=True)
    def login_admin(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        admin = get_user("admin")
        auth.go_to_login().login(admin.email, admin.password)
        yield

    def test_admin_link_visible_in_dropdown(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in()
        header.assert_admin_visible()

    def test_standard_user_cannot_see_admin_link(self, driver, base_url, test_credentials):
        # Login usuario normal
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)

        header = HeaderPage(driver, base_url)
        header.assert_user_logged_in()
        header.assert_admin_not_visible()


@pytest.mark.admin
class TestStandardUserCannotAccessAdmin:
    """Usuario normal no debe acceder a /admin."""

    @pytest.fixture(autouse=True)
    def login_standard(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)
        yield

    def test_standard_user_redirected_from_admin(self, driver, base_url):
        admin = AdminPage(driver, base_url)
        admin.open()  # Intenta abrir /admin
        admin.assert_access_denied()
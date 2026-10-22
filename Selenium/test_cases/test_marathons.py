"""
Tests de Maratones (funcionalidad principal de la app).
"""
import pytest
from page_objects import MarathonsPage, HeaderPage, AuthPage
from data.test_data import get_user


@pytest.mark.marathons
class TestMarathonsBasic:
    """Tests básicos de maratones."""

    @pytest.fixture(autouse=True)
    def login_user(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)
        yield

    def test_marathons_page_loads(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.assert_on_marathons_page()
        marathons.assert_marathons_loaded(min_count=1)

    def test_open_marathon_detail(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.assert_marathons_loaded(min_count=1)

        # Abrir primera maratón
        marathons.open_marathon(0)
        marathons.assert_marathon_detail_open()

    def test_marathon_items_visible(self, driver, base_url):
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.open_marathon(0)
        marathons.assert_marathon_detail_open()

        # Verificar que hay items listados
        items = marathons.find_all(marathons.MARATHON_ITEMS, timeout=10)
        assert len(items) > 0, "La maratón debe tener items"


@pytest.mark.marathons
class TestMarathonProgression:
    """Tests de progresión en maratones (secuencial)."""

    @pytest.fixture(autouse=True)
    def login_user(self, driver, base_url, test_credentials):
        auth = AuthPage(driver, base_url)
        user = get_user("standard")
        auth.go_to_login().login(user.email, user.password)
        yield

    def test_mark_first_item_watched(self, driver, base_url):
        """Marcar primer item como visto."""
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.open_marathon(0)
        marathons.assert_marathon_detail_open()

        # El primer item debe estar desbloqueable
        marathons.assert_item_unlockable(0)

        # Marcar como visto
        marathons.mark_next_as_watched()
        marathons.assert_item_watched(0)

        # El segundo debe estar ahora desbloqueable (o bloqueado si no se puede ver)
        marathons.assert_item_locked(1)

    def test_cannot_skip_items(self, driver, base_url):
        """No se puede saltar items (progresión secuencial)."""
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.open_marathon(0)

        # Intentar marcar segundo sin ver primero debería fallar (botón no disponible)
        # Verificar que solo el primero es unlockable
        marathons.assert_item_unlockable(0)
        marathons.assert_item_locked(1)

    def test_unmark_last_watched(self, driver, base_url):
        """Desmarcar último item visto."""
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.open_marathon(0)

        # Marcar primero
        marathons.mark_next_as_watched()
        marathons.assert_item_watched(0)

        # Desmarcar
        marathons.unmark_last_watched()
        # Ahora el primero debería estar unlockable de nuevo
        marathons.assert_item_unlockable(0)

    def test_reset_marathon(self, driver, base_url):
        """Reiniciar maratón completa."""
        header = HeaderPage(driver, base_url)
        header.go_marathons()

        marathons = MarathonsPage(driver, base_url)
        marathons.open_marathon(0)

        # Marcar algunos
        marathons.mark_next_as_watched()

        # Reiniciar
        marathons.reset_marathon()

        # Todos deberían estar unlockable/bloqueado según corresponda
        marathons.assert_item_unlockable(0)
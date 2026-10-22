"""
Datos de prueba para tests Selenium.
Configurar variables de entorno en .env.test o sobrescribir en CI/CD.
"""
import os
from dataclasses import dataclass
from typing import List


@dataclass
class TestUser:
    email: str
    password: str
    name: str
    nickname: str
    role: str  # "user" | "admin"
    verified: bool = True
    onboarding_done: bool = True


@dataclass
class TestMovie:
    title: str
    year: int
    imdb_id: str
    genre: str = ""


# --- Usuarios de prueba ---
# IMPORTANTE: Estos usuarios deben existir en Firebase Auth + Firestore antes de ejecutar tests.
# Se pueden crear con: node scripts/verify-test-user.js o seedLocalUser en modo local.

TEST_USERS = {
    "standard": TestUser(
        email=os.getenv("TEST_USER_EMAIL", "testuser@example.com"),
        password=os.getenv("TEST_USER_PASSWORD", "TestPass123!"),
        name="Usuario Test",
        nickname="testuser",
        role="user",
        verified=True,
        onboarding_done=True,
    ),
    "admin": TestUser(
        email=os.getenv("ADMIN_USER_EMAIL", "admin@example.com"),
        password=os.getenv("ADMIN_USER_PASSWORD", "AdminPass123!"),
        name="Admin Test",
        nickname="admintest",
        role="admin",
        verified=True,
        onboarding_done=True,
    ),
    "unverified": TestUser(
        email=os.getenv("UNVERIFIED_USER_EMAIL", "unverified@example.com"),
        password=os.getenv("UNVERIFIED_USER_PASSWORD", "TestPass123!"),
        name="Usuario No Verificado",
        nickname="unverified",
        role="user",
        verified=False,
        onboarding_done=False,
    ),
}


# --- Películas de prueba (deben existir en Firestore tras seeding) ---
TEST_MOVIES = [
    TestMovie(title="Inception", year=2010, imdb_id="tt1375666", genre="Action, Adventure, Sci-Fi"),
    TestMovie(title="The Matrix", year=1999, imdb_id="tt0133093", genre="Action, Sci-Fi"),
    TestMovie(title="Interstellar", year=2014, imdb_id="tt0816692", genre="Adventure, Drama, Sci-Fi"),
    TestMovie(title="The Dark Knight", year=2008, imdb_id="tt0468569", genre="Action, Crime, Drama"),
    TestMovie(title="Pulp Fiction", year=1994, imdb_id="tt0110912", genre="Crime, Drama"),
]


# --- Géneros para cuestionario ---
TEST_GENRES = ["Action", "Drama", "Sci-Fi"]


# --- Configuración de timeouts ---
TIMEOUTS = {
    "page_load": 30,
    "element_wait": 15,
    "ajax_wait": 10,
    "animation": 1,
}


# --- Selectores de datos test (data-testid si se añaden en el futuro) ---
TEST_SELECTORS = {
    "login_form": "data-testid='login-form'",
    "register_form": "data-testid='register-form'",
    "movie_card": "data-testid='movie-card'",
    "save_button": "data-testid='save-movie'",
    "delete_button": "data-testid='delete-movie'",
    "user_menu": "data-testid='user-menu'",
    "admin_link": "data-testid='admin-link'",
}


def get_user(role: str = "standard") -> TestUser:
    """Obtiene usuario de prueba por rol."""
    return TEST_USERS.get(role, TEST_USERS["standard"])


def get_movie(index: int = 0) -> TestMovie:
    """Obtiene película de prueba por índice."""
    return TEST_MOVIES[index % len(TEST_MOVIES)]


def get_random_movie() -> TestMovie:
    """Obtiene una película aleatoria de la lista."""
    import random
    return random.choice(TEST_MOVIES)
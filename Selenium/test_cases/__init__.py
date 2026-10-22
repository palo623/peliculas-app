"""
Test cases package.
"""
# Importar módulos para que pytest los descubra
from test_cases import test_auth, test_navigation, test_movies, test_admin, test_marathons, test_reviews

__all__ = [
    "test_auth",
    "test_navigation",
    "test_movies",
    "test_admin",
    "test_marathons",
    "test_reviews",
]
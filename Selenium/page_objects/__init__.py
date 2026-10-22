"""
Page Objects package para tests Selenium.
"""
from page_objects.base_page import BasePage, AssertionHelper
from page_objects.auth_page import AuthPage
from page_objects.header_page import HeaderPage
from page_objects.movies_page import MoviesPage
from page_objects.account_page import AccountPage
from page_objects.marathons_page import MarathonsPage
from page_objects.admin_page import AdminPage

__all__ = [
    "BasePage",
    "AssertionHelper",
    "AuthPage",
    "HeaderPage",
    "MoviesPage",
    "AccountPage",
    "MarathonsPage",
    "AdminPage",
]
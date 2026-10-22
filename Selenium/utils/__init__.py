"""
Utils package para tests Selenium.
"""
from utils.helpers import (
    wait_for_ajax,
    wait_for_fetch,
    safe_click,
    safe_type,
    get_element_text,
    is_element_visible,
    is_element_present,
    take_screenshot,
    login_user,
    logout_user,
    wait_for_url_change,
    switch_to_window,
    close_current_window,
    get_local_storage,
    set_local_storage,
    clear_local_storage,
    get_session_token,
    set_session_token,
)

__all__ = [
    "wait_for_ajax",
    "wait_for_fetch",
    "safe_click",
    "safe_type",
    "get_element_text",
    "is_element_visible",
    "is_element_present",
    "take_screenshot",
    "login_user",
    "logout_user",
    "wait_for_url_change",
    "switch_to_window",
    "close_current_window",
    "get_local_storage",
    "set_local_storage",
    "clear_local_storage",
    "get_session_token",
    "set_session_token",
]
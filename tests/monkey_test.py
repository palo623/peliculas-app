#!/usr/bin/env python3
"""
Monkey Testing Automatizado para CineAIros
Pruebas aleatorias seguras en areas publicas y privadas (con login).
Detecta errores de UI, navegacion rotas, timeouts, y comportamientos inesperados.

Autor: QA Engineer Senior
Version: 1.0
Python: 3.10+
"""

import asyncio
import random
import time
import csv
import os
import sys
import traceback
import statistics
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum

import yaml

from playwright.async_api import async_playwright, Page, Browser, BrowserContext, Locator, Error as PlaywrightError

# Optional imports for graph generation
try:
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_PLOTTING = True
except ImportError:
    HAS_PLOTTING = False
    pd = None
    plt = None


# ============================================================================
# CONFIGURACION Y CONSTANTES
# ============================================================================

class ActionResult(Enum):
    SUCCESS = "success"
    ERROR = "error"
    SKIPPED = "skipped"
    TIMEOUT = "timeout"


@dataclass
class ActionRecord:
    timestamp: str
    action_number: int
    url: str
    action_type: str
    element_description: str
    duration_ms: float
    result: ActionResult
    error_message: str = ""
    page_title: str = ""

    def to_row(self) -> List:
        return [
            self.timestamp,
            self.action_number,
            self.url,
            self.action_type,
            self.element_description,
            f"{self.duration_ms:.2f}",
            self.result.value,
            self.error_message,
            self.page_title
        ]


@dataclass
class TestConfig:
    base_url: str
    test_email: str
    test_password: str
    max_actions: int = 100
    action_delay_range: Tuple[int, int] = (500, 2000)
    timeout_ms: int = 15000
    headless: bool = False
    viewport: Dict[str, int] = field(default_factory=lambda: {"width": 1280, "height": 720})
    results_dir: str = "results"


DANGEROUS_TEXT_PATTERNS = [
    "eliminar", "borrar", "delete", "remove", "reset", "reiniciar",
    "guardar", "save", "publicar", "publish", "enviar", "send",
    "comprar", "purchase", "payment", "pagar", "pago",
    "admin", "administrador", "panel de administraci",
    "marcar como vista", "desmarcar", "desmarcar vista",
    "aceptar solicitud", "rechazar", "cancelar solicitud",
    "eliminar amigo", "quitar amigo", "borrar amigo",
    "cambiar rol", "promover", "degradar", "hacer admin",
    "votar", "upvote", "downvote",
    "responder", "reply", "comentar",
    "cerrar sesión", "cerrar sesion", "salir",
    "quitar", "enviar solicitud", "añadir amigo", "agregar amigo",
    "send request", "add friend",
    "confirmar", "confirm", "estoy seguro",
]

DANGEROUS_SELECTORS = [
    "button.danger", "btn-danger", "btn-primary[type='submit']",
    "[data-destructive]", "[data-admin]", "[data-write]",
    "button:has-text('Eliminar')", "button:has-text('Borrar')",
    "button:has-text('Delete')", "button:has-text('Remove')",
    "button:has-text('Reset')", "button:has-text('Reiniciar')",
    "form[action*='delete']", "form[action*='remove']",
]

SAFE_SELECTORS = {
    "navigation": [
        "nav .nav-link:not(.danger):not(.nav-cta)",
        ".menu-toggle",
        "header .logo",
        "footer .footer-link",
    ],
    "search": [
        "input[type='text'][placeholder*='Buscar']",
        "input[type='search']",
        ".search-form input",
        "form.search-form button[type='submit']:not(:disabled)",
    ],
    "filters": [
        "input[type='number'][placeholder*='Ano']",
        "input[type='number'][placeholder*='Ej.']",
        "select:has(option[value='0'])",
        "select:has(option[value='relevance'])",
        "select:has(option[value='Action'])",
    ],
    "carousels": [
        ".carousel-controls button",
        ".toprank-track img",
        ".movie-card",
        ".carousel-item",
    ],
    "modals": [
        ".modal-close",
        ".modal-backdrop",
        "button:has-text('Cerrar')",
        "button:has-text('Descartar')",
        "button:has-text('Cancelar')",
        ".btn-ghost:has-text('Cerrar')",
    ],
    "tabs": [
        ".tab:not(.active)",
        ".marathon-tabs .tab",
        "#amigos .tab, #amistades .tab",
    ],
    "account_sections": [
        ".profile-toc a[href^='#']",
    ],
    "profile_links": [
        ".user-item--link",
        "button:has-text('Ver perfil')",
        ".user-row",
    ],
    "chatbot": [
        ".chat-agent-toggle",
    ],
    "detail_buttons": [
        "button:has-text('Ver ficha')",
        ".marathon-item-title",
        ".top5-card",
    ],
    "scrollable": [
        ".carousel-track",
        ".marathon-items",
        ".reviews-list",
        ".user-list",
        "main",
    ],
}


# ============================================================================
# UTILIDADES
# ============================================================================

def load_config(config_path: str = "tests/config.yaml") -> TestConfig:
    with open(config_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    return TestConfig(
        base_url=data['base_url'],
        test_email=data['test_user']['email'],
        test_password=data['test_user']['password'],
        max_actions=data.get('max_actions', 100),
        action_delay_range=tuple(data.get('action_delay_ms', [500, 2000])),
        timeout_ms=data.get('timeout_ms', 15000),
        headless=data.get('headless', False),
        viewport=data.get('viewport', {"width": 1280, "height": 720}),
        results_dir=data.get('results_dir', 'results'),
    )


async def is_dangerous_element(element: Locator, page: Page) -> bool:
    try:
        text = (await element.text_content() or "").lower()
        for pattern in DANGEROUS_TEXT_PATTERNS:
            if pattern in text:
                return True

        tag_name = await element.evaluate("el => el.tagName.toLowerCase()")
        if tag_name == "button":
            btn_type = await element.get_attribute("type") or ""
            if btn_type == "submit":
                form = await element.evaluate("el => el.closest('form')")
                if form:
                    form_action = await form.get_attribute("action") or ""
                    form_method = (await form.get_attribute("method") or "get").lower()
                    if form_method == "post" or any(x in form_action for x in ["delete", "remove", "reset", "admin"]):
                        return True

        class_attr = await element.get_attribute("class") or ""
        dangerous_classes = ["danger", "btn-danger", "destructive", "delete-btn", "remove-btn"]
        if any(dc in class_attr for dc in dangerous_classes):
            return True

        for selector in DANGEROUS_SELECTORS:
            try:
                if await element.evaluate(f"el => el.matches('{selector}')"):
                    return True
            except:
                pass

        return False
    except Exception:
        return True


async def get_element_description(element: Locator) -> str:
    try:
        text = (await element.text_content() or "").strip()[:50]
        tag = await element.evaluate("el => el.tagName.toLowerCase()")
        classes = await element.get_attribute("class") or ""
        placeholder = await element.get_attribute("placeholder") or ""
        aria_label = await element.get_attribute("aria-label") or ""
        title = await element.get_attribute("title") or ""

        parts = [tag]
        if text:
            parts.append(f"text='{text}'")
        if placeholder:
            parts.append(f"placeholder='{placeholder}'")
        if aria_label:
            parts.append(f"aria-label='{aria_label}'")
        if title:
            parts.append(f"title='{title}'")
        if classes:
            parts.append(f"class='{classes[:40]}'")

        return " | ".join(parts)
    except Exception:
        return "unknown element"


async def random_delay(min_ms: int, max_ms: int):
    delay = random.uniform(min_ms / 1000, max_ms / 1000)
    await asyncio.sleep(delay)


# ============================================================================
# ACTION LOGGING
# ============================================================================

class ActionLogger:
    def __init__(self, results_dir: str):
        self.results_dir = Path(results_dir)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.csv_path = self.results_dir / "monkey_results.csv"
        self.records: List[ActionRecord] = []
        self._init_csv()

    def _init_csv(self):
        headers = [
            "timestamp", "action_number", "url", "action_type",
            "element_description", "duration_ms", "result",
            "error_message", "page_title"
        ]
        with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(headers)

    def log(self, record: ActionRecord):
        self.records.append(record)
        with open(self.csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(record.to_row())

    def get_dataframe(self):
        if not self.records:
            return None
        if HAS_PLOTTING:
            import pandas as pd
            return pd.DataFrame([{
                'timestamp': r.timestamp,
                'action_number': r.action_number,
                'url': r.url,
                'action_type': r.action_type,
                'element_description': r.element_description,
                'duration_ms': r.duration_ms,
                'result': r.result.value,
                'error_message': r.error_message,
                'page_title': r.page_title
            } for r in self.records])
        return self.records


# ============================================================================
# SAFE NAVIGATOR
# ============================================================================

class SafeNavigator:
    def __init__(self, page: Page, config: TestConfig, logger: ActionLogger):
        self.page = page
        self.config = config
        self.logger = logger
        self.action_count = 0

    async def wait_for_spa_ready(self):
        await self.page.wait_for_selector("#boot-loading", state="hidden", timeout=10000)
        await asyncio.sleep(0.5)

    async def login(self) -> bool:
        start = time.time()
        try:
            print(f"[LOGIN] Iniciando sesion con {self.config.test_email}...")
            await self.page.goto(self.config.base_url, wait_until="domcontentloaded", timeout=30000)
            await self.wait_for_spa_ready()

            # Check if already logged in
            token = await self.page.evaluate("() => localStorage.getItem('cineairos_token')")
            if token:
                print("[LOGIN] Ya hay token en localStorage, verificando...")
                try:
                    await self.page.wait_for_function("() => localStorage.getItem('cineairos_token')", timeout=5000)
                    duration = (time.time() - start) * 1000
                    self.logger.log(ActionRecord(
                        timestamp=datetime.now().isoformat(),
                        action_number=0,
                        url=self.page.url,
                        action_type="login",
                        element_description="Login skipped (already logged in)",
                        duration_ms=duration,
                        result=ActionResult.SUCCESS,
                        page_title=await self.page.title()
                    ))
                    print(f"[OK] Sesion ya activa ({duration:.0f}ms)")
                    return True
                except:
                    pass  # Token exists but maybe invalid, continue with login

            print("[LOGIN] Buscando boton Entrar...")
            entrar_btn = self.page.locator("header .nav-cta, header button:has-text('Entrar'), nav button:has-text('Entrar')").first
            if await entrar_btn.count() > 0:
                print("[LOGIN] Click Entrar")
                await entrar_btn.click()
                await self.wait_for_spa_ready()

            print("[LOGIN] Buscando boton Iniciar sesion...")
            login_btn = self.page.locator(
                "button:has-text('Iniciar sesión'), button:has-text('Iniciar sesion')"
            ).first
            if await login_btn.count() > 0:
                print("[LOGIN] Click Iniciar sesion")
                await login_btn.click()
                await self.wait_for_spa_ready()

            print("[LOGIN] Esperando formulario de login...")
            # Wait for the form to appear - try multiple selectors
            email_selectors = [
                "input[type='email'][autocomplete='email']",
                "input[type='email'][placeholder*='correo']",
                "input[type='email'][placeholder*='@']",
                "input[type='email']",
                ".auth-field input[type='email']",
                "form[onSubmit] input[type='email']",
            ]
            email_input = None
            for sel in email_selectors:
                try:
                    await self.page.wait_for_selector(sel, timeout=5000)
                    email_input = self.page.locator(sel).first
                    print(f"[LOGIN] Encontrado input email con selector: {sel}")
                    break
                except:
                    continue
            
            if not email_input:
                raise Exception("No se encontro input de email en el formulario")

            print("[LOGIN] Rellenando formulario...")
            pass_selectors = [
                "input[type='password'][autocomplete='current-password']",
                "input[type='password'][placeholder*='contrase']",
                "input[type='password']",
                ".auth-field input[type='password']",
                "form[onSubmit] input[type='password']",
            ]
            pass_input = None
            for sel in pass_selectors:
                try:
                    pass_input = self.page.locator(sel).first
                    await pass_input.wait_for(state="visible", timeout=3000)
                    print(f"[LOGIN] Encontrado input password con selector: {sel}")
                    break
                except:
                    continue
            
            if not pass_input:
                raise Exception("No se encontro input de password en el formulario")

            await email_input.fill(self.config.test_email)
            await pass_input.fill(self.config.test_password)

            submit_selectors = [
                "form button[type='submit'].btn-primary",
                "form button[type='submit']",
                "button[type='submit'].btn-primary",
                "button[type='submit']",
                ".auth-card form button[type='submit']",
            ]
            submit_btn = None
            for sel in submit_selectors:
                try:
                    submit_btn = self.page.locator(sel).first
                    await submit_btn.wait_for(state="visible", timeout=3000)
                    print(f"[LOGIN] Encontrado boton submit con selector: {sel}")
                    break
                except:
                    continue
            
            if not submit_btn:
                raise Exception("No se encontro boton submit en el formulario")

            await submit_btn.click()

            await self.page.wait_for_function(
                "() => localStorage.getItem('cineairos_token')",
                timeout=self.config.timeout_ms
            )

            token = await self.page.evaluate("() => localStorage.getItem('cineairos_token')")
            if token:
                duration = (time.time() - start) * 1000
                self.logger.log(ActionRecord(
                    timestamp=datetime.now().isoformat(),
                    action_number=0,
                    url=self.page.url,
                    action_type="login",
                    element_description="Login form submit",
                    duration_ms=duration,
                    result=ActionResult.SUCCESS,
                    page_title=await self.page.title()
                ))
                print(f"[OK] Login exitoso ({duration:.0f}ms)")
                return True
            else:
                raise Exception("Token no guardado tras login")

        except Exception as e:
            duration = (time.time() - start) * 1000
            self.logger.log(ActionRecord(
                timestamp=datetime.now().isoformat(),
                action_number=0,
                url=self.page.url,
                action_type="login",
                element_description="Login form submit",
                duration_ms=duration,
                result=ActionResult.ERROR,
                error_message=str(e),
                page_title=await self.page.title()
            ))
            print(f"[ERR] Login fallido: {e}")
            return False

    async def find_safe_elements(self) -> List[Tuple[Locator, str, str]]:
        safe_elements = []
        max_candidates_per_selector = 2

        for category, selectors in SAFE_SELECTORS.items():
            for selector in selectors:
                try:
                    elements = self.page.locator(selector)
                    count = await elements.count()
                    candidate_indexes = random.sample(
                        range(count), min(count, max_candidates_per_selector)
                    )
                    for i in candidate_indexes:
                        el = elements.nth(i)
                        if await el.is_visible() and await el.is_enabled():
                            if not await is_dangerous_element(el, self.page):
                                desc = await get_element_description(el)
                                safe_elements.append((el, category, desc))
                except Exception:
                    continue

        return safe_elements

    async def perform_action(self, element: Locator, category: str, description: str) -> ActionRecord:
        self.action_count += 1
        start = time.time()
        action_type = category

        try:
            if category == "navigation":
                await element.click()
                action_type = "click_nav"
                await self.wait_for_spa_ready()

            elif category == "search":
                tag = await element.evaluate("el => el.tagName.toLowerCase()")
                if tag == "input":
                    queries = ["inception", "matrix", "breaking bad", "dark", "dune", "avatar", "star wars", "marvel"]
                    query = random.choice(queries)
                    await element.fill(query)
                    action_type = "type_search"
                    await element.press("Enter")
                    await self.wait_for_spa_ready()
                else:
                    await element.click()
                    action_type = "click_search_submit"
                    await self.wait_for_spa_ready()

            elif category == "filters":
                tag = await element.evaluate("el => el.tagName.toLowerCase()")
                if tag == "input":
                    year = random.randint(1990, 2024)
                    await element.fill(str(year))
                    action_type = "type_filter_year"
                elif tag == "select":
                    options = await element.locator("option").all()
                    if options:
                        opt = random.choice(options)
                        value = await opt.get_attribute("value")
                        await element.select_option(value=value)
                        action_type = f"select_filter_{await element.get_attribute('name') or 'unknown'}"
                form = await element.evaluate("el => el.closest('form')")
                if form:
                    submit_btn = self.page.locator("form button[type='submit']:not(:disabled)").first
                    if await submit_btn.count() > 0:
                        await submit_btn.click()
                        await self.wait_for_spa_ready()

            elif category == "carousels":
                await element.click()
                action_type = "click_carousel"
                await asyncio.sleep(0.3)

            elif category == "modals":
                await element.click()
                action_type = "click_modal"
                await asyncio.sleep(0.3)

            elif category == "tabs":
                await element.click()
                action_type = "click_tab"
                await self.wait_for_spa_ready()

            elif category == "account_sections":
                await element.click()
                action_type = "click_account_section"
                await asyncio.sleep(0.3)

            elif category == "profile_links":
                await element.click()
                action_type = "click_profile"
                await self.wait_for_spa_ready()

            elif category == "chatbot":
                await element.click()
                action_type = "click_chatbot"
                await asyncio.sleep(0.5)

            elif category == "detail_buttons":
                await element.click()
                action_type = "click_detail"
                await asyncio.sleep(0.3)

            elif category == "scrollable":
                await self.page.evaluate("""() => {
                    const el = document.querySelector('.carousel-track, .marathon-items, .reviews-list, .user-list, main');
                    if (el) el.scrollBy({left: 300, top: 300, behavior: 'smooth'});
                }""")
                action_type = "scroll"
                await asyncio.sleep(0.5)

            else:
                await element.click()
                action_type = "click_generic"
                await asyncio.sleep(0.3)

            duration = (time.time() - start) * 1000

            record = ActionRecord(
                timestamp=datetime.now().isoformat(),
                action_number=self.action_count,
                url=self.page.url,
                action_type=action_type,
                element_description=description,
                duration_ms=duration,
                result=ActionResult.SUCCESS,
                page_title=await self.page.title()
            )

        except PlaywrightError as e:
            duration = (time.time() - start) * 1000
            error_msg = str(e)
            if "Timeout" in error_msg:
                result = ActionResult.TIMEOUT
            else:
                result = ActionResult.ERROR

            record = ActionRecord(
                timestamp=datetime.now().isoformat(),
                action_number=self.action_count,
                url=self.page.url,
                action_type=action_type,
                element_description=description,
                duration_ms=duration,
                result=result,
                error_message=error_msg,
                page_title=await self.page.title()
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            record = ActionRecord(
                timestamp=datetime.now().isoformat(),
                action_number=self.action_count,
                url=self.page.url,
                action_type=action_type,
                element_description=description,
                duration_ms=duration,
                result=ActionResult.ERROR,
                error_message=str(e),
                page_title=await self.page.title()
            )

        self.logger.log(record)
        return record


# ============================================================================
# MONKEY TESTER PRINCIPAL
# ============================================================================

class MonkeyTester:
    def __init__(self, config: TestConfig):
        self.config = config
        self.logger = ActionLogger(config.results_dir)
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.navigator: Optional[SafeNavigator] = None
        self.start_time = time.time()

    async def setup(self):
        print("[SETUP] Iniciando Playwright...")
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.config.headless,
            args=['--disable-blink-features=AutomationControlled']
        )
        self.context = await self.browser.new_context(
            viewport=self.config.viewport,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CineAIros-MonkeyTest/1.0"
        )
        self.page = await self.context.new_page()
        self.page.set_default_timeout(self.config.timeout_ms)

        async def handle_request(route):
            if route.request.method in ["POST", "PUT", "DELETE", "PATCH"]:
                print(f"[WARN] Request interceptado: {route.request.method} {route.request.url}")
            await route.continue_()

        await self.page.route("**/*", handle_request)

        self.navigator = SafeNavigator(self.page, self.config, self.logger)

    async def teardown(self):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()

    async def run(self):
        print(f"[START] Iniciando Monkey Test - {self.config.max_actions} acciones")
        print(f"[URL] {self.config.base_url}")
        print(f"[USER] {self.config.test_email}")
        print(f"[MODE] {'Headless' if self.config.headless else 'Headed'}")
        print("-" * 60)

        await self.setup()

        try:
            login_ok = await self.navigator.login()
            if not login_ok:
                raise RuntimeError("No se pudo iniciar sesión; no es posible probar Mi cuenta.")

            await self.page.goto(self.config.base_url, wait_until="domcontentloaded", timeout=30000)
            await self.navigator.wait_for_spa_ready()
            user_menu = self.page.locator("header .user-chip").first
            await user_menu.wait_for(state="visible", timeout=self.config.timeout_ms)
            await user_menu.click()
            account_link = self.page.locator(".user-dropdown .dropdown-item:has-text('Mi cuenta')").first
            await account_link.wait_for(state="visible", timeout=5000)
            await account_link.click()
            await self.page.locator(".profile-toc").wait_for(state="visible", timeout=self.config.timeout_ms)
            print("[OK] Mi cuenta abierta; comienza el recorrido aleatorio.")

            consecutive_errors = 0
            max_consecutive_errors = 10
            account_focus_actions = min(30, self.config.max_actions)
            account_categories = {
                "account_sections", "carousels", "detail_buttons", "modals", "scrollable"
            }

            for i in range(self.config.max_actions):
                if consecutive_errors >= max_consecutive_errors:
                    print(f"[WARN] Demasiados errores consecutivos ({consecutive_errors}), deteniendo...")
                    break

                safe_elements = await self.navigator.find_safe_elements()
                if i < account_focus_actions:
                    safe_elements = [
                        candidate for candidate in safe_elements
                        if candidate[1] in account_categories
                    ]

                if not safe_elements:
                    print("[WARN] No se encontraron elementos seguros, esperando y reintentando...")
                    await asyncio.sleep(2)
                    consecutive_errors += 1
                    continue

                element, category, description = random.choice(safe_elements)

                record = await self.navigator.perform_action(element, category, description)

                if record.result == ActionResult.SUCCESS:
                    consecutive_errors = 0
                    status = "[OK]"
                else:
                    consecutive_errors += 1
                    status = "[ERR]" if record.result == ActionResult.ERROR else "[TO]"

                try:
                    desc = record.element_description[:60].encode('cp1252', errors='replace').decode('cp1252')
                    print(f"{status} Accion {self.navigator.action_count}/{self.config.max_actions} | "
                          f"{record.action_type} | {record.duration_ms:.0f}ms | "
                          f"{desc}")
                except:
                    print(f"{status} Accion {self.navigator.action_count}/{self.config.max_actions} | "
                          f"{record.action_type} | {record.duration_ms:.0f}ms")

                await random_delay(*self.config.action_delay_range)

        except KeyboardInterrupt:
            print("\n[INT] Interrumpido por usuario")
        except Exception as e:
            print(f"\n[CRITICAL] Error critico: {e}")
            traceback.print_exc()
            raise
        finally:
            await self.teardown()
            self.generate_reports()

    def generate_reports(self):
        print("\n[REPORT] Generando reportes...")

        records = self.logger.records
        if not records:
            print("[WARN] No hay datos para reportar")
            return

        print(f"[OK] CSV: {self.logger.csv_path}")

        if HAS_PLOTTING:
            self._generate_graph(records)
        else:
            print("[INFO] Grafico omitido (matplotlib no instalado)")

        self._generate_summary(records)

        print("[OK] Reportes generados en:", self.config.results_dir)

    def _generate_graph(self, records):
        if not HAS_PLOTTING:
            return
        graph_path = Path(self.config.results_dir) / "monkey_graph.png"

        plt.figure(figsize=(12, 6))

        success_records = [r for r in records if r.result == ActionResult.SUCCESS]
        error_records = [r for r in records if r.result != ActionResult.SUCCESS]

        plt.subplot(1, 2, 1)
        if success_records:
            plt.plot([r.action_number for r in success_records],
                     [r.duration_ms for r in success_records],
                     'b-', alpha=0.7, linewidth=1, label='Exito', marker='o', markersize=3)
        if error_records:
            plt.scatter([r.action_number for r in error_records],
                        [r.duration_ms for r in error_records],
                        c='red', alpha=0.7, s=30, label='Error/Timeout', marker='x')
        plt.xlabel('Numero de Accion')
        plt.ylabel('Tiempo de Respuesta (ms)')
        plt.title('Tiempo de Respuesta por Accion')
        plt.legend()
        plt.grid(True, alpha=0.3)

        plt.subplot(1, 2, 2)
        if success_records:
            plt.hist([r.duration_ms for r in success_records], bins=20, alpha=0.7, color='blue', label='Exito', edgecolor='black')
        if error_records:
            plt.hist([r.duration_ms for r in error_records], bins=20, alpha=0.5, color='red', label='Error', edgecolor='black')
        plt.xlabel('Tiempo de Respuesta (ms)')
        plt.ylabel('Frecuencia')
        plt.title('Distribucion de Tiempos de Respuesta')
        plt.legend()
        plt.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(graph_path, dpi=150, bbox_inches='tight')
        plt.close()

    def _generate_summary(self, records):
        summary_path = Path(self.config.results_dir) / "monkey_summary.txt"

        total_actions = len(records)
        successful = sum(1 for r in records if r.result == ActionResult.SUCCESS)
        errors = sum(1 for r in records if r.result == ActionResult.ERROR)
        timeouts = sum(1 for r in records if r.result == ActionResult.TIMEOUT)
        skipped = sum(1 for r in records if r.result == ActionResult.SKIPPED)

        success_rate = (successful / total_actions * 100) if total_actions > 0 else 0

        durations = [r.duration_ms for r in records if r.result == ActionResult.SUCCESS]
        avg_duration = statistics.mean(durations) if durations else 0
        min_duration = min(durations) if durations else 0
        max_duration = max(durations) if durations else 0
        std_duration = statistics.stdev(durations) if len(durations) > 1 else 0

        total_time = time.time() - self.start_time

        action_types = {}
        for r in records:
            if r.action_type not in action_types:
                action_types[r.action_type] = {'count': 0, 'success': 0, 'durations': []}
            action_types[r.action_type]['count'] += 1
            if r.result == ActionResult.SUCCESS:
                action_types[r.action_type]['success'] += 1
                action_types[r.action_type]['durations'].append(r.duration_ms)

        sorted_types = sorted(action_types.items(), key=lambda x: x[1]['count'], reverse=True)

        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write("INFORME DE MONKEY TESTING - CineAIros\n")
            f.write("=" * 80 + "\n\n")

            f.write("1. CONFIGURACION DE LA PRUEBA\n")
            f.write("-" * 40 + "\n")
            f.write(f"   URL Base:           {self.config.base_url}\n")
            f.write(f"   Usuario de prueba:  {self.config.test_email}\n")
            f.write(f"   Acciones objetivo:  {self.config.max_actions}\n")
            f.write(f"   Delay entre acciones: {self.config.action_delay_range[0]}-{self.config.action_delay_range[1]} ms\n")
            f.write(f"   Timeout:            {self.config.timeout_ms} ms\n")
            f.write(f"   Modo navegador:     {'Headless' if self.config.headless else 'Headed'}\n")
            f.write(f"   Viewport:           {self.config.viewport['width']}x{self.config.viewport['height']}\n\n")

            f.write("2. RESUMEN EJECUTIVO\n")
            f.write("-" * 40 + "\n")
            f.write(f"   Fecha/Hora:         {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"   Duracion total:     {total_time:.1f} segundos\n")
            f.write(f"   Acciones totales:   {total_actions}\n")
            f.write(f"   Exitosas:           {successful} ({success_rate:.1f}%)\n")
            f.write(f"   Errores:            {errors}\n")
            f.write(f"   Timeouts:           {timeouts}\n")
            f.write(f"   Omitidas:           {skipped}\n\n")

            f.write("3. METRICAS DE RENDIMIENTO (Solo acciones exitosas)\n")
            f.write("-" * 40 + "\n")
            f.write(f"   Tiempo medio:       {avg_duration:.2f} ms\n")
            f.write(f"   Tiempo minimo:      {min_duration:.2f} ms\n")
            f.write(f"   Tiempo maximo:      {max_duration:.2f} ms\n")
            f.write(f"   Desviacion estandar: {std_duration:.2f} ms\n\n")

            f.write("4. DISTRIBUCION POR TIPO DE ACCION\n")
            f.write("-" * 40 + "\n")
            for action_type, data in sorted_types:
                count = data['count']
                success = data['success']
                rate = (success / count * 100) if count > 0 else 0
                avg_dur = statistics.mean(data['durations']) if data['durations'] else 0
                f.write(f"   {action_type:25s} | {count:3d} | OK{success:3d} | {rate:5.1f}% | {avg_dur:7.1f}ms\n")
            f.write("\n")

            f.write("5. ERRORES DETECTADOS\n")
            f.write("-" * 40 + "\n")
            error_records = [r for r in records if r.result != ActionResult.SUCCESS]
            if error_records:
                for r in error_records:
                    f.write(f"   Accion #{r.action_number:3d} | {r.action_type:20s} | {r.result.value:8s} | {r.error_message[:80]}\n")
            else:
                f.write("   No se detectaron errores.\n")
            f.write("\n")

            f.write("6. CONCLUSION\n")
            f.write("-" * 40 + "\n")
            if success_rate >= 95:
                f.write("   EXCELENTE: La aplicacion muestra alta estabilidad bajo uso aleatorio.\n")
            elif success_rate >= 85:
                f.write("   BUENO: Comportamiento mayormente estable, revisar errores menores.\n")
            elif success_rate >= 70:
                f.write("   ACEPTABLE: Se detectaron varios fallos, requiere investigacion.\n")
            else:
                f.write("   CRITICO: Alta tasa de fallos, revisar estabilidad de la aplicacion.\n")

            f.write(f"\n   Tasa de exito: {success_rate:.1f}%\n")
            f.write(f"   Acciones/segundo: {total_actions/total_time:.2f}\n")

            f.write("\n" + "=" * 80 + "\n")
            f.write("Fin del informe\n")
            f.write("=" * 80 + "\n")


# ============================================================================
# ENTRY POINT
# ============================================================================

async def main():
    config_path = "tests/config.yaml"

    if not Path(config_path).exists():
        print("[ERR] Config no encontrado: " + config_path)
        print("Creando config por defecto...")
        Path("tests").mkdir(exist_ok=True)
        default_config = {
            "base_url": "http://localhost:8080",
            "test_user": {"email": "palo623@vidalibarraquer.net", "password": "123456"},
            "max_actions": 100,
            "action_delay_ms": [500, 2000],
            "timeout_ms": 15000,
            "headless": False,
            "viewport": {"width": 1280, "height": 720},
            "results_dir": "results"
        }
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)
        print("[OK] Config creado en " + config_path)

    config = load_config(config_path)
    tester = MonkeyTester(config)
    await tester.run()


if __name__ == "__main__":
    asyncio.run(main())
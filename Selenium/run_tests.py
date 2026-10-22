#!/usr/bin/env python
"""
Script para ejecutar tests Selenium con configuración común.
Uso: python run_tests.py [opciones]
"""
import subprocess
import sys
import os
import argparse


def run_command(cmd, cwd=None):
    """Ejecuta comando y retorna código de salida."""
    print(f"\n{'='*60}")
    print(f"Ejecutando: {' '.join(cmd)}")
    print(f"{'='*60}\n")
    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Runner para tests Selenium CineAIros")
    parser.add_argument(
        "-m", "--mark",
        help="Marcador pytest (smoke, regression, auth, movies, admin, marathons, reviews, navigation)"
    )
    parser.add_argument(
        "-k", "--keyword",
        help="Filtrar tests por nombre (pytest -k)"
    )
    parser.add_argument(
        "--headless", action="store_true",
        help="Ejecutar en modo headless"
    )
    parser.add_argument(
        "--browser", choices=["chrome", "firefox", "edge"], default="chrome",
        help="Navegador a usar"
    )
    parser.add_argument(
        "--html", action="store_true", default=True,
        help="Generar reporte HTML"
    )
    parser.add_argument(
        "--junit", action="store_true",
        help="Generar reporte JUnit XML"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Salida verbose"
    )
    parser.add_argument(
        "--install", action="store_true",
        help="Instalar dependencias antes de ejecutar"
    )
    parser.add_argument(
        "pytest_args", nargs=argparse.REMAINDER,
        help="Argumentos adicionales para pytest"
    )

    args = parser.parse_args()

    # Directorio de tests
    tests_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(tests_dir)

    # Instalar dependencias si se pide
    if args.install:
        print("Instalando dependencias...")
        run_command([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

    # Construir comando pytest
    cmd = [sys.executable, "-m", "pytest"]

    if args.verbose:
        cmd.append("-v")

    if args.mark:
        cmd.extend(["-m", args.mark])

    if args.keyword:
        cmd.extend(["-k", args.keyword])

    if args.headless:
        os.environ["HEADLESS"] = "true"

    os.environ["BROWSER"] = args.browser

    if args.html:
        cmd.extend(["--html=reports/report.html", "--self-contained-html"])

    if args.junit:
        cmd.extend(["--junitxml=reports/junit.xml"])

    # Argumentos extra
    if args.pytest_args:
        cmd.extend(args.pytest_args)

    # Ejecutar
    return run_command(cmd)


if __name__ == "__main__":
    sys.exit(main())
"""Compatibility entry point: the current redesigned inbox supersedes the v1 UI.
Run with the documented Python Playwright environment. Historical v1 tests remain
in Git history; legacy DB and secrecy regression tests are still separate.
"""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parents[1] / 'inkorg-v2' / 'browser.py'), run_name='__main__')

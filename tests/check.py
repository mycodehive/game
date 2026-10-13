"""Run dependency-free source and gameplay checks from any working directory."""
import re
import subprocess
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
for path in sorted(root.rglob('*.js')):
    if 'libs' in path.parts or '.git' in path.parts: continue
    subprocess.run(['node', '--input-type=module', '--check'], input=path.read_text(encoding='utf-8-sig'), text=True, check=True, cwd=root)
for path in root.rglob('*.html'):
    for attrs, script in re.findall(r'<script([^>]*)>([\s\S]*?)</script>', path.read_text(encoding='utf-8-sig')):
        if script.strip() and 'src=' not in attrs:
            subprocess.run(['node', '--input-type=module', '--check'], input=script, text=True, check=True, cwd=root)
print('PASS JavaScript syntax, including inline scripts', flush=True)
commands = [
    [sys.executable, 'tests/validate.py'],
    ['node', 'tests/ladder.test.cjs'],
    ['node', 'BlueMarble/game.test.cjs'],
    ['node', 'minecraft/game.test.mjs'],
    ['node', 'tests/boards.test.mjs'],
    ['node', 'tests/fullscreen.test.cjs'],
    ['node', 'racing/game.test.mjs'],
    ['node', 'breakout/engine.test.mjs'],
    ['node', 'breakout/render2d.test.mjs'],
    ['node', 'breakout/render3d.test.mjs'],
    ['node', 'breakout/app.test.mjs'],
    ['node', 'gunarcade/engine.test.mjs'],
    ['node', 'gunarcade/render3d.test.mjs'],
    ['node', 'gunarcade/scenarios.test.mjs'],
    ['node', 'gunarcade/app.test.mjs'],
]
for command in commands: subprocess.run(command, cwd=root, check=True)

"""Validate first-party HTML resources and ES module imports without a browser."""
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
root = Path(__file__).resolve().parents[1]
errors = []
class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(); self.path = path; self.ids = set(); self.stack = []; self.ancestors = {}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs: self.ancestors[attrs['id']] = [item[1] for item in self.stack if item[1]]
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}: self.stack.append((tag,attrs.get('id')))
        if 'id' in attrs:
            if attrs['id'] in self.ids: errors.append(f'{self.path}: duplicate id {attrs["id"]}')
            self.ids.add(attrs['id'])
        attr = 'src' if tag in {'script','img'} else 'href' if tag in {'a','link'} else None
        value = attrs.get(attr, '')
        if not value or value.startswith('#') or urlsplit(value).scheme: return
        target = (self.path.parent / unquote(urlsplit(value).path)).resolve()
        if target.is_dir(): target /= 'index.html'
        if not target.exists(): errors.append(f'{self.path}: missing resource {value}')
    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1,-1,-1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break
for path in root.rglob('*.html'):
    if '.git' in path.parts: continue
    page=Page(path); page.feed(path.read_text(encoding='utf-8-sig'))
    if path.parent.name in {'BlueMarble','ladder'}:
        required=['board-fullscreen-actions','fullscreen-roll-btn','fullscreen-exit-btn']
        if path.parent.name=='BlueMarble':
            required += ['scene-wrap','board','fullscreen-buy-btn','city-arrival-modal','owned-cities-modal','toast-container']
            if {'end-turn-btn','city-end-btn'} & page.ids: errors.append(f'{path}: obsolete turn-end control')
        else: required += ['stage3d','boardWrapper']
        for node in required:
            if 'board-play-surface' not in page.ancestors.get(node,[]): errors.append(f'{path}: {node} must be inside the fullscreen surface')
for path in root.rglob('*.js'):
    if 'libs' in path.parts: continue
    source = path.read_text(encoding='utf-8-sig')
    for value in re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]', source):
        if value.startswith('.') and not (path.parent / value).resolve().exists(): errors.append(f'{path}: missing import {value}')
if errors: raise SystemExit('\n'.join(errors))
print('PASS HTML resources/IDs, local imports, fullscreen canvas/control/modal containment and removed turn-end controls')

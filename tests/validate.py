"""Validate first-party HTML resources and ES module imports without a browser."""
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
root = Path(__file__).resolve().parents[1]
errors = []
class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(); self.path = path; self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            if attrs['id'] in self.ids: errors.append(f'{self.path}: duplicate id {attrs["id"]}')
            self.ids.add(attrs['id'])
        attr = 'src' if tag in {'script','img'} else 'href' if tag in {'a','link'} else None
        value = attrs.get(attr, '')
        if not value or value.startswith('#') or urlsplit(value).scheme: return
        target = (self.path.parent / unquote(urlsplit(value).path)).resolve()
        if target.is_dir(): target /= 'index.html'
        if not target.exists(): errors.append(f'{self.path}: missing resource {value}')
for path in root.rglob('*.html'):
    if '.git' in path.parts: continue
    Page(path).feed(path.read_text(encoding='utf-8-sig'))
for path in root.rglob('*.js'):
    if 'libs' in path.parts: continue
    source = path.read_text(encoding='utf-8-sig')
    for value in re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]', source):
        if value.startswith('.') and not (path.parent / value).resolve().exists(): errors.append(f'{path}: missing import {value}')
if errors: raise SystemExit('\n'.join(errors))
print('PASS all HTML resource links, unique IDs, local ES module imports')

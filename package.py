import pathlib, zipfile, json, hashlib
root = pathlib.Path(__file__).resolve().parent
source = root / 'plugin'
manifest = json.loads((source/'manifest.json').read_text(encoding='utf-8'))
out = root / ('文献语言补全-' + manifest['version'] + '.xpi')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in source.rglob('*'):
  if p.is_file(): z.write(p,p.relative_to(source).as_posix())
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 assert {'manifest.json','bootstrap.js','content/engine.js','content/main.js','content/panel.xhtml','content/panel.js','THIRD-PARTY-LICENSES.txt'} <= set(z.namelist())
print(str(out))
print('bytes:', out.stat().st_size)
print('sha256:',hashlib.sha256(out.read_bytes()).hexdigest())

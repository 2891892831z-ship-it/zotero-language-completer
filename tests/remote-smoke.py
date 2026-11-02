"""Install a test build through the debugger of the isolated test instance only."""
import socket, json, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
info = json.loads((root/'tests/last-smoke.json').read_text())
testdir = pathlib.Path(info['testdir'])
s = socket.create_connection(('127.0.0.1', 56001), timeout=10)
def read():
    b=b''
    while not b.endswith(b':'):
        v=s.recv(1)
        if not v: raise EOFError()
        b+=v
    size=int(b[:-1]); b=b''
    while len(b)<size: b+=s.recv(size-len(b))
    return json.loads(b)
def send(actor, typ, **kwargs):
    data=json.dumps(dict(to=actor,type=typ,**kwargs)).encode()
    s.sendall(str(len(data)).encode()+b':'+data)
    while True:
        result=read()
        if result.get('from')==actor: return result
read()
desc=send('root','getProcess',id=0)['processDescriptor']['actor']
target=send(desc,'getTarget')
print('Connected to isolated Zotero debugger')
console=target['process']['consoleActor']
text='''(async () => {
const Zotero = Services.wm.getMostRecentWindow('navigator:browser').Zotero;
if (!Zotero.DataDirectory.dir.includes('zotero-language-smoke-')) throw new Error('Not an isolated test instance');
await IOUtils.writeUTF8(PathUtils.join(Zotero.DataDirectory.dir,'runtime.json'), JSON.stringify({zotero:Zotero.version, app:Services.appinfo.version, id:Services.appinfo.ID}));
const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
const f = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);
f.initWithPath(__XPI__);
await AddonManager.installTemporaryAddon(f);
for(let i=0;i<80 && !Zotero.LanguageCompleter?.observer;i++) await Zotero.Promise.delay(100);
const scope = { Zotero, Services, IOUtils, PathUtils, Components };
Services.scriptloader.loadSubScript(__SMOKE__, scope);
await scope.runLanguageSmoke();
})().catch(e => IOUtils.writeUTF8(__ERROR__,String(e)+'\\n'+e.stack))'''.replace('__XPI__',json.dumps(str(testdir/'plugin'))).replace('__SMOKE__',json.dumps((root/'tests/zotero-smoke.js').as_uri())).replace('__ERROR__',json.dumps(str(testdir/'remote-error.txt')))
send(console,'evaluateJSAsync',text=text)
for _ in range(20):
    r=read()
    if r.get('hasException'): print(json.dumps(r))
    if r.get('type')=='evaluationResult':break
s.close()

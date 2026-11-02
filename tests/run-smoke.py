"""Create an isolated Zotero profile; never open or mutate the user's data directory."""
import json, pathlib, tempfile, shutil, subprocess, zipfile, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
testdir = pathlib.Path(tempfile.mkdtemp(prefix='zotero-language-smoke-'))
profile = testdir / 'profile'
data = testdir / 'data'
plugin = testdir / 'plugin'
profile.mkdir(); data.mkdir()
shutil.copytree(ROOT / 'plugin', plugin)
bootstrap = plugin / 'bootstrap.js'
text = bootstrap.read_text(encoding='utf-8')
text = text.replace('function onMainWindowLoad({ window }) { context?.LanguageCompleter.addMenu(window); }', '''var smokeStarted = false;
function onMainWindowLoad({ window }) {
  context?.LanguageCompleter.addMenu(window);
  if (!smokeStarted) { smokeStarted = true; setTimeout(runLanguageSmoke, 1500); }
}''')
text += '\n' + (ROOT / 'tests/zotero-smoke.js').read_text(encoding='utf-8')
bootstrap.write_text(text, encoding='utf-8')
(profile / 'extensions').mkdir()
with zipfile.ZipFile(profile / 'extensions/language-completer@zaodianshuijiao.local.xpi', 'w', zipfile.ZIP_DEFLATED) as z:
 for file in plugin.rglob('*'):
  if file.is_file(): z.write(file, file.relative_to(plugin).as_posix())
prefs = {
 'extensions.zotero.useDataDir': True,
 'extensions.zotero.dataDir': str(data),
 'extensions.zotero.firstRun2': False,
 'extensions.zotero.firstRunGuidance': False,
 'extensions.zoteroOpenOfficeIntegration.skipInstallation': True,
 'extensions.zoteroWinWordIntegration.skipInstallation': True,
 'extensions.zotero.httpServer.enabled': False,
 'extensions.zotero.sync.autoSync': False,
 'extensions.autoDisableScopes': 0,
 'extensions.enabledScopes': 15,
 'extensions.startupScanScopes': 15,
 'xpinstall.signatures.required': False,
 'app.update.auto': False,
 'app.update.enabled': False,
 'browser.shell.checkDefaultBrowser': False,
 'toolkit.telemetry.reportingpolicy.firstRun': False,
 'media.gmp-manager.updateEnabled': False,
 'devtools.debugger.remote-enabled': True,
 'devtools.debugger.prompt-connection': False,
 'devtools.chrome.enabled': True,
}
(profile / 'user.js').write_text('\n'.join('user_pref(' + json.dumps(k) + ', ' + json.dumps(v) + ');' for k,v in prefs.items()), encoding='utf-8')
startupinfo = subprocess.STARTUPINFO()
startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
startupinfo.wShowWindow = 0
env = dict(os.environ, MOZ_HEADLESS='1')
proc = subprocess.Popen([r'C:\Program Files\Zotero\zotero.exe', '-headless', '-no-remote', '-profile', str(profile), '-start-debugger-server', '56001', '-ZoteroDebugText'], env=env, startupinfo=startupinfo, stdout=open(testdir/'stdout.log','w'), stderr=open(testdir/'stderr.log','w'))
(ROOT / 'tests/last-smoke.json').write_text(json.dumps({'testdir': str(testdir), 'pid': proc.pid}), encoding='utf-8')
print(json.dumps({'testdir': str(testdir), 'pid': proc.pid, 'result': str(data/'smoke-result.json')}))

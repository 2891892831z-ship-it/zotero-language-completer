var chromeHandle;
var context;
function install() {}
function uninstall() {}
async function startup({ id, rootURI, resourceURI }) {
  await Zotero.initializationPromise;
  rootURI = rootURI || resourceURI.spec;
  // This is a local build with no hosted update service. Updates are installed from XPI.
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon = await AddonManager.getAddonByID(id);
  if (addon) addon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DISABLE;
  chromeHandle = Components.classes['@mozilla.org/addons/addon-manager-startup;1']
    .getService(Components.interfaces.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [['content', 'language-completer', rootURI + 'content/']]);
  context = { Zotero, Services, IOUtils, PathUtils, Components };
  Services.scriptloader.loadSubScript(rootURI + 'content/engine.js', context);
  Services.scriptloader.loadSubScript(rootURI + 'content/main.js', context);
  Zotero.LanguageCompleter = context.LanguageCompleter;
  await context.LanguageCompleter.start();
}
function onMainWindowLoad({ window }) { context?.LanguageCompleter.addMenu(window); }
function onMainWindowUnload({ window }) { context?.LanguageCompleter.removeMenu(window); }
async function shutdown(data, reason) {
  if (context) await context.LanguageCompleter.stop();
  delete Zotero.LanguageCompleter;
  chromeHandle?.destruct();
  chromeHandle = null;
  context = null;
}

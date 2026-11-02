const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'src/engine.js')], bundle: true, format: 'iife', globalName: 'LanguageEngine', target: 'firefox140', outfile: path.join(__dirname, 'plugin/content/engine.js'), legalComments: 'eof' });
const notices = ['Offline language model and code: franc-min 6.2.0 (MIT).', 'Bundled dependencies: trigram-utils, n-gram, collapse-white-space (MIT).'];
for (const name of ['franc-min', 'trigram-utils', 'n-gram', 'collapse-white-space']) {
  const store = path.join(__dirname, 'node_modules/.pnpm');
  const folder = fs.readdirSync(store).find(n => n.startsWith(name + '@'));
  const license = name === 'franc-min' ? path.join(__dirname, 'franc-LICENSE.txt') : path.join(store, folder, 'node_modules', name, 'license');
  notices.push('\n===== ' + name + ' =====\n' + fs.readFileSync(license, 'utf8'));
}
fs.writeFileSync(path.join(__dirname, 'plugin/THIRD-PARTY-LICENSES.txt'), notices.join('\n'));
console.log('Built offline engine and included third-party licenses.');

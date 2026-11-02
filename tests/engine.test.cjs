const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../plugin/content/engine.js'), 'utf8'), ctx);
const detect = data => ctx.LanguageEngine.detect(data);
test('Chinese geological article gets Chinese locale', () => {
  assert.equal(detect({ title: '东海陆架盆地断裂岩浆活动对氦气富集的控制作用' }).language, 'zh-CN');
});
test('English geological article with matching abstract gets en', () => {
  assert.equal(detect({ title: 'The influence of fault activity on helium accumulation in sedimentary basins', abstractNote: 'This study investigates the influence of fault activity on the migration and accumulation of helium in sedimentary basins. Geological and geochemical data indicate that deep faults provide pathways for mantle gases and control the spatial distribution of natural gas reservoirs.' }).language, 'en');
});
test('Existing values are never proposed for replacement', () => {
  assert.equal(detect({ title: '东海陆架盆地断裂岩浆活动对氦气富集的控制作用', language: 'English' }).language, '');
});
test('English translation of a Chinese journal article needs review', () => {
  assert.equal(detect({ title: 'The influence of fault activity on helium accumulation in sedimentary basins', publicationTitle: '天然气地球科学' }).language, '');
  assert.equal(detect({ title: 'The influence of fault activity on helium accumulation in sedimentary basins', url: 'https://www.cnki.net/article/123' }).language, '');
});
test('Short, mixed, missing, and non-English titles stay unmodified', () => {
  for (const title of ['', 'Helium', 'Helium in China', 'He富集', '地質学と天然ガスの研究について', 'Untersuchungen zur Migration von Erdgas in sedimentären Becken', 'Исследование миграции газа в осадочных бассейнах']) {
    assert.equal(detect({ title }).language, '', title);
  }
});
test('Conflicting English title and Chinese abstract stays unmodified', () => {
  assert.equal(detect({ title: 'The influence of fault activity on helium accumulation in sedimentary basins', abstractNote: '本研究主要讨论断裂活动与氦气运移之间的联系。'.repeat(12) }).language, '');
});

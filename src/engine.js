import { francAll } from 'franc-min';

export function clean(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/https?:\S+/g, ' ').replace(/\s+/g, ' ').trim();
}
function rank(text) {
  const scores = francAll(text, { minLength: 20 });
  return { language: scores[0]?.[0], margin: (scores[0]?.[1] || 0) - (scores[1]?.[1] || 0) };
}
export function detect(data) {
  const title = clean(data.title);
  const abstract = clean(data.abstractNote).slice(0, 6000);
  const journal = clean(data.publicationTitle);
  const wait = reason => ({ language: '', reason });
  if (String(data.language || '').trim()) return wait('已有语言，保留原值');
  if (!title) return wait('缺少标题');
  if (/[\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/u.test(title)) return wait('检测到其他语种文字，待核实');
  const han = (title.match(/\p{Script=Han}/gu) || []).length;
  const latin = (title.match(/[A-Za-z]/g) || []).length;
  if (han >= 6 && han / (han + latin || 1) >= 0.45) {
    if (/[\u3040-\u30ff]/u.test(journal)) return wait('标题与刊名可能涉及日文，待核实');
    return { language: 'zh-CN', reason: '标题以中文汉字为主（元数据推断）' };
  }
  if (han) return wait('标题中英文混排或中文过短，待核实');
  if (/\p{Script=Han}/u.test(journal) || /(?:cnki|wanfangdata|cqvip)\./i.test(data.url || '')) return wait('英文标题但来源可能为中文文献，待核实');
  if (latin < 25 || title.split(/\s+/).length < 5) return wait('标题信息不足，待核实');
  if (/[\p{L}]/u.test(title.replace(/[A-Za-z]/g, ''))) return wait('含其他语种字母，待核实');
  const t = rank(title);
  if (t.language !== 'eng') return wait('标题未可靠识别为英文，待核实');
  if (abstract.length >= 100) {
    if (/\p{Script=Han}/u.test(abstract) || /[\u3040-\u30ff\u0400-\u04ff]/u.test(abstract)) return wait('标题与摘要语言不一致，待核实');
    const a = rank(abstract);
    if (a.language !== 'eng') return wait('摘要未识别为英文，待核实');
    if (a.margin >= 0.08 && t.margin >= 0.04) return { language: 'en', reason: '标题与摘要均匹配英文模型（元数据推断）' };
  }
  if (latin >= 50 && t.margin >= 0.15) return { language: 'en', reason: '较长标题匹配英文模型（元数据推断）' };
  return wait('英文特征不足，待核实');
}

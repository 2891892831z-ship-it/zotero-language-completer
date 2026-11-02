/* Privileged local dialog. All bibliographic strings are rendered via textContent. */
window.addEventListener('DOMContentLoaded', () => {
  const { controller: api, owner } = window.arguments[0];
  const $ = id => document.getElementById(id);
  const html = tag => document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  let rows = [], page = 0, working = false, cancelled = false;
  $('focus-list').addEventListener('click', () => {
    const expanded = document.body.classList.toggle('list-expanded');
    $('focus-list').textContent = expanded ? '恢复完整界面' : '展开列表';
    $('focus-list').setAttribute('aria-pressed', String(expanded));
  });
  $('auto').checked = api.auto;
  $('auto').addEventListener('change', () => { api.auto = $('auto').checked; if (!api.auto) api.pending.clear(); });
  window.addEventListener('unload', () => { cancelled = true; api.dialogs.delete(window); });
  const progress = (done, total) => { $('progress').max = total || 1; $('progress').value = done; $('status').textContent = `正在处理 ${done} / ${total} 项…`; };
  const selected = () => rows.filter(r => r.selected && r.proposed);
  const reviewSelected = () => rows.filter(r => r.selected && !r.proposed && r.editable !== false);
  const update = () => {
    const n = selected().length, ready = rows.filter(r => r.proposed).length;
    $('chosen').textContent = `已选 ${n} 项`;
    $('apply').disabled = working || !n;
    $('report').disabled = working || !rows.length;
    $('all').disabled = working || !ready;
    $('all').checked = !!ready && n === ready;
    $('all').indeterminate = n > 0 && n < ready;
    const reviewCount = reviewSelected().length;
    $('review-selected').textContent = `已选待确认 ${reviewCount} 项`;
    $('batch-en').disabled = $('batch-zh').disabled = working || !reviewCount;
    $('select-review').disabled = $('clear-review').disabled = working || !rows.some(r => !r.proposed && r.editable !== false);
  };
  function render() {
    const filter = $('filter').value, query = $('search').value.trim().toLocaleLowerCase();
    const filtered = rows.filter(r => (filter === 'all' || (filter === 'ready' ? !!r.proposed : !r.proposed)) && r.title.toLocaleLowerCase().includes(query));
    // Stable sort: unresolved rows first, preserving order within each group.
    filtered.sort((a, b) => Number(!!a.proposed) - Number(!!b.proposed));
    const pages = Math.ceil(filtered.length / 100);
    page = Math.max(0, Math.min(page, pages - 1));
    $('results').replaceChildren();
    for (const row of filtered.slice(page * 100, page * 100 + 100)) {
      const tr = html('tr');
      tr.className = row.proposed ? '' : 'needs-review';
      const cell = html('td'), box = html('input');
      box.type = 'checkbox'; box.checked = row.selected; box.disabled = working || row.editable === false;
      box.setAttribute('aria-label', '补全：' + row.title);
      box.addEventListener('change', () => { row.selected = box.checked; update(); });
      cell.appendChild(box); tr.appendChild(cell);
      const title = html('td'); title.textContent = row.title || '（无标题）'; tr.appendChild(title);
      const languageCell = html('td'), language = html('div');
      const result = html('div');
      result.className = 'language-result';
      result.textContent = row.proposed ? (row.proposed === 'en' ? '英文 · en' : '中文 · zh-CN') : '待确认';
      const source = html('small');
      source.className = 'language-source';
      source.textContent = row.originalReason !== undefined ? '已手动调整' : row.proposed ? '自动识别' : '未能可靠识别';
      const edit = html('button');
      edit.type = 'button'; edit.className = 'edit-language'; edit.textContent = '修改';
      edit.disabled = working || row.editable === false;
      edit.addEventListener('click', () => { row.editing = !row.editing; render(); });
      languageCell.append(result, source, edit);
      language.className = 'language-choice';
      language.style.display = row.editing ? 'flex' : 'none';
      language.setAttribute('role', 'group');
      language.setAttribute('aria-label', '选择语言：' + row.title);
      for (const [value, label] of [['en', '英文'], ['zh-CN', '中文'], ['', '不填写']]) {
        const button = html('button');
        button.type = 'button'; button.textContent = label;
        button.setAttribute('data-language', value);
        button.setAttribute('aria-pressed', String(row.proposed === value));
        button.disabled = working || row.editable === false;
        button.addEventListener('click', () => {
          if (row.originalReason === undefined) row.originalReason = row.reason;
          row.proposed = value;
          row.editing = false;
          row.selected = !!value;
          row.reason = value ? `手动指定为 ${value}；原判定：${row.originalReason}` : `手动选择不填写；原判定：${row.originalReason}`;
          const scroll = document.querySelector('.table-wrap');
          const top = scroll.scrollTop;
          render();
          scroll.scrollTop = top;
        });
        language.appendChild(button);
      }
      languageCell.appendChild(language); tr.appendChild(languageCell);
      const reason = html('td'); reason.textContent = row.reason; tr.appendChild(reason);
      $('results').appendChild(tr);
    }
    $('count').textContent = `缺失 ${rows.length} · 可补全 ${rows.filter(r => r.proposed).length} · 待确认 ${rows.filter(r => !r.proposed).length}`;
    $('page').textContent = `${pages ? page + 1 : 0} / ${pages}`;
    $('previous').disabled = working || page === 0;
    $('next').disabled = working || page + 1 >= pages;
    update();
  }
  async function run(action) {
    working = true; cancelled = false;
    for (const id of ['scan', 'undo', 'scope', 'auto']) $(id).disabled = true;
    $('cancel').disabled = false; render();
    try { await action(); } catch (e) { $('status').textContent = '操作未完成：' + e.message; }
    finally {
      working = false;
      if (!window.closed) {
        for (const id of ['scan', 'undo', 'scope', 'auto']) $(id).disabled = false;
        $('cancel').disabled = true; render();
      }
    }
  }
  $('cancel').addEventListener('click', () => { cancelled = true; $('status').textContent = '正在停止；已完成的修改有记录，可撤销。'; });
  $('scan').addEventListener('click', () => run(async () => {
    $('status').textContent = '正在读取文献…';
    rows = await api.scan($('scope').value, owner, progress, () => cancelled);
    page = 0;
    $('status').textContent = cancelled ? '扫描已停止，以下为已扫描结果。' : '已自动识别语言。黄色为待确认条目；任何一行均可点击“修改”调整，确认后统一补全。';
  }));
  $('apply').addEventListener('click', () => run(async () => {
    const result = await api.apply(selected(), 'manual', progress, () => cancelled);
    $('status').textContent = `${cancelled ? '已停止。' : ''}已补全 ${result.applied} 项，跳过或失败 ${result.skipped} 项。修改记录：${result.path}`;
    // Re-scan after changes so successful and concurrently edited items cannot be re-applied.
    rows = await api.scanItems(await apiItems(rows.map(r => r.id)), false);
  }));
  async function apiItems(ids) { return owner.Zotero.Items.getAsync(ids); }
  $('undo').addEventListener('click', () => run(async () => {
    const result = await api.undo(progress, () => cancelled);
    $('status').textContent = `已撤销 ${result.restored} 项；之后已编辑或不可用的 ${result.skipped} 项未改动。`;
    rows = []; page = 0;
  }));
  $('report').addEventListener('click', () => run(async () => { const path = await api.exportReport(rows); $('status').textContent = '核对清单已导出：' + path; }));
  $('select-review').addEventListener('click', () => { rows.forEach(r => { if (!r.proposed && r.editable !== false) r.selected = true; }); render(); });
  $('clear-review').addEventListener('click', () => { rows.forEach(r => { if (!r.proposed) r.selected = false; }); render(); });
  function batchLanguage(value) {
    const targets = reviewSelected();
    for (const row of targets) {
      if (row.originalReason === undefined) row.originalReason = row.reason;
      row.proposed = value; row.editing = false;
      row.reason = `批量手动指定为 ${value}；原判定：${row.originalReason}`;
    }
    page = 0; render();
    $('status').textContent = `已在预览中将 ${targets.length} 条待确认文献指定为${value === 'en' ? '英文' : '中文'}，尚未写入 Zotero。核对后点击“补全选中项”。`;
  }
  $('batch-en').addEventListener('click', () => batchLanguage('en'));
  $('batch-zh').addEventListener('click', () => batchLanguage('zh-CN'));
  $('all').addEventListener('change', () => { rows.forEach(r => { if (r.proposed) r.selected = $('all').checked; }); render(); });
  $('filter').addEventListener('change', () => { page = 0; render(); });
  $('search').addEventListener('input', () => { page = 0; render(); });
  $('previous').addEventListener('click', () => { page--; render(); });
  $('next').addEventListener('click', () => { page++; render(); });
  render();
});

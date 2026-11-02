/* Uses only Zotero item APIs for writes; no direct database mutation. */
var LanguageCompleter = {
  pref: 'extensions.language-completer.',
  alive: false, busy: false, pending: new Set(), windows: new Set(), dialogs: new Set(), timer: null,
  get auto() { return Zotero.Prefs.get(this.pref + 'automatic', true) === true; },
  set auto(value) { Zotero.Prefs.set(this.pref + 'automatic', !!value, true); },
  async start() {
    this.alive = true;
    this.directory = PathUtils.join(Zotero.DataDirectory.dir, 'language-completer');
    await IOUtils.makeDirectory(this.directory, { ignoreExisting: true });
    this.observer = Zotero.Notifier.registerObserver({ notify: (event, type, ids) => {
      if (!this.alive || !this.auto || type !== 'item') return;
      if (event === 'add') {
        for (const id of ids) this.pending.add(Number(id));
        this.schedule();
      } else if (event === 'modify' && ids.some(id => this.pending.has(Number(id)))) this.schedule();
    } }, ['item'], 'language-completer');
    for (const win of Zotero.getMainWindows()) this.addMenu(win);
  },
  async stop() {
    this.alive = false;
    if (this.observer) Zotero.Notifier.unregisterObserver(this.observer);
    this.cancelTimer();
    for (const d of this.dialogs) if (!d.closed) d.close();
    for (const w of this.windows) this.removeMenu(w);
    // Finish an already-running atomic save before the bootstrap scope is discarded.
    while (this.busy) await Zotero.Promise.delay(50);
  },
  cancelTimer() { if (this.timer) { this.timer.cancel(); this.timer = null; } },
  schedule() {
    this.cancelTimer();
    this.timer = Components.classes['@mozilla.org/timer;1'].createInstance(Components.interfaces.nsITimer);
    this.timer.initWithCallback(() => { this.timer = null; this.flush().catch(e => Zotero.logError(e)); }, 4000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
  },
  async flush() {
    if (!this.alive || !this.auto) { this.pending.clear(); return; }
    if (this.busy) { this.schedule(); return; }
    const ids = [...this.pending];
    this.pending.clear();
    try {
      this.busy = true;
      let rows;
      try { rows = await this.scanItems(await Zotero.Items.getAsync(ids), true); }
      finally { this.busy = false; }
      const chosen = rows.filter(row => row.proposed);
      if (chosen.length && this.alive && this.auto) await this.apply(chosen, 'automatic');
    } catch (e) { Zotero.logError(e); this.lastError = String(e); }
  },
  addMenu(win) {
    const doc = win.document;
    if (doc.getElementById('language-completer-menu')) return;
    const parent = doc.getElementById('menu_ToolsPopup');
    if (!parent) return;
    const entry = doc.createXULElement('menuitem');
    entry.id = 'language-completer-menu';
    entry.setAttribute('label', '文献语言补全…');
    entry.addEventListener('command', () => this.open(win));
    parent.appendChild(entry);
    this.windows.add(win);
  },
  removeMenu(win) { win.document.getElementById('language-completer-menu')?.remove(); this.windows.delete(win); },
  open(win) {
    for (const d of this.dialogs) { if (!d.closed) { d.focus(); return d; } this.dialogs.delete(d); }
    const width = Math.max(760, Math.min(1400, win.screen.availWidth - 60));
    const height = Math.max(600, Math.min(980, win.screen.availHeight - 70));
    const d = win.openDialog('chrome://language-completer/content/panel.xhtml', 'language-completer', `chrome,centerscreen,resizable,width=${width},height=${height}`, { controller: this, owner: win });
    this.dialogs.add(d);
    return d;
  },
  fields(item) {
    const get = field => { try { return item.getField(field, false, true) || ''; } catch { return ''; } };
    return { title: get('title'), language: get('language'), abstractNote: get('abstractNote'), publicationTitle: get('publicationTitle'), url: get('url') };
  },
  async scanItems(items, personalOnly = false, progress = () => {}, cancelled = () => false) {
    const rows = [];
    const seen = new Set();
    for (let i = 0; i < items.length; i++) {
      if (!this.alive || cancelled()) break;
      const item = items[i];
      if (!item || seen.has(item.id) || !item.isRegularItem() || item.deleted) continue;
      seen.add(item.id);
      if (personalOnly && item.libraryID !== Zotero.Libraries.userLibraryID) continue;
      const fields = this.fields(item);
      if (fields.language.trim()) continue;
      let result = LanguageEngine.detect(fields);
      if (!item.isEditable()) result = { language: '', reason: '文献库只读，跳过' };
      rows.push({ id: item.id, libraryID: item.libraryID, key: item.key, editable: item.isEditable(), title: fields.title, before: fields.language,
        proposed: result.language, reason: result.reason, selected: !!result.language, snapshot: JSON.stringify(fields) });
      if (i % 80 === 0) { progress(i + 1, items.length); await Zotero.Promise.delay(0); }
    }
    return rows;
  },
  async scan(scope, owner, progress, cancelled) {
    if (this.busy) throw new Error('另一项补全或撤销操作正在运行，请稍后重试');
    this.busy = true;
    try {
      const items = scope === 'selected' ? owner.ZoteroPane.getSelectedItems()
        : await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, true, false);
      if (scope === 'selected' && !items.length) throw new Error('请先在 Zotero 主窗口选择需要处理的文献');
      return await this.scanItems(items, false, progress, cancelled);
    } finally { this.busy = false; }
  },
  async writeJournal(path, journal) {
    await IOUtils.writeUTF8(path, JSON.stringify(journal, null, 2), { tmpPath: path + '.tmp', flush: true });
  },
  async appendEvent(path, entry) {
    const event = { id: entry.id, key: entry.key, status: entry.status, afterModified: entry.afterModified, detail: entry.detail };
    await IOUtils.writeUTF8(path + '.events.jsonl', JSON.stringify(event) + '\n', { mode: 'append', flush: true });
  },
  async readJournal(path) {
    const journal = JSON.parse(await IOUtils.readUTF8(path));
    if (journal.schema !== 1 || !Array.isArray(journal.entries)) throw new Error('修改记录格式不正确');
    if (await IOUtils.exists(path + '.events.jsonl')) {
      const entries = new Map(journal.entries.map(e => [e.id + ':' + e.key, e]));
      const lines = (await IOUtils.readUTF8(path + '.events.jsonl')).trim().split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        let event;
        try { event = JSON.parse(lines[i]); }
        catch (e) { if (i === lines.length - 1) break; throw e; } // A torn final append is left for manual review.
        const entry = entries.get(event.id + ':' + event.key);
        if (entry) Object.assign(entry, event);
      }
    }
    return journal;
  },
  async apply(rows, mode = 'manual', progress = () => {}, cancelled = () => false) {
    if (this.busy) throw new Error('另一项操作正在运行，请稍后重试');
    this.busy = true;
    let journal;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const path = PathUtils.join(this.directory, 'changes-' + stamp + '-' + Zotero.Utilities.randomString(6) + '.json');
      journal = { schema: 1, mode, created: new Date().toISOString(), entries: rows.filter(r => r.proposed && r.selected !== false).map(r => ({ ...r, after: r.proposed, status: 'planned' })) };
      if (!journal.entries.length) return { applied: 0, skipped: 0, path: '' };
      // Complete plan reaches disk before the first field is changed.
      await this.writeJournal(path, journal);
      await IOUtils.writeUTF8(path + '.events.jsonl', '', { flush: true });
      let applied = 0, skipped = 0;
      for (const entry of journal.entries) {
        if (!this.alive || cancelled()) break;
        const item = await Zotero.Items.getAsync(entry.id);
        const fresh = item && this.fields(item);
        if (!item || item.key !== entry.key || item.libraryID !== entry.libraryID || item.deleted || !item.isEditable()
          || fresh.language.trim() || JSON.stringify(fresh) !== entry.snapshot) {
          entry.status = 'skipped'; entry.detail = '预览后内容已改变，或条目已不可编辑'; skipped++;
        } else {
          try {
            item.setField('language', entry.after);
            await item.saveTx();
            entry.status = 'applied'; entry.afterModified = item.getField('dateModified'); applied++;
          } catch (e) {
            // A failed save must not leave a dirty in-memory value to be saved by another action.
            await item.reload(null, true);
            entry.status = 'failed'; entry.detail = String(e); skipped++;
          }
        }
        await this.appendEvent(path, entry);
        if (entry.status === 'applied' && applied === 1) Zotero.Prefs.set(this.pref + 'lastJournal', path, true);
        progress(applied + skipped, journal.entries.length);
        if ((applied + skipped) % 20 === 0) await Zotero.Promise.delay(0);
      }
      journal.finished = new Date().toISOString();
      await this.writeJournal(path, journal);
      return { applied, skipped, path };
    } finally { this.busy = false; }
  },
  async undo(progress = () => {}, cancelled = () => false) {
    if (this.busy) throw new Error('另一项操作正在运行，请稍后重试');
    const path = Zotero.Prefs.get(this.pref + 'lastJournal', true);
    if (!path) throw new Error('没有可撤销的修改记录');
    this.busy = true;
    try {
      const journal = await this.readJournal(path);
      if (!await IOUtils.exists(path + '.events.jsonl')) await IOUtils.writeUTF8(path + '.events.jsonl', '', { flush: true });
      let restored = 0, skipped = 0;
      for (const entry of journal.entries) {
        if (!this.alive || cancelled()) break;
        if (entry.status !== 'applied') continue;
        const item = await Zotero.Items.getAsync(entry.id);
        if (!item || item.key !== entry.key || item.libraryID !== entry.libraryID || item.deleted || !item.isEditable()
          || item.getField('language') !== entry.after || item.getField('dateModified') !== entry.afterModified) { skipped++; continue; }
        try {
          item.setField('language', entry.before);
          await item.saveTx();
        } catch (e) { await item.reload(null, true); throw e; }
        entry.status = 'restored'; restored++;
        await this.appendEvent(path, entry);
        progress(restored + skipped, journal.entries.length);
        if ((restored + skipped) % 20 === 0) await Zotero.Promise.delay(0);
      }
      await this.writeJournal(path, journal);
      return { restored, skipped, path };
    } finally { this.busy = false; }
  },
  async exportReport(rows) {
    const escape = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = [['文库ID', '条目Key', '标题', '原语言', '建议语言', '判定依据'].map(escape).join(',')];
    rows.forEach(r => csv.push([r.libraryID, r.key, r.title, r.before, r.proposed || '待确认', r.reason].map(escape).join(',')));
    const path = PathUtils.join(this.directory, 'review-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
    await IOUtils.writeUTF8(path, '\uFEFF' + csv.join('\r\n'));
    Zotero.File.reveal(path);
    return path;
  }
};

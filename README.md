---
date modified: 2026.11.02 13:02:46
---

# 文献语言补全

为 Zotero 10 批量补全空白的语言字段。当前版本：1.0.7。

## 功能

- 在本机根据标题和摘要推断英文 `en` / 中文 `zh-CN`，保留已有语言。
- 无法可靠识别的条目整行标黄并置顶，支持逐条调整和批量指定。
- 先预览，后写入；记录语言变更，支持撤销最近一批。
- 可开启新导入条目的自动补全；默认关闭。
- 支持搜索、筛选、CSV 清单导出和展开列表。

## 安装

安装包位于 `dist/`。Windows 选择 `.xpi`；Mac 使用 `dist/Mac/` 内的 `.xpi`，或下载 Mac 安装 ZIP。

1. Zotero 主窗口 → 工具 → 插件 → 齿轮 → 从文件安装插件。
2. 选择 XPI。退出并重新打开 Zotero；Mac 使用 ⌘Q 完全退出。
3. Zotero 主窗口 → 工具 → 文献语言补全 → 扫描并预览。
4. 核对识别结果。黄色条目可手动修改，或勾选后批量指定英文 / 中文。
5. 点击“补全选中项”写入。此时之前勾选的自动识别条目也会补全。

“选中全部待确认”包含全部页，不受当前搜索和筛选限制；批量指定只改变勾选的待确认项。

## 兼容与边界

声明兼容 Zotero 10。1.0.7 在 Windows Zotero 10.0.7 独立测试库通过 52 项检查，验证记录位于 `tests/verified-1.0.7-zotero-10.0.7.json`。

Mac 安装包与通用 XPI 内容相同，无平台专用二进制。已检查路径及接口的跨平台用法，但尚未在 Mac 实机验证。

语言识别依据元数据，无法保证与全文语言始终一致。补齐语言后，参考文献输出“等”还是“et al.”仍取决于 CSL 样式。插件不修改引用样式。

本地版没有托管的更新服务；清单中的 `example.invalid` 是不可解析的保留域名占位地址，本插件后台更新已关闭。升级请手动安装新 XPI。

修改记录存放在 Zotero 数据目录的 `language-completer/` 中，仅记录语言变更，不代替完整文献库备份。撤销会跳过之后被编辑的条目。

## 开发

需要 Node.js、pnpm，以及打包用 Python 3。

```sh
pnpm install
node build.cjs
node --test tests/engine.test.cjs
python package.py
```

`plugin/` 为插件运行文件，`src/engine.js` 为识别源代码。第三方依赖使用 MIT 许可证，说明位于 `plugin/THIRD-PARTY-LICENSES.txt`。

`tests/run-smoke.py` 和 `tests/remote-smoke.py` 是 Windows 开发环境集成测试脚本，使用临时配置和独立数据目录。不要将测试配置指向真实文献库。
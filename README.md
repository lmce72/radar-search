# Radar Search

**在 Obsidian 里，一处查找笔记、正文、标签、命令与网页。**

[简体中文](README.md) · [English](docs/README.en.md) · [日本語](docs/README.ja.md) · [한국어](docs/README.ko.md) · [Español](docs/README.es.md)

## English

Radar Search is a universal search plugin for Obsidian. It searches note names, full text, tags, properties, bookmarks, internal and external links, commands, and the web from one place. Open a floating search for a quick lookup, keep a search page open while you explore, or embed a search bar in a note. The plugin UI is currently in Chinese; see the [English guide](docs/README.en.md) for labels and details.

- Search notes by name or content, including Chinese/CJK text. Click a text excerpt to jump to the matching location.
- Browse results by category, sort them, and temporarily exclude a note or any parent folder. Filters can be saved as presets.
- Search commands and the web, with configurable engines, sources, and an external-browser or Web viewer target.
- Works on desktop and mobile; no Dataview, Iconize, or other plugin is required.

Requires Obsidian 1.7.2 or later. Installation, release files, and the full feature guide are in the [English guide](docs/README.en.md).

---

Radar Search 适合经常在笔记、命令和浏览器之间切换的人。按快捷键呼出搜索，或打开一个搜索页慢慢筛选；也可以把搜索栏放进自己的首页笔记。不需要 Dataview、Iconize 或其他前置插件。

## 能做什么

- **搜笔记，也搜正文**：查找文件名、正文、标签、属性、书签、内链和外链；支持中文检索。正文摘要可点击跳转到对应匹配处。
- **按类别浏览**：结果顶栏切换类别，选中项有高亮下划线；没有匹配的类别会置灰。
- **少看无关结果**：临时排除当前笔记或任意一级父目录，或把过滤条件保存成预设，下次直接用。
- **保持搜索现场**：将浮动搜索转到搜索页时，保留关键词、类别、过滤和排序。
- **搜网页、找命令**：全局模式组合多种来源；互联网模式可选择搜索引擎与站点。
- **随主题显示**：适配浅色、深色主题；页面结果可滚动，分页区为移动端底部控件留出空间。

## 安装

需要 **Obsidian 1.7.2 或更高版本**。

1. 从 [最新发布](https://github.com/lmce72/radar-search/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在仓库配置目录下创建 `plugins/primecore-search/`，把三个文件放进去。默认完整路径为 `.obsidian/plugins/primecore-search/`。
3. 在 **设置 → 第三方插件** 中启用 **Radar Search**。

升级时替换这三个文件，然后关闭再开启插件。保留 `data.json` 和 `history/` 即可保留设置与历史。请勿从陌生来源下载插件文件。

## 开始搜索

打开 Obsidian 命令面板，查找 Radar Search，选择：

| 入口 | 适用场景 |
| --- | --- |
| 打开浮动搜索框 | 快速查找后回到当前笔记；Esc 或点击外部关闭 |
| 打开搜索页 | 长时间筛选、查看多页结果，或在手机上使用 |

这两个入口可分别绑定快捷键。左侧 Ribbon 图标打开浮动搜索。插件界面的控件目前以中文显示；下方提供五种语言的使用文档。

搜索栏左侧选择 **Vault / 全局 / 互联网**。Vault 和全局模式在输入后自动更新结果，按回车可立即搜索；互联网模式使用搜索按钮或回车打开搜索网址。点击左侧 **搜索选项** 大胶囊可更改搜索来源和预设，面板右上角的齿轮进入插件设置。

结果顶栏的类别图标在悬停或键盘聚焦时显示名称；触屏可按图标切换。排序与过滤入口位于右侧。所有类别都没有匹配时显示“什么都木有”；过滤入口仍可用，方便清除筛选条件。

### 在笔记中放一个搜索栏

把下面的代码块复制进笔记，在阅读视图或实时预览中使用：

````markdown
```primecore-search
```
````

同一笔记可以放多个搜索栏。无需编写 DataviewJS。旧版 `primecore-searchbar.js` 脚本是独立入口，不会随插件升级。

## 过滤与预设

点击结果项右侧的多级排除图标，可排除该笔记或某一级父目录。菜单顶部选择 **临时过滤** 或 **写入预设**；切换用途不会关闭菜单。临时过滤只影响当前搜索，不会改写全局设置。

需要更多条件时，打开结果右侧过滤器。每行填一条路径、glob 或正则规则；目录输入支持自动补全。点击 **保存为预设** 后，填写名称并保存。设置页也可以管理全局排除规则和预设，并添加常用示例。

| 规则示例 | 效果 |
| --- | --- |
| `Projects/Archive` | 匹配此目录及其子目录 |
| `path:Projects/[notes]` | 按字面匹配路径，不把方括号当通配符 |
| `glob:**/assets/**` | 匹配任意层级的 assets 目录，包括仓库根目录下的 assets |
| `glob:**/{assets,attachments,附件}/**` | 匹配多种附件目录 |
| `regex:/\.(png|jpe?g|gif|webp|svg|pdf)$/i` | 匹配图片和 PDF，忽略扩展名大小写 |
| `exclude:path:Work/assets` | 强制排除，可与白名单的包含条件搭配 |

`**/assets/**` 是 **glob 通配模式**，不是正则：`*` 不跨目录，`**` 可以跨多层目录。黑名单排除匹配项，白名单仅保留匹配项。同一列表多条规则按“任意一条匹配”组合。正则必须以 `regex:` 开头；这里不支持任意 Obsidian 原生搜索查询语法。无效规则会在保存前提示。

## 设置与数据

复杂配置使用表格、逐项列表和带返回键的子页面，不需要编辑 JSON。表格改完后点击 **保存修改**；进入条目子页面后点击 **应用** 返回，最后保存所属表格。直接返回会保留父页面草稿，不会应用当前条目的修改。

- 设置保存在插件目录的 `data.json`，搜索历史保存在 `history/`。
- 正文索引只在内存中建立；大量笔记首次搜索时可能需要等待。可用命令面板的重建索引入口刷新索引。
- 历史天数设置只控制显示范围，不会自动删除历史文件。
- 插件没有遥测，也不读取仓库以外的文件。
- **全局和互联网模式可能把输入文本发送给已启用搜索引擎的建议词接口。** 不希望发送输入时，请禁用对应引擎或清空建议词接口。执行网页搜索时，会打开对应搜索网址。
- 内置网页打开需要 Obsidian 的 Web viewer；不可用时会使用外部浏览器。

## 遇到问题

结果缺失时，先检查搜索选项、当前类别、预设和临时过滤；正文搜索还需要启用正文来源。样式异常时，请在默认主题下对照检查，并在 [Issues](https://github.com/lmce72/radar-search/issues) 中提供插件版本、Obsidian 版本、设备、主题、复现步骤和截图。提交截图或日志前请隐藏私人内容。

## 开发与贡献

源码、构建和测试使用 TypeScript，构建需要 Bun 1.3+。Obsidian API 由宿主提供。

```sh
bun install --frozen-lockfile
bun run check
bun test --timeout 5000
bun run build
```

构建产物位于 `dist/`。`src/ui/` 管理搜索界面，`src/search/` 管理查询和索引，`src/settings/` 管理设置，`src/history/` 管理历史。请在独立测试仓库验证浮动、页面及阅读/实时预览嵌入入口；移动端布局验证不能代替真机触摸测试。

发布规范见 [AGENT.MD](AGENT.MD)。Git tag 与 Release 标题必须只包含与 `manifest.json` 完全一致的版本号，例如 `1.3.5`，不加 `v`。发布前执行 `bun run release:check <版本号>`，仅上传三个插件文件，不上传个人数据。

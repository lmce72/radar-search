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

- **搜笔记，也搜正文**：查找文件名、正文、标签、属性、书签、内链和外链；支持中文检索。正文摘要可点击跳转到对应匹配处。每个内容摘要块在“第 n 行”左侧显示强调色序号。
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

升级时替换这三个文件，然后关闭再开启插件。保留 `data.json`、`history/` 和可选的 `recent-files.json` 即可保留设置与记录。请勿从陌生来源下载插件文件。

## 开始搜索

打开 Obsidian 命令面板，查找 Radar Search，选择：

| 入口 | 适用场景 |
| --- | --- |
| 打开浮动搜索框 | 快速查找后回到当前笔记；Esc 或点击外部关闭 |
| 打开搜索页 | 长时间筛选、查看多页结果，或在手机上使用 |

这两个入口可分别绑定快捷键。左侧 Ribbon 图标打开浮动搜索。插件界面的控件目前以中文显示；下方提供五种语言的使用文档。

搜索栏左侧选择 **Vault / 全局 / 互联网**。Vault 和全局模式在输入后自动更新结果，按回车可立即搜索；互联网模式使用搜索按钮或回车打开搜索网址。点击输入框旁的 **搜索选项** 图标可选择预设，图标使用当前预设图标，面板右上角的齿轮进入插件设置。

搜索词为空时，顶栏左侧类别图标可直接开启或关闭搜索来源，强调色表示开启，默认自动保存。右侧 **临时生效设定** 默认关闭；开启后，来源和 Markdown 元素筛选只对当前搜索栏生效，关闭时将当前来源和元素选择一并保存为永久设置；保存失败则保留临时模式与当前选择，可重试。输入搜索词后，左侧类别用于切换结果。桌面类别栏支持拖动排序与水平滚动，窄屏改用图标下拉菜单；种类开关多选后菜单保持打开。顶栏第一个类别是默认视图，右侧图钉标记，拖动到首位会自动成为默认；默认类别没有结果时自动跳到下一个有结果的类别。临时开关只在搜索词为空时显示。手机搜索输入行保持单行；窄宽度下结果标题与内容自动换行。全局模式可用选项面板左上角的仓库／互联网下边框标签切换两类选项。

结果顶栏的类别图标在悬停或键盘聚焦时显示名称；触屏可按图标切换。排序与过滤入口位于右侧。元素筛选栏与最近打开类型栏采用与“后缀过滤”一致的圆角边框卡片，左侧静态标注“元素筛选”“类型筛选”，窄屏只保留图标。过滤器的快捷排除目标单行排列：左侧截断显示当前文件或目录，右侧直接排除文件或各级父目录，长路径可悬停查看完整值。搜索选项提供“默认展开内容”，初始开启；关闭后内容、Markdown 元素和标签关联文档默认折叠，新查询遵循该设定，当前查询仍可手动展开／收起。所有类别都没有匹配时显示“什么都木有”；过滤入口仍可用，方便清除筛选条件。

### 历史目标与最近打开

历史条目的查询词可重新搜索，下方目标按钮可直接打开笔记、定位标签或正文匹配、执行命令，或恢复网页与书签目标。新记录保存精确路径、位置或命令 ID；旧记录只有显示名，无法唯一确定目标时会提示重新搜索。已删除的笔记不会由历史跳转重新创建。

新标签页提供 **Radar Search** 图标入口，可在设置中关闭。**设置 → 新标签页与最近打开 → 记录最近打开的内容** 默认关闭；开启后记录打开的文件（含 PDF、图片等非 Markdown 附件）和在搜索栏执行的命令。搜索框空闲时点击记录类型下拉菜单，可在“最近打开”和“搜索历史”之间切换。每条记录左侧显示类型图标，非 Markdown 文件名前标注大写后缀；按最近打开时间去重；方向键选择后按 Enter 打开。从快速切换导入的记录并入同一时间线，不再单列分组。

最近打开下方提供类型过滤：Markdown、命令、PDF、Canvas、图片和其他。桌面只显示类型图标，悬停／长按显示名称；窄屏顶栏直接显示前五种图标，“其他类型”下拉包含其他和自定义后缀，菜单多选后保持打开。桌面末尾加号、窄屏下拉内的添加区可添加普通或复合后缀，例如 `.excalidraw`、`.excalidraw.md`；也可在设置中管理这些类型。插件会读取宿主可用的后缀处理绑定，找不到时说明需要外部应用或手动指定已注册视图。目标插件仍可能拒绝不支持的文件；外部应用遵循系统关联，不提供跨平台指定任意可执行程序的能力。“不再提示”可在设置里重新开启。

手机端将记录类型与“显示所有”放在同一行，日期导航单独居中；平板及桌面依据组件实际宽度排成一行，空间不足时再折成两行。各横向条复用宿主滚动条颜色与细滑块。

最近打开与搜索历史共用日期导航：默认查看今天，可用左右箭头或日期框切换；点击 **显示所有** 按今天、昨天和更早日期分组显示全部记录。若全部记录都在今天，日期框为只读，并在其前面显示时钟图标和 **仅今天**；此时 **显示所有** 默认开启且不可切换。顶栏右侧的垃圾桶清除当前日期（显示所有时为全部）的最近打开记录。

记录类型下拉菜单每项右侧的圆形单选按钮可把该视图设为默认；也可在 **设置 → 新标签页与最近打开 → 默认记录视图** 选择。首次显示最近打开时会自动从快速切换补录缺失的文件，已有记录的时间和顺序保持不变；设置页仍保留手动导入按钮。

保留天数含今天：`1` 只保留今天，`2` 包含昨天；天数与条数上限分别设为 `0` 可取消对应限制，两项均为 `0` 时永久保留且不限条数，列表仍分页显示。正数限制下会清理超期或超量记录，关闭后不再采集。记录保存在插件目录的 `recent-files.json`，不会发送到网络。

最近打开和搜索历史设置下方均有 **按日期清理** 按钮，弹窗中可选择清理类型，再用同一行的两个日期框指定范围（包含起止日期）。点击“清理所选范围”才会执行，取消不改记录。搜索历史的“历史显示范围”另有 **不记录** 选项，停止新增但保留已有记录供查看和手动清理。

### Markdown 元素与附件

在空查询顶栏开启 **Markdown 元素**，结果进入独立分类。筛选栏缩成八类图标：文本样式、列表与任务、引用与 Callout、代码、表格、公式、注释与脚注、链接与标签。除表格、公式外的分类悬停展开多选菜单，点击分类图标选择／取消整组；表格与公式为单元素类别，点击直接切换，不展开菜单。触屏长按 0.3 秒展开菜单，滚动会取消长按。列表与任务内分有序列表、无序列表和任务。菜单内可逐项调整而不关闭，最后一次调整 2 秒后更新结果，默认记住选择。首个强调色按钮全选／取消全选。

窄屏把元素图标栏换为 **双列下拉**：左侧浏览分类，右侧勾选元素；“全部”按现有目录顺序列出 19 种元素。分类右侧的 checkbox 可整组全选／取消全选，部分选择显示半选；“全部”的 checkbox 控制所有元素。浏览分类不会改变选择，多选与延迟刷新均保持菜单打开，左右列高度固定。Escape 仅关闭菜单并把焦点还给筛选按钮。

结果以元素图标、行号胶囊和 MarkdownRenderer 渲染的内容显示。标题注明 H1–H6；标题、加粗、斜体、列表、单／双反引号行内代码等与元信息同行，窄屏自然折行，续行从整条结果左侧开始。Callout、围栏代码块、表格等块元素从下一行显示；Callout 类型和代码语言显示为胶囊。脚注仅预览正文与编号，不引入整篇文档的脚注区留白。水平线不再作为独立搜索类型，Setext 标题的下划线仍按标题识别。

元素筛选栏右侧的显示模式菜单可切换 **按文档** 与 **针对元素**。后者独立列出每个命中，来源文件放在下方，分页按元素计算；行号和来源仍可精确定位。切换只影响当前界面，菜单每项右侧的圆按钮单独设置默认模式，设置默认时菜单保持打开。

可使用类型前缀，如 `heading:计划`、`task:复习`、`highlight:重点`；`heading:` 可列出标题。`code:python` 或 `lang:python` 按围栏右侧的语言标记检索代码块。YAML 属性区、代码示例和注释中的伪链接不会被当成普通元素。

内链与外链并入元素搜索，含 Wiki 链接、相对 Markdown 链接、引用式链接及外部网址。类型图标右侧的链接按钮直接打开目标，行号胶囊定位来源原文；渲染后的链接也可直接打开。内容搜索的摘要同样使用 MarkdownRenderer，关键词高亮保留。只在展开或当前页需要显示时解析，最多并发解析两项，单片段限制 8000 字符；切换结果时释放旧渲染组件。

内容、属性和元素搜索可用 `#标签` 约束文档，例如 `heading:极限 #数学`、`topic:分析 #数学`；嵌套标签包含其子标签。标签搜索可切换“标签 → 关联文档”与“直接列出文档”。Web 搜索支持 `site:`、`intitle:`、`inurl:`、`filetype:`、日期及精确短语等语法补全；全局搜索只有选中互联网类别才显示这些补全。

开启 **非 md 文件** 后，附件放入独立的“非 Markdown”分类。首行文件名前显示大写类型标记，如 `PDF`、`PNG`；未知后缀直接转大写，无后缀显示 `FILE`。

非 Markdown 结果下方提供默认收起的 **后缀过滤** 区，浅色背景、四边细边框。展开后可输入 `.pdf .canvas .png` 并按回车或加号，一次生成多个标签。标签统一大写展示、匹配忽略大小写；点击仅切换选中，多个选中后缀取并集。无标签时不限后缀，已有标签全部未选中时不显示附件。只有开启 **删除模式** 后点击才移除标签。**临时设定** 开启后不写入永久设置，关闭时保存当前标签和选中状态；保存失败保留临时状态，可重试。正文、Markdown 元素等其它来源不受附件后缀筛选影响。附件名称索引包含后缀，因此输入 `canvas` 也能找到 `.canvas` 文件。

[后缀过滤展开](docs/previews/suffix-filter-expanded.png) · [默认收起](docs/previews/suffix-filter-collapsed.png) · [320px 布局](docs/previews/suffix-filter-mobile.png) · [针对元素模式](docs/previews/element-first-results.png)

[元素筛选栏](docs/previews/element-filter-split-groups.png) · [元素筛选说明](docs/previews/filter-caption-elements.png) · [类型筛选栏](docs/previews/filter-caption-recent.png) · [窄屏说明隐藏](docs/previews/filter-caption-narrow.png) · [记录视图图钉](docs/previews/idle-source-caption-pin.png) · [设置搜索类别气泡](docs/previews/source-caption-tooltip.png) · [搜索种类菜单图钉](docs/previews/source-menu-pin-right.png)

[手机单行布局](docs/previews/mobile-single-row.png) · [窄屏换行预览](docs/previews/mobile-wrapped-results.png) · [最近打开预览](docs/previews/recent-files.png) · [Markdown 元素预览](docs/previews/markdown-elements.png) · [窄屏预览](docs/previews/markdown-elements-narrow.png)

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

## License / 许可证

MIT License. See [LICENSE](LICENSE). / 本项目使用 MIT 许可证，详见 [LICENSE](LICENSE)。

快捷键在插件设置的“搜索快捷键 → 配置快捷键”中以表格编辑。每行独立选择功能、组合键、启用状态、生效范围和可选的 Shift 反向动作；同一功能可绑定多组按键。支持录入或手动输入、增删、还原已保存和默认绑定。修改后保存，冲突或保存失败时保留草稿。旧的类别切换快捷键自动迁移；默认 Alt+左右键循环切换类别。全局打开搜索仍通过 Obsidian 的快捷键设置配置。

单字符查询支持字母、数字、中文、标点和表情符号的字面匹配；中文索引保留独立单字及词尾字。文件名相关度依次优先完整名称、前缀、连续包含，再按词距细排；别名沿用同一排序。正文回退扫描最多并行读取 8 篇笔记，查询过期后不再继续调度读取。

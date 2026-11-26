export const LABELS = {
  vaultOptions:'搜索选项',excludePaths:'排除路径',defaultMode:'默认搜索模式',placeholderType:'占位文本模式',placeholder:'统一占位文本',
  placeholder_global:'全局搜索占位文本',placeholder_vault:'Vault 搜索占位文本',placeholder_web:'互联网搜索占位文本',
  browserTarget:'浏览器打开位置',historyRetentionMode:'历史显示范围',historyRetentionDays:'历史显示天数',
  recentFilesEnabled:'记录最近打开的内容',recentFilesDays:'最近打开保留天数',recentFilesLimit:'最近打开条数上限',defaultRecordView:'默认记录视图',newTabSearch:'新标签页 Radar Search 入口',searchMarkdown:'搜索 Markdown 元素',
  historyPageSize:'历史每页数量',dropdownPageSize:'结果每页数量',searchSheetBreakpoint:'底部卡片断点（像素）',
  vaultContentSearch:'搜索正文',vaultContentSearchMaxResults:'正文结果上限',searchWikiLinks:'搜索内链',searchMdLinks:'搜索外链',
  searchBookmarks:'搜索书签',searchTags:'搜索标签',searchCommands:'搜索命令',searchNonMarkdown:'搜索非 Markdown 文件',
  searchProperties:'搜索 YAML 属性',extendedContext:'扩展正文上下文',vaultSortMode:'结果排序',limitContentResults:'限制正文结果数量',
  searchPresets:'搜索预设',defaultPreset:'默认预设',activeEngineId:'当前搜索引擎',webSources:'互联网信息源',
  engines:'搜索引擎',searchIndex:'索引选项',debug:'开发者日志'
};
export const VAULT_OPTION_KEYS = [
  'vaultContentSearch','vaultContentSearchMaxResults','limitContentResults','vaultSortMode','extendedContext',
  'searchMarkdown','searchNonMarkdown','searchWikiLinks','searchMdLinks','searchBookmarks','searchTags','searchCommands','searchProperties','defaultPreset'
];
export const SETTINGS_GROUPS: [string,string[]][] = [
  ['搜索栏',['defaultMode','placeholderType','placeholder','placeholder_global','placeholder_vault','placeholder_web','searchSheetBreakpoint']],
  ['Vault 搜索',['vaultOptions','dropdownPageSize','excludePaths','searchPresets']],
  ['互联网搜索',['browserTarget','engines','activeEngineId','webSources']],
  ['新标签页与最近打开',['newTabSearch','recentFilesEnabled','recentFilesDays','recentFilesLimit','defaultRecordView']],
  ['历史与索引',['historyRetentionMode','historyRetentionDays','historyPageSize','searchIndex','debug']]
];
export const DESCRIPTIONS = {
  recentFilesEnabled:'默认关闭。开启后记录打开的文件（含非 Markdown）和在搜索栏执行的命令，可与搜索历史切换。',
  recentFilesDays:'0 表示永久保留；1 只保留今天，2 包括昨天。按本地日期计算，正数会清理超期记录。',
  recentFilesLimit:'0 表示不限制条数。按最近打开时间去重；关闭记录后不再收集。',
  defaultRecordView:'搜索框空闲时默认显示最近打开或搜索历史；也可在记录视图右上角的图钉按钮切换。',
  searchMarkdown:'独立搜索标题、任务、引用、代码块、高亮等；支持 heading:关键词、task:关键词 等类型前缀。',
  vaultOptions:'集中设置正文、专项搜索、结果数量、排序和默认预设；修改后自动保存。',
  placeholder:'统一占位文本模式下显示；留空使用默认提示。',
  placeholder_global:'按模式设置时显示；留空使用默认提示。',
  placeholder_vault:'按模式设置时显示；留空使用默认提示。',
  placeholder_web:'按模式设置时显示；留空使用默认提示。',
  searchSheetBreakpoint:'视口窄于该宽度时，搜索选项使用底部卡片。',
  excludePaths:'填写目录、glob 或 regex: 正则；支持目录补全与常用规则。空列表表示不排除。',
  searchPresets:'白名单仅搜索规则匹配项，黑名单排除匹配项。支持目录、glob 和 regex: 正则，可添加常用预设。',
  defaultPreset:'默认使用的预设；修改名称或删除预设时会自动更新。',
  activeEngineId:'选择一个引擎，或同时使用所有已启用引擎。',
  historyRetentionMode:'永久或指定天数仅控制显示范围，不自动删除；选择不记录停止新增，已有记录仍可查看和清理。',
  engines:'搜索网址用 {q} 表示关键词。建议词接口可留空，启用后会把输入发送给该接口。标识自动生成，可通过“编辑”按钮修改。',
  webSources:'设置名称和域名，用于限定互联网搜索的信息来源。域名不含 https://。',
  searchIndex:'用下方开关配置全文索引，修改后点击保存。',
  debug:'排查问题时允许输出开发者日志；错误也会显示通知。',
  vaultSortMode:'相关度固定从高到低；修改/创建时间默认新→旧；名称默认 A→Z。可在这里选择升序或倒序。'
};
export const PLACEHOLDERS = {
  placeholder:'例如：搜索笔记、命令或网页…',placeholder_global:'例如：搜索整个知识库…',
  placeholder_vault:'例如：输入文件名、标签或正文关键词…',placeholder_web:'例如：搜索互联网…'
};

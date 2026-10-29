export const LABELS = {
  vaultOptions:'搜索选项',excludePaths:'排除路径',defaultMode:'默认搜索模式',placeholderType:'占位文本模式',placeholder:'统一占位文本',
  placeholder_global:'全局搜索占位文本',placeholder_vault:'Vault 搜索占位文本',placeholder_web:'互联网搜索占位文本',
  browserTarget:'浏览器打开位置',historyRetentionMode:'历史显示范围',historyRetentionDays:'历史显示天数',
  historyPageSize:'历史每页数量',dropdownPageSize:'结果每页数量',searchSheetBreakpoint:'底部卡片断点（像素）',
  vaultContentSearch:'搜索正文',vaultContentSearchMaxResults:'正文结果上限',searchWikiLinks:'搜索内链',searchMdLinks:'搜索外链',
  searchBookmarks:'搜索书签',searchTags:'搜索标签',searchCommands:'搜索命令',searchNonMarkdown:'搜索非 Markdown 文件',
  searchProperties:'搜索 YAML 属性',extendedContext:'扩展正文上下文',vaultSortMode:'结果排序',limitContentResults:'限制正文结果数量',
  searchPresets:'搜索预设',defaultPreset:'默认预设',activeEngineId:'当前搜索引擎',webSources:'互联网信息源',
  engines:'搜索引擎',searchIndex:'索引选项',debug:'开发者日志'
};
export const VAULT_OPTION_KEYS = [
  'vaultContentSearch','vaultContentSearchMaxResults','limitContentResults','vaultSortMode','extendedContext',
  'searchNonMarkdown','searchWikiLinks','searchMdLinks','searchBookmarks','searchTags','searchCommands','searchProperties','defaultPreset'
];
export const SETTINGS_GROUPS: [string,string[]][] = [
  ['搜索栏',['defaultMode','placeholderType','placeholder','placeholder_global','placeholder_vault','placeholder_web','searchSheetBreakpoint']],
  ['Vault 搜索',['vaultOptions','dropdownPageSize','excludePaths','searchPresets']],
  ['互联网搜索',['browserTarget','engines','activeEngineId','webSources']],
  ['历史与索引',['historyRetentionMode','historyRetentionDays','historyPageSize','searchIndex','debug']]
];
export const DESCRIPTIONS = {
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
  historyRetentionMode:'指定天数仅限制历史显示范围，不自动删除记录。',
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

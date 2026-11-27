import {localDateKey,recordDateRange} from './date-range.ts';
import type RadarSearchPlugin from '../main.ts';
import type {RecentFileRecord} from '../types.ts';

/** Date navigation state shared by the recent-opens view and its tests.
 *  最近打开日期导航状态，供视图与测试共用。 */
export interface RecentDateView {
  today:string;
  oldest:string;
  /** No record predates today; lock the date input and force show-all on.
   *  没有早于今天的记录：锁定日期输入并强制开启「显示所有」。 */
  onlyToday:boolean;
  selected:string;
  showAll:boolean;
  records:RecentFileRecord[];
}

export function recentDateView(records:RecentFileRecord[],requested:string,today:string,showAllRecent:boolean):RecentDateView {
  const oldest=records.length?localDateKey(records[records.length-1].ts):today;
  const onlyToday=oldest>=today;
  const selected=onlyToday?today:(requested<oldest?oldest:requested>today?today:requested);
  const showAll=onlyToday||showAllRecent;
  return {today,oldest,onlyToday,selected,showAll,records:showAll?records:records.filter(record=>localDateKey(record.ts)===selected)};
}

const recordKind=(record:RecentFileRecord):'file'|'command'=>record.kind??'file';
/** Files and commands share one timeline but never dedupe each other.
 *  文件与命令共用一条时间线，但不会互相去重。 */
const recordKey=(record:RecentFileRecord):string=>`${recordKind(record)}\u0000${record.path}`;

function isObject(value:unknown):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value);}
function isRecentRecord(value:unknown):value is RecentFileRecord {
  if(!isObject(value))return false;
  const {path,ts,source,kind,label}=value;
  return typeof path==='string'&&path.length>0&&typeof ts==='number'&&Number.isFinite(ts)&&
    (source===undefined||source==='quick-switcher')&&(kind===undefined||kind==='file'||kind==='command')&&
    (label===undefined||typeof label==='string');
}

/** Local calendar days, including today; DST must not change the cutoff.
 * 使用本地自然日（含今天），避免夏令时改变保留边界。 */
export function pruneRecentFiles(records:RecentFileRecord[],days:number,limit:number,now=Date.now()):RecentFileRecord[] {
  const cutoff=new Date(now);cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-days+1);
  const seen=new Set<string>();
  return records.filter(record=>(days===0||record.ts>=cutoff.getTime())&&record.ts<=now).sort((a,b)=>b.ts-a.ts)
    .filter(record=>{const key=recordKey(record);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,limit===0?undefined:limit);
}
export class RecentFilesStore {
  private records:RecentFileRecord[]=[];
  private loaded=false;
  private quickSwitcherSynced=false;
  pending:Promise<void>=Promise.resolve();
  constructor(private plugin:RadarSearchPlugin) {}
  private get path(){return `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/recent-files.json`;}
  private enqueue(action:()=>Promise<void>) {
    this.pending=this.pending.catch(error=>this.plugin.report('error','最近打开保存失败',error)).then(action);
    return this.pending;
  }
  private async save(){await this.plugin.app.vault.adapter.write(this.path,JSON.stringify(this.records,null,2));}
  private async load():Promise<void> {
    if(this.loaded)return;
    if(await this.plugin.app.vault.adapter.exists(this.path)) {
      const parsed:unknown=JSON.parse(await this.plugin.app.vault.adapter.read(this.path));
      if(!Array.isArray(parsed))throw new Error('最近打开记录必须是数组');
      this.records=parsed.filter(isRecentRecord);
    }
    this.loaded=true;
  }
  async configure() {
    if(!this.plugin.settings.recentFilesEnabled)return;
    await this.enqueue(async()=>{
      await this.load();
      const before=JSON.stringify(this.records);
      const previous=this.records;this.records=this.retained();
      if(JSON.stringify(this.records)!==before){try{await this.save();}catch(error){this.records=previous;throw error;}}
    });
  }
  private retained():RecentFileRecord[] {
    const settings=this.plugin.settings;
    return pruneRecentFiles([...this.records],settings.recentFilesDays,settings.recentFilesLimit);
  }
  list():RecentFileRecord[] {
    if(!this.plugin.settings.recentFilesEnabled)return [];
    // Index availability affects display, never persisted retention. / 索引可用性只影响显示，不裁剪保存记录。
    return this.retained().filter(record=>recordKind(record)==='command'||!!this.plugin.app.vault.getFileByPath(record.path));
  }
  /** Merge quick-switcher paths that are not recorded yet; existing timestamps stay untouched.
   *  合并快速切换中尚未记录的路径，保留已有记录的时间戳。 */
  private async mergeQuickSwitcher(strict:boolean):Promise<number> {
    if(!this.plugin.settings.recentFilesEnabled) {
      if(strict)throw new Error('请先开启最近打开记录');
      return 0;
    }
    const paths=this.plugin.app.workspace.getLastOpenFiles();
    let imported=0;
    await this.enqueue(async()=>{
      if(!this.plugin.settings.recentFilesEnabled) {
        if(strict)throw new Error('最近打开记录已关闭');
        return;
      }
      await this.load();
      const previous=this.records;const seen=new Set(previous.map(record=>recordKey(record)));
      const additions:RecentFileRecord[]=[];const ts=Date.now();
      for(const path of paths) {
        const key=recordKey({path,ts,kind:'file'});
        if(seen.has(key)||!this.plugin.app.vault.getFileByPath(path))continue;
        seen.add(key);additions.push({path,ts,kind:'file',source:'quick-switcher'});
      }
      if(!additions.length)return;
      this.records=[...previous,...additions];this.records=this.retained();
      imported=additions.filter(record=>this.records.some(saved=>recordKey(saved)===recordKey(record))).length;
      try{await this.save();}catch(error){this.records=previous;throw error;}
    });
    return imported;
  }
  /** Explicit import from settings; always allowed once capture is enabled. */
  async importQuickSwitcher():Promise<number> {
    const imported=await this.mergeQuickSwitcher(true);
    this.quickSwitcherSynced=true;
    return imported;
  }
  /** Automatic backfill: once per plugin session, only missing paths.
   *  自动补录：每个插件会话一次，只补缺失项；删除过的记录不会在本次会话内被重新加回。 */
  async syncQuickSwitcher():Promise<number> {
    if(this.quickSwitcherSynced||!this.plugin.settings.recentFilesEnabled)return 0;
    // Leave the flag unset while the host still has no quick-switcher history.
    // 宿主尚无快速切换历史时不置标记，稍后可重试。
    if(!this.plugin.app.workspace.getLastOpenFiles().length)return 0;
    this.quickSwitcherSynced=true;
    try{return await this.mergeQuickSwitcher(false);}
    catch(error) {this.quickSwitcherSynced=false;throw error;}
  }
  /** Record an opened file of any type (Markdown or attachment).
   *  记录打开的文件，含 Markdown 与附件。 */
  record(path:string):void {
    if(!this.plugin.settings.recentFilesEnabled||!path)return;
    this.push({path,kind:'file'});
  }
  /** Record a command executed from the search bar. / 记录从搜索栏执行的命令。 */
  recordCommand(id:string,name:string):void {
    if(!this.plugin.settings.recentFilesEnabled||!id)return;
    this.push({path:id,kind:'command',label:name||id});
  }
  private push(entry:Pick<RecentFileRecord,'path'|'kind'|'label'>):void {
    const ts=Date.now();
    const key=recordKey({...entry,ts});
    void this.enqueue(async()=>{
      if(!this.plugin.settings.recentFilesEnabled)return;
      await this.load();const previous=this.records;
      this.records=this.retained().filter(record=>recordKey(record)!==key);
      this.records.unshift({...entry,ts});this.records=this.retained();
      try{await this.save();}catch(error){this.records=previous;throw error;}
    })
      .catch(error=>this.plugin.report('error','最近打开记录失败',error));
  }
  rename(oldPath:string,newPath:string):void {
    if(!this.plugin.settings.recentFilesEnabled)return;
    void this.enqueue(async()=>{
      await this.load();const previous=this.records;
      // Command ids never follow vault renames. / 命令 id 不随仓库重命名变化。
      this.records=this.records.map(record=>recordKind(record)==='file'&&(record.path===oldPath||record.path.startsWith(`${oldPath}/`))?{...record,path:newPath+record.path.slice(oldPath.length)}:record);
      this.records=this.retained();try{await this.save();}catch(error){this.records=previous;throw error;}
    }).catch(error=>this.plugin.report('error','最近打开路径更新失败',error));
  }
  clearRange(from:string,to:string):Promise<number> {
    const range=recordDateRange(from,to);
    let removed=0;
    return this.enqueue(async()=>{
      // Load even when capture is disabled, without pruning unrelated dates.
      // 即使关闭记录也可清理，但不能顺带裁剪范围外的数据。
      await this.load();
      const retained=this.records.filter(record=>record.ts<range.start||record.ts>=range.end);
      removed=this.records.length-retained.length;
      if(!removed)return;
      const previous=this.records;this.records=retained;
      try{await this.save();}catch(error){this.records=previous;throw error;}
    }).then(()=>removed);
  }
  clear():Promise<void> {return this.enqueue(async()=>{
    await this.load();const previous=this.records;this.records=[];
    try{await this.save();}catch(error){this.records=previous;throw error;}
  });}
}

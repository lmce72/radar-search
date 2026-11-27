import {recordDateRange} from './date-range.ts';
import {parseHistoryRecords,sameHistoryTarget} from './records.ts';
import { normalizePath } from 'obsidian';
import type {DataAdapter} from 'obsidian';
interface HistoryHost {
 app:{vault:{configDir:string;adapter:Pick<DataAdapter,'exists'|'read'|'write'|'mkdir'|'list'|'remove'>}};
 manifest:{id:string};report(level:'warn'|'error'|'log',...args:unknown[]):void;
}
import type {SearchHistoryRecord} from '../types.ts';

export class HistoryStore {
  declare plugin:HistoryHost;
  declare directory:string;
  declare pending:Promise<unknown>;

  constructor(plugin:HistoryHost) {
    this.plugin=plugin;
    this.directory=normalizePath(`${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/history`);
    this.pending=Promise.resolve();
  }
  path(date:string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('无效历史日期'); return `${this.directory}/${date}.json`; }
  async initialize() { if (!await this.plugin.app.vault.adapter.exists(this.directory)) await this.plugin.app.vault.adapter.mkdir(this.directory); }
  enqueue<T>(action:()=>Promise<T>):Promise<T> {
    const operation=this.pending.catch(error=>this.plugin.report('error','上次历史保存失败',error)).then(action);
    this.pending=operation;return operation;
  }
  async read(path:string):Promise<SearchHistoryRecord[]> {
    const adapter=this.plugin.app.vault.adapter;
    if (!await adapter.exists(path)) return [];
    const data: unknown=JSON.parse(await adapter.read(path));
    return parseHistoryRecords(data);
  }
  write(path:string,records:SearchHistoryRecord[]) { return this.enqueue(()=>this.plugin.app.vault.adapter.write(path,JSON.stringify(records,null,2))); }
  clear() {
    return this.enqueue(async()=>{
      const adapter=this.plugin.app.vault.adapter;
      const listed=await adapter.list(this.directory);
      for(const file of listed.files) if(/^\d{4}-\d{2}-\d{2}\.json$/.test(file.split('/').pop())) await adapter.remove(file);
    });
  }
  clearRange(from:string,to:string):Promise<number> {
    const range=recordDateRange(from,to);
    return this.enqueue(async()=>{
      const adapter=this.plugin.app.vault.adapter;
      const listed=await adapter.list(this.directory);let removed=0;
      for(const file of listed.files) {
        const name=file.split('/').pop();
        if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(name))continue;
        const day=name.slice(0,10);
        if(day>=range.from&&day<=range.to){await adapter.remove(file);removed++;}
      }
      return removed;
    });
  }
  prepend(date:string,record:SearchHistoryRecord) {
    return this.enqueue(async()=>{
      const path=this.path(date);const records=await this.read(path);
      if (records[0] && sameHistoryTarget(records[0],record)) return;
      records.unshift(record);
      await this.plugin.app.vault.adapter.write(path,JSON.stringify(records,null,2));
    });
  }
  /** Delete snapshots against fresh disk records inside the write queue.
   * 在写队列内读取最新记录，只删除快照中明确选中的条目。 */
  private removeMatchingRecords(groups:ReadonlyMap<string,readonly SearchHistoryRecord[]>):Promise<void> {
    return this.enqueue(async()=>{
      for(const [path,selected] of groups){
        const records=await this.read(path);
        const retained=records.filter(item=>!selected.some(record=>item.ts===record.ts&&sameHistoryTarget(item,record)));
        if(retained.length!==records.length)await this.plugin.app.vault.adapter.write(path,JSON.stringify(retained,null,2));
      }
    });
  }
  removeRecords(entries:readonly {date:string;record:SearchHistoryRecord}[]):Promise<void> {
    const groups=new Map<string,SearchHistoryRecord[]>();
    for(const {date,record} of entries){const path=this.path(date),selected=groups.get(path)||[];selected.push(record);groups.set(path,selected);}
    return this.removeMatchingRecords(groups);
  }
  removeRecord(path:string,record:SearchHistoryRecord):Promise<void> {
    return this.removeMatchingRecords(new Map([[path,[record]]]));
  }
}

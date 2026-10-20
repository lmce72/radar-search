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
    if (!Array.isArray(data)) throw new Error('历史文件必须是数组');
    return data as SearchHistoryRecord[];
  }
  write(path:string,records:SearchHistoryRecord[]) { return this.enqueue(()=>this.plugin.app.vault.adapter.write(path,JSON.stringify(records,null,2))); }
  clear() {
    return this.enqueue(async()=>{
      const adapter=this.plugin.app.vault.adapter;
      const listed=await adapter.list(this.directory);
      for(const file of listed.files) if(/^\d{4}-\d{2}-\d{2}\.json$/.test(file.split('/').pop())) await adapter.remove(file);
    });
  }
  prepend(date:string,record:SearchHistoryRecord) {
    return this.enqueue(async()=>{
      const path=this.path(date);const records=await this.read(path);
      if (records[0]?.q===record.q && records[0]?.mode===record.mode && records[0]?.file===record.file) return;
      records.unshift(record);
      await this.plugin.app.vault.adapter.write(path,JSON.stringify(records,null,2));
    });
  }
  removeRecord(path:string,record:SearchHistoryRecord) {
    return this.enqueue(async()=>{
      const records=await this.read(path);
      await this.plugin.app.vault.adapter.write(path,JSON.stringify(records.filter(item=>!(item.ts===record.ts && item.q===record.q && item.mode===record.mode && item.file===record.file)),null,2));
    });
  }
}

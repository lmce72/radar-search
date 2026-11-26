import {test,expect,mock} from 'bun:test';
mock.module('obsidian',()=>({normalizePath:value=>value.replaceAll('\\','/')}));

const {RecentFilesStore}=await import('../src/history/recent-files.ts');

function fixture(options:{enabled?:boolean;records?:unknown[];lastOpen?:string[];existing?:string[]}){
  const settings={recentFilesEnabled:options.enabled??true,recentFilesDays:0,recentFilesLimit:0};
  let data=JSON.stringify(options.records??[]);let reads=0;
  const existing=new Set(options.existing??['Existing.md','Newest.md','Older.md']);
  const lastOpen=options.lastOpen??[];
  const plugin={
    settings,manifest:{id:'primecore-search'},report(){},
    app:{
      vault:{configDir:'.obsidian',getFileByPath:path=>existing.has(path)?{}:null,
        adapter:{exists:async()=>{reads++;return true;},read:async()=>data,write:async(_path,text)=>{data=text;}}},
      workspace:{getLastOpenFiles:()=>lastOpen}
    }
  };
  return {store:new RecentFilesStore(plugin as unknown as import('../src/main.ts').default),get data(){return data;},get reads(){return reads;}};
}

test('quick-switcher sync is incremental and preserves existing records',async()=>{
  const existing={path:'Existing.md',ts:1000};
  const run=fixture({records:[existing],lastOpen:['Newest.md','Existing.md','Older.md','Missing.md']});
  await run.store.configure();
  expect(await run.store.syncQuickSwitcher()).toBe(2);
  const records=run.store.list();
  expect(records.map(record=>record.path)).toEqual(['Newest.md','Older.md','Existing.md']);
  expect(records.find(record=>record.path==='Existing.md')).toEqual(existing);
  expect(records.filter(record=>record.source==='quick-switcher')).toHaveLength(2);
  // Once per session: a second call does not re-read or re-add.
  expect(await run.store.syncQuickSwitcher()).toBe(0);
  expect(run.reads).toBe(1);
});

test('quick-switcher sync stays off while capture is disabled and leaves no session mark',async()=>{
  const run=fixture({enabled:false,lastOpen:['Newest.md']});
  expect(await run.store.syncQuickSwitcher()).toBe(0);
  expect(run.reads).toBe(0);
});

test('explicit quick-switcher import still reports a disabled capture',async()=>{
  const run=fixture({enabled:false,lastOpen:['Newest.md']});
  await expect(run.store.importQuickSwitcher()).rejects.toThrow('请先开启最近打开记录');
});

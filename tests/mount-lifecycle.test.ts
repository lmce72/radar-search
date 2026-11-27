import {test,expect} from 'bun:test';
// A subprocess isolates SDK/module doubles from the real search behavior tests.
// 子进程隔离宿主替身，不影响其它搜索行为测试。
for(const scenario of ['stale-failure','stale-session','pending-owner','session-owner','current-failure'])test(`mount lifecycle: ${scenario}`,()=>{
 const result=Bun.spawnSync({cmd:[process.execPath,'run','tests/fixtures/mount-harness.ts',scenario],cwd:import.meta.dir+'/..'});
 expect(result.exitCode,new TextDecoder().decode(result.stderr)).toBe(0);
});

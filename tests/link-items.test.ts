import {test,expect} from 'bun:test';
import {buildWikiLinkResultItems,buildExternalLinkResultItems} from '../src/search/link-items.ts';

type LinkHost=Parameters<typeof buildWikiLinkResultItems>[0];

function host(overrides:Record<string,unknown>) {
  return {
    app:{
      vault:{getMarkdownFiles:()=>[],cachedRead:async()=>''},
      metadataCache:{getFileCache:()=>null,getFirstLinkpathDest:()=>null},
      workspace:{openLinkText:async()=>{}}
    },
    plugin:{floatingSearch:{close(){}}},
    presentation:'floating',
    _log(){},
    _openUrl(){},
    ...overrides
  } as unknown as LinkHost;
}

test('wikilink results are the links themselves, deduplicated by resolved target',()=>{
  const opened:string[]=[];
  const file={path:'Notes/Source.md'};
  const links=[{link:'Target',displayText:'显示名'},{link:'Target#Part'},{link:'Other#Part'}];
  const fixture=host({
    app:{
      vault:{getMarkdownFiles:()=>[file]},
      metadataCache:{
        getFileCache:()=>({links}),
        getFirstLinkpathDest:(link:string)=>link==='Target'?{path:'Notes/Target.md'}:link==='Other'?{path:'Notes/Other.md'}:null
      },
      workspace:{openLinkText:async(target:string,source:string)=>{opened.push(`${target}|${source}`);}}
    }
  });
  const items=buildWikiLinkResultItems(fixture,['target'],null,()=>false);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({label:'显示名',sub:'Notes/Source.md',icon:'link',twoLine:true});
  items[0].action();
  expect(opened).toEqual(['Target|Notes/Source.md']);
});

test('external link results are URLs and open directly',async()=>{
  const opened:string[]=[];
  const fixture=host({
    app:{
      vault:{getMarkdownFiles:()=>[{path:'Notes/A.md'},{path:'Notes/B.md'}],cachedRead:async(file:{path:string})=>file.path==='Notes/A.md'?'See https://example.com/a and https://example.com/b':'Again https://example.com/a'},
      metadataCache:{getFileCache:()=>null,getFirstLinkpathDest:()=>null},
      workspace:{openLinkText:async()=>{}}
    },
    _openUrl:(url:string)=>{opened.push(url);}
  });
  const items=await buildExternalLinkResultItems(fixture,['example'],null,()=>false,()=>false);
  expect(items.map(item=>item.label)).toEqual(['https://example.com/a','https://example.com/b']);
  expect(items.every(item=>item.icon==='external-link'&&item.sub==='Notes/A.md')).toBe(true);
  items[0].action();
  expect(opened).toEqual(['https://example.com/a']);
});

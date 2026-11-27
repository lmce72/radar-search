import type {SearchGroup} from '../types.ts';

/** Flatten only Markdown hits before pagination; keep source matches and actions.
 * 分页前展平 Markdown 命中，保留精确原文位置及操作，不修改文档分组。 */
export function markdownElementGroups(groups:SearchGroup[]):SearchGroup[] {
  return groups.map(group=>({...group,items:group.items.flatMap(item=>(item.hits||[]).filter(hit=>hit.markdown).map(hit=>({
    ...item,hits:undefined,elementHit:hit,
    action:()=>{if(item.onMatch)item.onMatch(hit);else item.action();}
  })))}));
}

import type {Command} from 'obsidian';
import type {FuzzyFn} from '../ui/search-bar-host.ts';
import {proximityScore} from './proximity.ts';

interface CommandMatch { command: Command; hidden: boolean; score: number }

// 描述内精确匹配、短语、词组、模糊匹配依次降级；ID 仅作为后备。
// Rank exact descriptions, phrases, terms and fuzzy matches before ID fallbacks.
function fieldScore(text: string, query: string, terms: string[], fuzzy: FuzzyFn | null): number | null {
  const normalized=text.toLowerCase().replace(/\s+/g,' ').trim();
  if(normalized===query)return 5;
  const at=normalized.indexOf(query);
  if(at>=0)return 4+1/(2+at);
  if(terms.every(term=>normalized.includes(term))) {
    const proximity=proximityScore(normalized,terms);
    return 3+proximity/(1+proximity);
  }
  const match=fuzzy?.(text);
  return match?2+(1+match.score/(1+Math.abs(match.score)))/2:null;
}

export function rankCommandCandidates(visible: Command[], hidden: Command[], query: string, terms: string[], fuzzy: FuzzyFn | null): CommandMatch[] {
  const normalized=query.toLowerCase().replace(/\s+/g,' ').trim();
  const wanted=terms.map(term=>term.toLowerCase().trim()).filter(Boolean);
  if(!normalized||!wanted.length)return [];
  const matches:CommandMatch[]=[];
  const seen=new Set<string>();
  for(const [commands,isHidden] of [[visible,false],[hidden,true]] as const) {
    for(const command of commands) {
      if(!command.id||!command.name||seen.has(command.id))continue;
      seen.add(command.id);
      const descriptionScore=fieldScore(command.name,normalized,wanted,fuzzy);
      const idScore=descriptionScore===null?fieldScore(command.id,normalized,wanted,fuzzy):null;
      // 保留无模糊引擎时跨描述和 ID 的多词查询。 / Preserve mixed-field literal queries.
      const mixed=!fuzzy&&wanted.every(term=>`${command.name} ${command.id}`.toLowerCase().includes(term));
      if(descriptionScore===null&&idScore===null&&!mixed)continue;
      matches.push({command,hidden:isHidden,score:descriptionScore!==null?100+descriptionScore:idScore??1});
    }
  }
  return matches.sort((a,b)=>b.score-a.score);
}

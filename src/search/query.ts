/** Tags constrain documents; remaining words search the requested source.
 * 标签约束文档，其余关键词继续搜索当前来源。 */
export function splitTagQuery(query:string):{tags:string[];text:string} {
  const tags:string[]=[];
  const text=query.replace(/(^|\s)#([^\s#]+)/g,(_match:string,space:string,tag:string)=>{tags.push(tag.toLowerCase());return space;}).trim();
  return {tags,text};
}
export function hasQueryTags(values:readonly string[],wanted:readonly string[]):boolean {
  return wanted.every(tag=>values.some(value=>{const clean=value.replace(/^#/,'').toLowerCase();return clean===tag||clean.startsWith(tag+'/');}));
}

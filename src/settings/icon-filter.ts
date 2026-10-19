/** Case-insensitive icon-name search for the picker grid. */
export function filterIconIds(ids:readonly string[],query:string):string[] {
  const needle=String(query||'').trim().toLowerCase();
  return needle?ids.filter(id=>id.toLowerCase().includes(needle)):[...ids];
}

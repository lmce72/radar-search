import {AbstractInputSuggest,TFolder,type App} from 'obsidian';
export class DirectorySuggest extends AbstractInputSuggest<TFolder> {
  constructor(app:App,input:HTMLInputElement,onChange:(value:string)=>void) {
    super(app,input);this.limit=30;
    this.onSelect((folder,event)=>{event.stopPropagation();this.setValue(folder.path);onChange(folder.path);this.close();});
  }
  getSuggestions(query:string):TFolder[] {
    if(query.startsWith('regex:')||query.startsWith('glob:')||/[*?{[]/.test(query))return [];
    const q=query.toLocaleLowerCase();
    return this.app.vault.getAllLoadedFiles().filter((f):f is TFolder=>f instanceof TFolder&&f.path.toLocaleLowerCase().includes(q)).sort((a,b)=>a.path.localeCompare(b.path));
  }
  renderSuggestion(folder:TFolder,element:HTMLElement) {
    element.addClass('primecore-folder-suggestion');
    element.setText(folder.path);element.setAttribute('title',folder.path);
    element.closest('.suggestion-container')?.addClass('primecore-directory-suggestions');
  }
}
export function isDirectorySuggestion(target:EventTarget|null):boolean {
  return !!(target&&'closest' in target&&typeof target.closest==='function'&&target.closest('.suggestion-container')?.querySelector('.primecore-folder-suggestion'));
}

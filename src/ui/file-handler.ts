import {Modal,Notice,Setting,type App,type TFile} from 'obsidian';
import type RadarSearchPlugin from '../main.ts';
import {raiseModalAboveLayers} from './modal-layer.ts';

/** Isolate the optional host registry behind a narrow read-only boundary.
 * 宿主视图注册表是可选内部接口，集中只读访问并保留回退。 */
interface FileHost {viewRegistry?:{typeByExtension?:Record<string,string>;viewByType?:Record<string,unknown>;getTypeByExtension?:(ext:string)=>string};openWithDefaultApp?:(path:string)=>Promise<void>|void}
function host(app:App):FileHost{return app as FileHost;}
export function registeredHandlers(app:App):string[] {
  const registry=host(app).viewRegistry;
  return [...new Set([...Object.values(registry?.typeByExtension||{}),...Object.keys(registry?.viewByType||{})])].filter(type=>typeof type==='string'&&!!type).sort();
}
export function detectedHandler(app:App,extension:string):string|null {
  const registry=host(app).viewRegistry;
  const type=registry?.getTypeByExtension?.(extension)||registry?.typeByExtension?.[extension];
  return typeof type==='string'?type:null;
}
export function extensionFor(path:string,custom:readonly string[]):string {
  return [...custom].sort((a,b)=>b.length-a.length).find(ext=>path.toLowerCase().endsWith('.'+ext))||path.split('.').at(-1).toLowerCase();
}
async function openFile(plugin:RadarSearchPlugin,file:TFile,handler:string):Promise<void> {
  if(handler==='external'){
    const api=host(plugin.app);
    if(api.openWithDefaultApp)await api.openWithDefaultApp(file.path);
    else await plugin.app.workspace.getLeaf('tab').openFile(file);
  }else if(handler==='auto')await plugin.app.workspace.getLeaf('tab').openFile(file);
  else await plugin.app.workspace.getLeaf('tab').setViewState({type:handler,state:{file:file.path},active:true});
}
export function openRecentFile(plugin:RadarSearchPlugin,file:TFile):void {
  const ext=extensionFor(file.path,plugin.settings.recentFileTypes);
  const manual=Object.hasOwn(plugin.settings.fileTypeHandlers,ext)?plugin.settings.fileTypeHandlers[ext]:undefined;
  const detected=detectedHandler(plugin.app,ext)||detectedHandler(plugin.app,file.extension);
  const builtIn=/^(?:md|pdf|canvas|avif|bmp|gif|jpe?g|png|svg|webp|mp3|mp4|webm|wav|ogg|m4a)$/i.test(file.extension);
  if(!manual&&!detected&&!builtIn&&plugin.settings.warnUnknownFileType){new FileHandlerModal(plugin,ext,file).open();return;}
  plugin.floatingSearch?.close();
  void openFile(plugin,file,manual||detected||'external').catch(error=>plugin.report('error','打开文件失败；请在文件类型设置中重新选择处理方式',error));
}
export class FileHandlerModal extends Modal {
  constructor(private plugin:RadarSearchPlugin,private extension:string,private file?:TFile){super(plugin.app);}
  onOpen():void {
    raiseModalAboveLayers(this);
    this.setTitle(this.file?'选择文件处理方式':'文件类型处理');
    this.contentEl.createEl('p',{text:'.'+this.extension+'：'+(detectedHandler(this.app,this.extension)?'已检测到注册的处理视图。':'未检测到此后缀注册的处理视图。')});
    this.contentEl.createEl('p',{text:'可手动交给已注册视图，但目标插件可能拒绝不支持的格式。外部应用由系统关联决定，无法在移动端指定任意程序。'});
    let handler=Object.hasOwn(this.plugin.settings.fileTypeHandlers,this.extension)?this.plugin.settings.fileTypeHandlers[this.extension]:'auto',skip=!this.plugin.settings.warnUnknownFileType;
    new Setting(this.contentEl).setName('处理方式').addDropdown(control=>{
      control.addOption('auto','自动（Obsidian / 系统关联）').addOption('external','使用外部应用');
      registeredHandlers(this.app).forEach(type=>{control.addOption(type,type);});
      control.setValue(handler).onChange(value=>{handler=value;});
    });
    new Setting(this.contentEl).setName('不再提示未知类型').setDesc('可在本插件设置中重新开启提示。').addToggle(control=>control.setValue(skip).onChange(value=>{skip=value;}));
    const actions=new Setting(this.contentEl);
    actions.addButton(control=>control.setButtonText('取消').onClick(()=>this.close()));
    actions.addButton(control=>control.setButtonText(this.file?'保存并打开':'保存').setCta().onClick(()=>{
      control.setDisabled(true);
      const handlers={...this.plugin.settings.fileTypeHandlers};if(handler==='auto')delete handlers[this.extension];else handlers[this.extension]=handler;
      void this.plugin.updateSettings({fileTypeHandlers:handlers,warnUnknownFileType:!skip},false).then(async()=>{
        this.close();if(this.file){this.plugin.floatingSearch?.close();await openFile(this.plugin,this.file,handler);}
      }).catch(error=>{control.setDisabled(false);new Notice((error as Error).message);this.plugin.report('error','文件处理方式未能保存或打开',error);});
    }));
  }
  onClose():void {this.contentEl.empty();}
}

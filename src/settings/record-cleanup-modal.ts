import {Modal,Setting,Notice,type ButtonComponent} from 'obsidian';
import type RadarSearchPlugin from '../main.ts';
import {localDateKey,recordDateRange,type CleanupScope} from '../history/date-range.ts';

/** Host Modal owns focus, dismissal and theme integration. / 由宿主 Modal 管理焦点、关闭与主题。 */
export class RecordCleanupModal extends Modal {
  private cleanupScope:CleanupScope;
  private from=localDateKey();
  private to=localDateKey();
  private running=false;
  private closed=false;
  private status!:HTMLElement;
  private submit!:ButtonComponent;
  constructor(private plugin:RadarSearchPlugin,scope:CleanupScope) {super(plugin.app);this.cleanupScope=scope;}
  onOpen():void {
    this.closed=false;
    this.setTitle('清理记录');this.contentEl.addClass('primecore-record-cleanup');
    this.contentEl.createEl('p',{text:'按本地日期清理记录，范围包含起始日与结束日。'});
    new Setting(this.contentEl).setName('清理内容').addDropdown(control=>{
      control.addOptions({recent:'最近打开',history:'搜索历史',both:'最近打开和搜索历史'}).setValue(this.cleanupScope);
      control.selectEl.setAttribute('aria-label','清理内容');
      control.onChange(value=>{if(value==='recent'||value==='history'||value==='both')this.cleanupScope=value;});
    });
    const dates=new Setting(this.contentEl).setName('日期范围');dates.settingEl.addClass('primecore-cleanup-dates');
    for(const field of ['from','to'] as const) {
      if(field==='to')dates.controlEl.createSpan({text:'——',attr:{'aria-hidden':'true'}});
      const label=field==='from'?'开始日期':'结束日期';
      dates.addText(control=>{
        control.inputEl.type='date';control.inputEl.required=true;control.inputEl.setAttribute('aria-label',label);
        control.setValue(this[field]).onChange(value=>{this[field]=value;});
      });
    }
    this.status=this.contentEl.createDiv({cls:'primecore-cleanup-status',attr:{role:'status','aria-live':'polite'}});
    new Setting(this.contentEl).addButton(control=>{
      control.setButtonText('取消').onClick(()=>this.close());control.buttonEl.setAttribute('autofocus','');
    }).addButton(control=>{
      // Keep destructive styling compatible with the minimum host version. / 保留最低宿主版本的危险操作样式。
      this.submit=control;control.buttonEl.addClass('mod-warning');control.setButtonText('清理所选范围').onClick(()=>{void this.clearSelected();});
    });
  }
  private async clearSelected():Promise<void> {
    if(this.running)return;
    try {recordDateRange(this.from,this.to);}catch(error){this.status.setText((error as Error).message);return;}
    this.running=true;this.submit.setDisabled(true);this.status.setText('正在清理…');
    try {
      const result=await this.plugin.clearRecords({scope:this.cleanupScope,from:this.from,to:this.to});
      const details:string[]=[];
      if(this.cleanupScope!=='recent')details.push(`搜索历史 ${result.historyDays} 天`);
      if(this.cleanupScope!=='history')details.push(`最近打开 ${result.recentRecords} 条`);
      new Notice(`已清理：${details.join('，')}`);this.close();
    }catch(error){
      this.plugin.report('error','记录清理未完成',error);
      if(!this.closed)this.status.setText(`清理未完成：${(error as Error).message}`);
    }finally{this.running=false;if(!this.closed)this.submit.setDisabled(false);}
  }
  onClose():void {this.closed=true;this.contentEl.empty();}
}

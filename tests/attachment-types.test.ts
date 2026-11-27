import {test,expect} from 'bun:test';
import {addAttachmentTypes,matchesAttachmentTypes} from '../src/search/attachment-types.ts';
import {normalizeSettings,validateSetting} from '../src/settings/schema.ts';
import {refreshedSearchSettings} from '../src/search/special-search-options.ts';

test('suffix tags accept batches, normalize case and preserve deselected duplicates',()=>{
  const original=[{extension:'pdf',selected:false}];
  const values=addAttachmentTypes(original,'.PDF, canvas .SvG；excalidraw.md');
  expect(values).toEqual([{extension:'pdf',selected:false},{extension:'canvas',selected:true},{extension:'svg',selected:true},{extension:'excalidraw.md',selected:true}]);
  expect(original).toEqual([{extension:'pdf',selected:false}]);
  expect(matchesAttachmentTypes('Folder/A.CANVAS',values)).toBe(true);
  expect(matchesAttachmentTypes('a.PDF',values)).toBe(false);
  expect(matchesAttachmentTypes('a.canvas.backup',values)).toBe(false);
  expect(matchesAttachmentTypes('Drawing.EXCALIDRAW.MD',values)).toBe(true);
  expect(matchesAttachmentTypes('a.unknown',[])).toBe(true);
  expect(matchesAttachmentTypes('a.pdf',[{extension:'pdf',selected:false}])).toBe(false);
  expect(()=>addAttachmentTypes(values,'../invalid')).toThrow();
  expect(()=>addAttachmentTypes(values,'')).toThrow();
});
test('suffix state validates selections and remains isolated through unrelated settings refresh',()=>{
  const global=normalizeSettings({attachmentFileTypes:[{extension:'pdf',selected:true}]}),session=normalizeSettings({attachmentFileTypes:[{extension:'canvas',selected:false}]});
  expect(refreshedSearchSettings(global,{settings:session,temporaryFileTypes:true}).attachmentFileTypes).toEqual(session.attachmentFileTypes);
  expect(refreshedSearchSettings(global,{settings:session,temporaryFileTypes:false}).attachmentFileTypes).toEqual(global.attachmentFileTypes);
  for(const value of [[{extension:'PDF',selected:true}],[{extension:'pdf',selected:'yes'}],[{extension:'pdf',selected:true},{extension:'pdf',selected:false}]])expect(()=>validateSetting('attachmentFileTypes',value)).toThrow();
});

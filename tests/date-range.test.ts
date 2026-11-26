import {test,expect} from 'bun:test';
import {localDateKey,recordDateRange} from '../src/history/date-range.ts';
import {validateSetting} from '../src/settings/schema.ts';

test('cleanup dates are local, inclusive, and reject malformed or reversed ranges',()=>{
 const range=recordDateRange('2024-02-29','2024-03-01');
 expect(range.start).toBe(new Date(2024,1,29).getTime());expect(range.end).toBe(new Date(2024,2,2).getTime());
 expect(localDateKey(range.start)).toBe('2024-02-29');
 for(const [from,to] of [['2023-02-29','2023-03-01'],['','2026-11-26'],['2026-11-27','2026-11-26'],['2026-13-01','2027-01-01']])expect(()=>recordDateRange(from,to)).toThrow();
});
test('zero means unlimited only for recent-document limits and disabled history is a valid choice',()=>{
 expect(validateSetting('recentFilesDays',0)).toBe(0);expect(validateSetting('recentFilesLimit',0)).toBe(0);
 expect(validateSetting('historyRetentionMode','disabled')).toBe('disabled');
 expect(validateSetting('defaultRecordView','history')).toBe('history');expect(validateSetting('defaultRecordView','recent')).toBe('recent');
 expect(()=>validateSetting('defaultRecordView','later')).toThrow();
 for(const key of ['historyPageSize','historyRetentionDays','dropdownPageSize'])expect(()=>validateSetting(key,0)).toThrow();
 expect(()=>validateSetting('recentFilesDays',-1)).toThrow();expect(()=>validateSetting('recentFilesLimit',0.5)).toThrow();
});

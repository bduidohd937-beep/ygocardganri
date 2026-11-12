import { describe,expect,it } from 'vitest';
import { summarizeArenaCsv,summarizeArenaJson,validateArenaIntakeRecord } from '../src/arenaIntake';
import { arenaIntakeId } from '../src/arenaIntakeVault';

describe('P6.1 unverified PSH AI ARENA file inventory',()=>{
  it('shows only JSON structure, not claims about sessions or success',()=>{
    const value={sessions:[{outcome:'WIN',finished:true}],message:'unverified',cfg:[]};
    const result=summarizeArenaJson(value);
    expect(result.structure).toBe('최상위 JSON 객체');
    expect(result.fields).toEqual(['sessions','message','cfg']);
    expect(result.itemCount).toBeNull();
    expect(JSON.stringify(result)).not.toContain('WIN');
    const list=summarizeArenaJson([{outcome:'WIN'},{outcome:'LOSS'}]);
    expect(list.itemCount).toBe(2);
    expect(list.notes.join(' ')).toContain('경기 수');
    expect(()=>summarizeArenaJson('fake')).toThrow('객체 또는 배열');
  });
  it('reads CSV headers/rows including commas and multiline quoted cells',()=>{
    const x=summarizeArenaCsv('\uFEFFid,comment,outcome\r\ns1,"A,B",stalled\r\ns2,"two\r\nlines",unknown\r\n');
    expect(x.fields).toEqual(['id','comment','outcome']);
    expect(x.itemCount).toBe(2);
    expect(x.notes[0]).toContain('의미하지');
    expect(()=>summarizeArenaCsv('id\n"unclosed')).toThrow('닫히지');
    expect(()=>summarizeArenaCsv('')).toThrow('비어');
  });
  it('records source hash, analysis revision and unverified provenance only',()=>{
    const hash='a'.repeat(64),fingerprint='b'.repeat(64);
    const id=arenaIntakeId('s1',3,fingerprint,hash);
    expect(id).toContain('s1:3:');
    const valid={
      schemaVersion:1,id,studyId:'s1',studyRevision:3,deckFingerprint:fingerprint,
      importedAt:'2026-11-12T02:00:00Z',filename:'arena.json',size:26,sha256:hash,format:'json',
      preview:{structure:'최상위 JSON 객체',itemCount:null,fields:['sessions'],notes:[]},
      verification:'원본 파일 보관 · 내용 미검증',
    };
    expect(validateArenaIntakeRecord(valid)).toBe(true);
    expect(validateArenaIntakeRecord({...valid,verification:'EDOPro 엔진 검증 성공'})).toBe(false);
    expect(validateArenaIntakeRecord({...valid,size:0})).toBe(false);
  });
});

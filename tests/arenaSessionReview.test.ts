import { describe,expect,it } from 'vitest';
import { arenaDataSets,arenaResultValues,arenaTableFromText,summarizeArenaReview,validateReviewMapping } from '../src/arenaSessionReview';
import type { ReviewMapping } from '../src/arenaSessionReview';
import { validStoredArenaReview } from '../src/arenaReviewVault';
describe('P6.1 stage 2: unverified manual session mapping',()=>{
  it('requires user selection of JSON top-level arrays without guessing a schema',()=>{
    const src=JSON.stringify({info:{name:'unknown'},sessions:[{sessionId:'a',result:'OK'}],logs:[{x:'1'}]});
    expect(arenaDataSets(src,'json')).toEqual(['sessions','logs']);
    const table=arenaTableFromText(src,'json','sessions');
    expect(table.fields).toEqual(['sessionId','result']);
    expect(table.rows).toEqual([{sessionId:'a',result:'OK'}]);
    expect(()=>arenaTableFromText(src,'json','info')).toThrow('배열');
    expect(()=>arenaTableFromText('["WIN"]','json','@root')).toThrow('객체가 아닌');
    expect(arenaDataSets('[{"s":1}]','json')).toEqual(['@root']);
    expect(()=>arenaDataSets('{"meta":true}','json')).not.toThrow();
  });
  it('handles quoted multiline CSV and rejects broken/inconsistent row structures',()=>{
    const csv='\uFEFFid,result,note\r\ns1,WIN,"first,line"\r\ns2,HALT,"two\r\nlines"\r\n';
    const t=arenaTableFromText(csv,'csv','@csv');
    expect(t.fields).toEqual(['id','result','note']);
    expect(t.rows).toEqual([{id:'s1',result:'WIN',note:'first,line'},{id:'s2',result:'HALT',note:'two\r\nlines'}]);
    expect(arenaDataSets(csv,'csv')).toEqual(['@csv']);
    expect(()=>arenaTableFromText('id,result\ns1','csv','@csv')).toThrow('열 수');
    expect(()=>arenaTableFromText('id,id\n1,2','csv','@csv')).toThrow('중복');
    expect(()=>arenaTableFromText('id,result\n1,"open','csv','@csv')).toThrow('닫히지');
  });
  it('excludes duplicate and missing session ids from all user-mapped result totals',()=>{
    const dataset=arenaTableFromText(JSON.stringify({rows:[
      {id:'s1',outcome:'WIN'},{id:'s2',outcome:'HALT'},{id:'s3',outcome:'WIN'},
      {id:'s3',outcome:'LOSS'},{id:'',outcome:'WIN'},{id:'s4',outcome:'UNKNOWN'},
    ]}),'json','rows');
    const map:ReviewMapping={dataSet:'rows',sessionField:'id',resultField:'outcome',values:{
      WIN:'승리 기록',LOSS:'패배 기록',HALT:'교착·중단 기록',
    }};
    expect(validateReviewMapping(dataset,map)).toBe(true);
    expect(arenaResultValues(dataset,'outcome')).toEqual(['WIN','HALT','LOSS','UNKNOWN']);
    expect(summarizeArenaReview(dataset,map)).toEqual({
      sourceRows:6,uniqueIds:3,invalidIds:1,duplicateRows:2,
      classified:2,win:1,loss:0,draw:0,interrupted:1,unknown:0,unmapped:1,
    });
    expect(validateReviewMapping(dataset,{...map,sessionField:'outcome'})).toBe(false);
    expect(validateReviewMapping(dataset,{...map,values:{WIN:'엔진 검증' as never}})).toBe(false);
  });
  it('binds saved classifications to a concrete source hash and revision',()=>{
    const map:ReviewMapping={dataSet:'rows',sessionField:'id',resultField:'status',values:{stalled:'교착·중단 기록'}};
    const good={schemaVersion:1,sourceId:'study:1:'+ 'a'.repeat(64)+':'+ 'b'.repeat(64),
      sourceSha256:'b'.repeat(64),studyId:'study',studyRevision:1,deckFingerprint:'a'.repeat(64),
      revision:1,savedAt:'2026-11-12T00:00:00.000Z',mapping:map};
    expect(validStoredArenaReview(good)).toBe(true);
    expect(validStoredArenaReview({...good,sourceSha256:'not-sha'})).toBe(false);
    expect(validStoredArenaReview({...good,mapping:{...map,values:{stalled:'확인된 엔진 승리'}}})).toBe(false);
  });
});

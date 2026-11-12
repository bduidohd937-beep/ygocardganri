import { describe,expect,it } from 'vitest';
import { assessDuelHand,parseHand,reportedSummary,validateDuelRecord,validateEvidenceBackup,validateHand,stableDeckSnapshot } from '../src/duelEvidence';
import type { DuelEvidenceRecord } from '../src/duelEvidence';
import { newDeckStudy } from '../src/deckMath';
import type { DeckStudy } from '../src/deckMath';

const ids=Array.from({length:20},(_,i)=>String(91008601+i));
const source={id:'from-ydk',themeId:'test',sourceId:'file1',name:'현장검증.ydk',
  main:ids.flatMap(id=>[id,id]),extra:[],side:[]};
const setup=()=>{
  const study=newDeckStudy(source);
  study.revision=4;
  study.combinations={routes:[
    {id:'r1',label:'A+B',a:[ids[0]],b:[ids[1]],forbiddenIds:[ids[4]],
      resourceIds:[ids[2]],minResources:1},
    {id:'r2',label:'독립 초동',a:[ids[3]],b:[]},
  ],brickIds:[ids[5]]};
  return study;
};
const fake=(study:DeckStudy,values:Partial<DuelEvidenceRecord>={}):DuelEvidenceRecord=>({
  schemaVersion:1,id:'record-1',studyId:study.id,studyRevision:study.revision,
  themeId:study.themeId,deckFingerprint:'a'.repeat(64),recordedAt:'2026-11-12T01:00:00.000Z',
  handSize:5,hand:[ids[0],ids[1],ids[2],ids[8],ids[9]],shuffleMode:'무작위 셔플(사용자 기록)',
  outcome:'전개 성공(사용자 판정)',note:'Test Hand 재현',assessment:{matchedRoutes:['r1'],eligible:true,riskPresent:false},
  ...values,
});
describe('P6 manual EDOPro replay evidence provenance',()=>{
  it('accepts 5/6 card IDs, rejects invalid and incomplete hands',()=>{
    expect(parseHand(ids.slice(0,5).join(', '))).toEqual(ids.slice(0,5));
    expect(parseHand(ids.slice(0,6).join('\n'))).toEqual(ids.slice(0,6));
    expect(()=>parseHand(ids.slice(0,4).join(','))).toThrow('5장 또는 6장');
    expect(()=>parseHand('invalid')).toThrow('카드 ID');
  });
  it('prevents claiming more card copies than present in actual research deck',()=>{
    const study=setup();
    expect(()=>validateHand(study.main,[ids[0],ids[0],ids[0],ids[1],ids[2]],5)).toThrow('채용 매수');
    expect(()=>validateHand(study.main,[ids[0],ids[1],ids[2],ids[3],ids[19]],5)).not.toThrow();
    expect(()=>validateHand(study.main,[ids[0],ids[1],ids[2],ids[3],ids[19]],6)).toThrow('장수');
    expect(()=>validateHand(study.main,[ids[0],ids[1],ids[2],ids[3],'999999999'],5)).toThrow('존재하지');
  });
  it('compares exact manual hands to P5.2 rules including forbid/resources',()=>{
    const study=setup(),plan=study.combinations!;
    const valid=assessDuelHand([ids[0],ids[1],ids[2],ids[10],ids[11]],plan);
    expect(valid.matchedRoutes).toEqual(['r1']);expect(valid.eligible).toBe(true);
    const blocked=assessDuelHand([ids[0],ids[1],ids[2],ids[4],ids[10]],plan);
    expect(blocked.eligible).toBe(false);
    const noResource=assessDuelHand([ids[0],ids[1],ids[7],ids[10],ids[11]],plan);
    expect(noResource.eligible).toBe(false);
    const alt=assessDuelHand([ids[3],ids[7],ids[10],ids[11],ids[12]],plan);
    expect(alt.matchedRoutes).toEqual(['r2']);
    expect(assessDuelHand([ids[3],ids[5],ids[10],ids[11],ids[12]],plan).riskPresent).toBe(true);
  });
  it('requires separate physical cards when A and B IDs are identical',()=>{
    const plan={routes:[{id:'x',label:'two copies',a:[ids[0]],b:[ids[0]]}],brickIds:[]};
    expect(assessDuelHand([ids[0],...ids.slice(1,5)],plan).eligible).toBe(false);
    expect(assessDuelHand([ids[0],ids[0],...ids.slice(1,4)],plan).eligible).toBe(true);
  });
  it('does not label any hand as a known failure if no model routes are specified',()=>{
    expect(assessDuelHand(ids.slice(0,5),{routes:[],brickIds:[]}).eligible).toBeNull();
  });
  it('separates random user-report rate from deliberate test hands, unknown outcomes, and different versions',()=>{
    const study=setup(),hash='a'.repeat(64);
    const records=[
      fake(study,{id:'1'}),
      fake(study,{id:'2',outcome:'전개 실패(사용자 판정)',assessment:{matchedRoutes:[],eligible:false,riskPresent:false}}),
      fake(study,{id:'3',shuffleMode:'의도적으로 구성한 패',outcome:'전개 실패(사용자 판정)'}),
      fake(study,{id:'4',outcome:'판정 보류'}),
      fake(study,{id:'5',deckFingerprint:'b'.repeat(64)}),
      fake(study,{id:'6',studyRevision:3}),
      fake(study,{id:'7',handSize:6,hand:ids.slice(0,6)}),
    ];
    const result=reportedSummary(records,study,hash,5);
    expect(result.randomCompleted).toBe(2);
    expect(result.reportedSuccess).toBe(1);
    expect(result.rate).toBeCloseTo(.5);
    expect(result.modelCompared).toBe(2);
    expect(result.mismatched).toBe(0);
  });
  it('validates replay SHA256 metadata but makes no claim about replay contents',()=>{
    const study=setup();
    const file={filename:'_LastReplay.yrpX',size:100,sha256:'f'.repeat(64),format:'yrpX' as const};
    expect(validateDuelRecord(fake(study,{replay:file}))).toBe(true);
    expect(validateDuelRecord(fake(study,{replay:{...file,sha256:'unverified'}}))).toBe(false);
    expect(validateDuelRecord(fake(study,{replay:{...file,size:17*1024*1024}}))).toBe(false);
    expect(validateDuelRecord(fake(study,{hand:ids.slice(0,4)}))).toBe(false);
    expect(validateDuelRecord(fake(study,{outcome:'verified by replay' as DuelEvidenceRecord['outcome']}))).toBe(false);
  });
  it('exports metadata-only backup schema and rejects duplicate record IDs',()=>{
    const s=setup(),rec=fake(s);
    const backup={kind:'ygo_card_studio_edopro_evidence',schemaVersion:1,
      exportedAt:new Date().toISOString(),records:[rec]};
    expect(validateEvidenceBackup(backup)).toBe(true);
    expect(validateEvidenceBackup({...backup,records:[rec,rec]})).toBe(false);
    expect(stableDeckSnapshot({...s,main:[...s.main,ids[0]]})).not.toEqual(stableDeckSnapshot(s));
  });
});

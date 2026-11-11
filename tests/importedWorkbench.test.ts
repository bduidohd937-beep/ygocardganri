import { describe,expect,it } from 'vitest';
import { emptyFileCatalog } from '../src/fileCatalog';
import type { FileCatalog,AssetEntry } from '../src/fileCatalog';
import { addImportedProposal,collectLinkedCards,decideImportedProposal,editImportedRecord,emptyImportedRecord,setReview,validateImportedRecord } from '../src/importedWorkbench';

const asset=(id:string,themeId:string,kind:AssetEntry['kind'],cardId:string|null):AssetEntry=>({
  id,themeId,kind,cardId,filename:kind==='Lua'?`c${cardId}.lua`:`file_${id}`,sha256:'abc123',archivePath:'',size:10,importedAt:'2026-11-11T12:00:00Z',source:'직접',notes:[],cardCount:kind==='CDB'?1:0,
});
const catalog=():FileCatalog=>{
  const c=emptyFileCatalog();c.themes.push({id:'other',name:'코스모코드',description:'',createdAt:'',seed:false});
  c.assets.push(asset('db-a','other','CDB',null),asset('lua-a','other','Lua','12345'),asset('image-a','other','이미지','12345'),asset('db-b','nocturna','CDB',null));
  c.cards.push({themeId:'other',passcode:'12345',name:'코스모코드 유닛',effectText:'효과 텍스트 A',sourceId:'db-a',importedAt:'',confirmed:false});
  c.cards.push({themeId:'nocturna',passcode:'12345',name:'다른 세계 카드',effectText:'다른 원문',sourceId:'db-b',importedAt:'',confirmed:false});
  return c;
};
describe('P3 카드 연결과 원문 보존',()=>{
  it('같은 ID라도 테마가 다르면 서로 다른 연결 카드가 된다',()=>{
    const all=collectLinkedCards(catalog());expect(all).toHaveLength(2);
    const one=all.find(c=>c.themeId==='other')!;
    expect(one.files.map(f=>f.kind).sort()).toEqual(['CDB','Lua','이미지'].sort());
    expect(one.sourceCards[0].effectText).toBe('효과 텍스트 A');
    expect(all.find(c=>c.themeId==='nocturna')?.name).toBe('다른 세계 카드');
  });
  it('중복 CDB 원문 불일치는 자동 확정하지 않는다',()=>{
    const c=catalog();c.assets.push(asset('db-c','other','CDB',null));
    c.cards.push({themeId:'other',passcode:'12345',name:'코스모코드 유닛',effectText:'서로 다른 텍스트',sourceId:'db-c',importedAt:'',confirmed:false});
    const linked=collectLinkedCards(c,'other')[0];
    expect(linked.conflictingSources).toBe(true);expect(linked.sourceCards).toHaveLength(2);
    const r=emptyImportedRecord('other','12345');expect(r.approvedEffect).toBe('');
  });
  it('CDB 없는 Lua 파일만 존재해도 카드 ID로 작업실을 열 수 있다',()=>{
    const c=emptyFileCatalog();c.assets.push(asset('only-lua','nocturna','Lua','99999'));
    const linked=collectLinkedCards(c);expect(linked).toHaveLength(1);
    expect(linked[0].sourceCards).toHaveLength(0);expect(linked[0].name).toBe('미확인');
  });
  it('미승인 제안과 명시적 승인은 별도 리비전을 만든다',()=>{
    const init=emptyImportedRecord('other','12345');
    const p=addImportedProposal(init,'효과 텍스트 A','CDB 출처 확인','db-a');
    expect(init.approvedEffect).toBe('');expect(p.approvedEffect).toBe('');
    expect(p.proposals[0].sourceId).toBe('db-a');
    const approved=decideImportedProposal(p,p.proposals[0].id,'승인','효과 확정');
    expect(approved.approvedEffect).toBe('효과 텍스트 A');
    expect(approved.approvedEffectSource).toContain('db-a');
    expect(approved.review.ocg).toBe('미확인');expect(approved.review.duel).toBe('미확인');
    expect(approved.history[0].action).toBe('효과 원문 승인');
    expect(approved.history.length).toBe(3);
    expect(()=>decideImportedProposal(approved,p.proposals[0].id,'반려')).toThrow();
  });
  it('반려, 메모, 수동 검수는 승인 효과를 변경하지 않는다',()=>{
    const start=emptyImportedRecord('other','12345');
    const edited=editImportedRecord(start,{workingName:'작업 제목',design:'청색 실루엣'});
    const verified=setReview(edited,'lua','진행중','검수 준비');
    const pending=addImportedProposal(verified,'거부할 제안');
    const rejected=decideImportedProposal(pending,pending.proposals[0].id,'반려');
    expect(rejected.approvedEffect).toBe('');expect(rejected.review.lua).toBe('진행중');
    expect(edited.workingName).toBe('작업 제목');expect(start.workingName).toBe('');
    expect(validateImportedRecord(rejected)).toBe(true);
  });
  it('잘못된 데이터, ID, 상태는 거부한다',()=>{
    expect(()=>emptyImportedRecord('theme','bad')).toThrow();
    const r=emptyImportedRecord('other','12345');
    expect(validateImportedRecord({...r,review:{...r.review,duel:'검증 완료?' }})).toBe(false);
    expect(validateImportedRecord({...r,themeId:42})).toBe(false);
    expect(()=>setReview(r,'ocg','인증됨' as never)).toThrow();
    expect(()=>addImportedProposal(r,'   ')).toThrow();
  });
});
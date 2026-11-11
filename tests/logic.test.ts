import { describe, expect, it } from 'vitest';
import { countUnknown, createInitialData, displayName } from '../src/data';
import { createCard, decideEffect, editCard, exportJson, proposeEffect, updateWorldStage, validateBackup } from '../src/logic';

describe('기준 자료 보존',()=>{
  it('사용자 확정 세계 및 레벨4 아벨 5종을 유지한다',()=>{
    const db=createInitialData();
    expect(db.worlds).toHaveLength(5);
    expect(db.cards).toHaveLength(16);
    expect(db.cards.filter(c=>c.phase===0&&c.confirmedName)).toHaveLength(5);
    expect(db.cards.find(c=>c.id==='blood-0')?.name).toBe('피를 갈구하는 자－아벨');
    expect(db.cards.find(c=>c.id==='clock-0')?.name).toBe('시간이 멈춘 자－아벨');
    expect(db.cards.find(c=>c.id==='grave-0')?.name).toBe('무덤에 묻힌 자－아벨');
    expect(db.cards.find(c=>c.id==='sky-0')?.name).toBe('천상에서 추방된 자－아벨');
    expect(db.cards.find(c=>c.id==='fate-0')?.name).toBe('운명에 갇힌 자－아벨');
    expect(db.cards.filter(c=>c.phase===0).every(c=>c.level===4)).toBe(true);
    expect(db.cards.filter(c=>c.phase===1||c.phase===2).every(c=>c.name===''&&c.effect==='')).toBe(true);
    expect(countUnknown(db)).toBeGreaterThan(0);
  });
  it('공통 기본형 원문은 별도 카드이며 검증완료가 아니다',()=>{
    const db=createInitialData();const c=db.cards.find(c=>c.id==='common-abel')!;
    expect(c.name).toBe('기억을 잃은 자－아벨');
    expect(c.effect).toContain('①:');expect(c.effect).toContain('②:');
    expect(c.lua).toBe('미확인');expect(c.ocg).toBe('미확인');
  });
});

describe('수정 제안과 변경 이력',()=>{
  it('미승인 제안은 확정 효과 원문을 변경하지 않는다',()=>{
    const db=createInitialData();const next=proposeEffect(db,'blood-0','가상 테스트 원문','제안 메모');
    expect(next.cards.find(c=>c.id==='blood-0')?.effect).toBe('');
    expect(db.cards.find(c=>c.id==='blood-0')?.proposals).toHaveLength(0);
    expect(next.history[0].action).toBe('효과 제안 등록');
  });
  it('승인된 제안만 원문에 반영하고 승인 기록을 남긴다',()=>{
    let db=proposeEffect(createInitialData(),'blood-0','테스트 효과');
    const proposalId=db.cards.find(c=>c.id==='blood-0')!.proposals[0].id;
    db=decideEffect(db,'blood-0',proposalId,'승인');
    const c=db.cards.find(c=>c.id==='blood-0')!;
    expect(c.effect).toBe('테스트 효과');expect(c.proposals[0].status).toBe('승인');
    expect(c.approval).toBe('미확인');expect(db.history.some(h=>h.field==='effect')).toBe(true);
    expect(()=>decideEffect(db,'blood-0',proposalId,'반려')).toThrow();
  });
  it('반려 제안은 기존 효과를 변경하지 않는다',()=>{
    let db=proposeEffect(createInitialData(),'blood-0','반려할 효과');
    const pid=db.cards.find(c=>c.id==='blood-0')!.proposals[0].id;
    db=decideEffect(db,'blood-0',pid,'반려');
    expect(db.cards.find(c=>c.id==='blood-0')!.effect).toBe('');
  });
  it('확정 카드명을 허가 없이 수정하지 못한다',()=>{
    const db=createInitialData();
    expect(()=>editCard(db,'blood-0',{name:'다른 이름'})).toThrow();
    const next=editCard(db,'blood-0',{name:'다른 이름'},'수동 확인',true);
    expect(next.cards.find(c=>c.id==='blood-0')?.confirmedName).toBe(false);
  });
  it('카드와 세계관 변경을 저장하고 원본을 변형하지 않는다',()=>{
    const db=createInitialData();
    const changed=editCard(db,'grave-0',{design:'설계 메모'});
    expect(db.cards.find(c=>c.id==='grave-0')!.design).toBe('');
    expect(changed.cards.find(c=>c.id==='grave-0')!.design).toBe('설계 메모');
    const progressed=updateWorldStage(changed,'grave',1,{lore:'극복 단계의 검토안',status:'제안'});
    expect(progressed.worlds.find(w=>w.id==='grave')!.stages[1].status).toBe('제안');
    expect(changed.worlds.find(w=>w.id==='grave')!.stages[1].status).toBe('미확인');
  });
  it('새 카드는 실제 확정 정보 없이 미확인으로 시작한다',()=>{
    const result=createCard(createInitialData(),'clock');
    const fresh=result.cards[result.cards.length-1];
    expect(displayName(fresh)).toBe('카드명 미확인');
    expect(fresh.effect).toBe('');expect(fresh.level).toBeNull();
  });
});

describe('백업',()=>{
  it('JSON 내보내기/검증 왕복',()=>{
    const db=createInitialData();const exported=JSON.parse(exportJson(db));
    expect(validateBackup(exported)).toBe(true);
    expect(validateBackup({...exported,cards:[...exported.cards,exported.cards[0]]})).toBe(false);
    expect(validateBackup({...exported,schemaVersion:999})).toBe(false);
    expect(validateBackup({...exported,cards:exported.cards.map((c:any)=>c.id==='blood-0'?{...c,artUrl:'javascript:alert(1)'}:c)})).toBe(false);
  });
});
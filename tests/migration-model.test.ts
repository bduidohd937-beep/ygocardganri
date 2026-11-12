import { describe,it,expect } from 'vitest';
import { inspectMigrationFile, parseMigrationContent, metadataCandidate, safeBackupFilename } from '../src/migrationModel';

describe('V2.1 기존 사이트 데이터 이전 원본 형식 검증',()=>{
  it('PSH 전체 백업은 경기 완료 인증 없이 보관 전용으로 분류',()=>{
    const raw={app:'PSH AI ARENA 검증 관제실',schemaVersion:1,data:{
      schemaVersion:1,sessions:[{id:'S1',completedGames:0}],events:[],tests:[],features:[],issues:[],protection:[]
    }};
    const r=inspectMigrationFile('PSH_백업.json',raw);
    expect(r.kind).toBe('psh');
    expect(r.count).toBe(1);
    expect(r.canMergeMetadata).toBe(false);
  });
  it('카드 렌더러 원본에서 메타 후보로는 카드 ID/이름/효과만 분리',()=>{
    const raw={version:1,name:'렌더러',cards:[{id:918760001,name:'시제품',theme:'테스트',effect:'효과',frame:'effect',artwork:'data:image/png;base64,123'}]};
    const kind=inspectMigrationFile('렌더러.json',raw);
    expect(kind.kind).toBe('cardmaker');
    const candidate=metadataCandidate(kind.kind,JSON.stringify(raw),'렌더러.json');
    expect(candidate?.cards[0]).toMatchObject({id:'918760001',name:'시제품',effect:'효과'});
    expect((candidate?.cards[0] as unknown as Record<string,unknown>).artwork).toBeUndefined();
  });
  it('공통 카드 백업과 YDK만 명시적인 메타 이전 대상으로 처리한다',()=>{
    const raw={schemaVersion:1,cards:[{id:'918760002',name:'신규',theme:'무성해',effect:'',source:'수동'}],decks:[]};
    expect(inspectMigrationFile('공통백업.json',raw).kind).toBe('shared');
    const deck=parseMigrationContent('덱01.ydk','#main\n918760002\n#extra\n918760003\n!side\n918760004\n');
    expect(deck.kind).toBe('ydk');
    expect(deck.count).toBe(3);
    expect(metadataCandidate('ydk','#main\n918760002\n#extra\n918760003\n!side\n918760004\n','덱01.ydk')?.decks[0].extra).toEqual(['918760003']);
  });
  it('손상 JSON과 YDK는 정상 원본으로 등록하지 않는다',()=>{
    expect(parseMigrationContent('손상.json','{nope').blocked).toBe(true);
    expect(parseMigrationContent('틀린덱.ydk','#main\nnot-a-card').blocked).toBe(true);
  });
  it('이미지·CDB·Lua·리플레이·ZIP는 바이트 보관만 지원',()=>{
    for(const [name,kind] of [['카드.png','image'],['custom.cdb','cdb'],['c918760001.lua','lua'],['duel.yrpX','replay'],['archive.zip','zip']]){
      const result=inspectMigrationFile(name,'');
      expect(result.kind).toBe(kind);
      expect(result.canMergeMetadata).toBe(false);
    }
  });
  it('ZIP 경로 조작을 방지할 파일명 정규화',()=>{
    expect(safeBackupFilename('../사본\\위험:이름.json')).not.toContain('/');
    expect(safeBackupFilename('../사본\\위험:이름.json')).not.toContain('..');
  });
});

import {describe,it,expect} from 'vitest';
import {createInitialData} from '../src/data';
import {exportJson,validateBackup} from '../src/logic';
import {
  initialGenericRecords,genericCsv,genericFolder,genericBackup,parseGenericBackup,
  searchGeneric,validateGenericRecords
} from '../src/genericCatalog';
const cards=initialGenericRecords();
describe('범용 카드 도감 · 메인 저장소 이관',()=>{
  it('초기 5종 채택/4종 보류, 제작 기록과 미검증 구분',()=>{
    expect(cards).toHaveLength(9);
    expect(cards.filter(c=>c.adoption==='채택')).toHaveLength(5);
    expect(cards.filter(c=>c.adoption==='보류')).toHaveLength(4);
    expect(cards.filter(c=>c.adoption==='채택').every(c=>c.cdb==='제작 기록'&&c.lua==='제작 기록')).toBe(true);
    expect(cards.every(c=>c.duel==='미검증')).toBe(true);
    expect(cards.every(c=>c.effect===''&&c.attribute==='')).toBe(true);
    expect(cards.find(c=>c.id==='919300104')?.version).toBe('V0.8');
    expect(cards.filter(c=>!c.id)).toHaveLength(4);
  });
  it('검색에서 ID, 역할, 효과, 외부 참조 효과와 필터가 작동',()=>{
    const sources=new Map([['919300101',{name:'로코',effect:'덱에서 서치',attribute:'빛'}]]);
    expect(searchGeneric(cards,'919300101','전체')).toHaveLength(1);
    expect(searchGeneric(cards,'특수 소환 대응 드로우','채택')[0].id).toBe('990470201');
    expect(searchGeneric(cards,'서치','채택',sources).map(x=>x.id)).toContain('919300101');
    expect(searchGeneric(cards,'빛','채택',sources)[0].id).toBe('919300101');
    expect(searchGeneric(cards,'예비 시동','보류')).toHaveLength(1);
    expect(searchGeneric(cards,'예비 시동','채택')).toHaveLength(0);
  });
  it('중복 ID, 불량 버전, 손상 데이터는 거부하고 원형을 보존',()=>{
    expect(validateGenericRecords(cards)).toBe(true);
    expect(validateGenericRecords([...cards,{...cards[1],key:'duplicate',id:cards[0].id}])).toBe(false);
    expect(validateGenericRecords([...cards,{...cards[1],key:cards[0].key}])).toBe(false);
    expect(()=>parseGenericBackup({kind:'wrong',schemaVersion:1,records:cards})).toThrow();
    expect(parseGenericBackup(JSON.parse(genericBackup(cards)))).toEqual(cards);
    expect(genericFolder(cards[0])).toContain('채택카드/990470201_');
  });
  it('기존 통합 프로젝트 JSON 백업과 호환, 구형 백업도 지원',()=>{
    const initial=createInitialData();
    expect(initial.genericCards).toHaveLength(9);
    expect(validateBackup(JSON.parse(exportJson(initial)))).toBe(true);
    expect(validateBackup({...initial,genericCards:undefined})).toBe(true);
    expect(validateBackup({...initial,genericCards:[{id:'bad'}]})).toBe(false);
  });
  it('CSV BOM, 채택/검증 상태 및 CSV 수식 주입 보호',()=>{
    const csv=genericCsv([...cards,{...cards[5],name:'=SUM(1)',key:'extra-id'}]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('EDOPro 실전');
    expect(csv).toContain('919300104');
    expect(csv).toContain("'=SUM(1)");
  });
});
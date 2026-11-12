import {describe, expect, it} from 'vitest';
import {
  readSharedProjects, parseSharedProjectStorage, projectOptions,
  safeProjectSelection, addRecent, parseRecentPages
} from '../src/studioV2Model';

describe('YGO STUDIO UI V2 프로젝트 탐색과 최근 작업 기록',()=>{
  const stored={
    schemaVersion:1,
    cards:[
      {id:'918760001',name:'코스모코드－알파',theme:'코스모코드',effect:'',source:'테스트'},
      {id:'918760002',name:'코스모코드－베타',theme:'코스모코드',effect:'',source:'테스트'},
      {id:'918760003',name:'아비온',theme:'무성해',effect:'',source:'테스트'},
    ],decks:[]
  };
  it('실제 공통 보관함에 기록된 테마만 프로젝트로 표시한다',()=>{
    const found=readSharedProjects(stored);
    expect(found.projects.map(p=>p.name)).toEqual(['무성해','코스모코드']);
    expect(found.projects.find(p=>p.name==='코스모코드')?.cards).toBe(2);
    expect(found.projects.find(p=>p.name==='코스모코드')?.kind).toBe('shared');
  });
  it('기록이 없으면 다른 테마를 만들어내지 않는다',()=>{
    const options=projectOptions(16,parseSharedProjectStorage(null).projects);
    expect(options).toHaveLength(2);
    expect(options.map(p=>p.key)).toEqual(['all','nocturna']);
    expect(options[0].cards).toBe(16);
    expect(safeProjectSelection('shared:코스모코드',options)).toBe('all');
  });
  it('기존 녹투르나 프로젝트는 그대로 유지하고 공통 자료 수치는 분리한다',()=>{
    const options=projectOptions(16,readSharedProjects(stored).projects);
    expect(options.find(p=>p.key==='nocturna')?.cards).toBe(16);
    expect(options.find(p=>p.key==='all')?.cards).toBe(19);
    expect(safeProjectSelection('shared:무성해',options)).toBe('shared:무성해');
  });
  it('잘못된 메타 백업은 프로젝트 선택에 활용하지 않는다',()=>{
    expect(parseSharedProjectStorage('{notjson').projects).toEqual([]);
    expect(readSharedProjects({schemaVersion:1,cards:[{id:'bad',name:'X'}],decks:[]}).projects).toEqual([]);
  });
  it('최근 메뉴는 실제 방문 기록만 보존하며 중복 없이 최신 5개로 제한한다',()=>{
    const valid=['home','cards','artlab','decks','arena','settings'];
    const p1=addRecent([], 'cards',valid);
    const p2=addRecent(p1,'artlab',valid);
    expect(addRecent(p2,'cards',valid)).toEqual(['cards','artlab']);
    expect(addRecent(p2,'invented',valid)).toEqual(p2);
    expect(parseRecentPages(JSON.stringify(['cards','cards','bad','artlab']),valid)).toEqual(['cards','artlab']);
    expect(parseRecentPages('not-json',valid)).toEqual([]);
  });
});

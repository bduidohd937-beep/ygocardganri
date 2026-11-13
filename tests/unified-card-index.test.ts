import {describe,expect,it} from 'vitest';
import {buildUnifiedIndex,filterUnifiedRows,unifiedReport} from '../src/unifiedCardIndex';
import {emptyCatalog as emptyShared,parseCards} from '../src/sharedCatalog';
import {emptyFileCatalog} from '../src/fileCatalog';
import type {FileCatalog,AssetEntry,IndexedCard} from '../src/fileCatalog';
import type {MediaItem} from '../src/sharedMedia';
import type {SharedCatalog} from '../src/sharedCatalog';

const id='918760001';
const origin=(kind:AssetEntry['kind'],filename:string,hash='sha1',cardId:string|null=id,themeId='nocturna'):AssetEntry=>({
 id:filename+'-'+hash,themeId,kind,filename,archivePath:filename,cardId,sha256:hash,size:20,
 importedAt:'2026-11-13T00:00:00Z',source:'직접',notes:[],cardCount:kind==='CDB'?1:0
});
const cdb=(sourceId:string,name='RS－오리온',effectText='① 카드 효과'):IndexedCard=>({
 themeId:'nocturna',passcode:id,name,effectText,sourceId,importedAt:'2026-11-13T00:00:00Z',confirmed:false
});
const shared=():SharedCatalog=>({
 schemaVersion:1,cards:parseCards([{id,name:'RS－오리온',theme:'RS',effect:'① 카드 효과'}],'공통').cards,
 decks:[{name:'메인덱',source:'YDK',main:[id,id,'918760002'],extra:[id],side:[id]}]
});
const image:MediaItem={id,name:'RS－오리온',blob:new Blob(['png'],{type:'image/png'}),mime:'image/png',
 sha256:'sha',source:'cardmaker',importedAt:'2026-11-13T00:00:00Z'};
const files=():FileCatalog=>{
 const v=emptyFileCatalog();const c=origin('CDB','카드.cdb','hashcdb',null);
 v.assets=[c,origin('Lua','c'+id+'.lua','hashlua')];
 v.cards=[cdb(c.id)];
 v.decks=[{id:'deck2',themeId:'nocturna',sourceId:'ydk-source',name:'사이드덱',
   main:[id],extra:[],side:[]}];
 return v;
};
describe('V3.0 카드 ID 다중 저장소 통합 인덱스',()=>{
 it('원장, 공통 이미지, CDB 후보, Lua 및 양쪽 YDK를 하나의 ID로 연결한다',()=>{
   const s=shared(),f=files();const original=JSON.stringify([s,f]);
   const out=buildUnifiedIndex(s,[image],f);
   const row=out.rows.find(r=>r.id===id)!;
   expect(row.linkedCount).toBe(4);
   expect(row.name).toBe('RS－오리온');
   expect(row.cdb).toHaveLength(1);
   expect(row.lua).toHaveLength(1);
   expect(row.issues).toEqual([]);
   expect(row.deckUses.map(d=>[d.name,d.main,d.extra,d.side])).toEqual([
     ['메인덱',2,1,1],['사이드덱',1,0,0]
   ]);
   expect(out.summary.total).toBe(2);
   expect(out.summary.complete).toBe(1);
   expect(out.summary.incomplete).toBe(1);
   expect(JSON.stringify([s,f])).toBe(original);
 });
 it('CDB 상호 충돌 및 원장 불일치를 미승인 증거로 표시한다',()=>{
   const f=files();const original=origin('CDB','다른 카드.cdb','hash2',null);
   f.assets.push(original);f.cards.push(cdb(original.id,'서로 다른 카드명','② 다른 원문'));
   const out=buildUnifiedIndex(shared(),[image],f);
   const row=out.rows.find(r=>r.id===id)!;
   expect(row.issues).toContain('CDB 원문 충돌');
   expect(row.issues).toContain('카드 원문 불일치');
   expect(out.summary.conflicts).toBe(1);
   expect(filterUnifiedRows(out.rows,'conflict','오리온')).toHaveLength(1);
   expect(filterUnifiedRows(out.rows,'conflict','없는 이름')).toHaveLength(0);
 });
 it('Lua·이미지 파일만 등록된 카드도 누락 ID로 표시하며 원장으로 추정 등록하지 않는다',()=>{
   const f=emptyFileCatalog();f.assets=[origin('Lua','c918760099.lua','lua','918760099'),
     origin('이미지','918760099.png','art','918760099')];
   const out=buildUnifiedIndex(emptyShared(),[],f);
   expect(out.rows).toHaveLength(1);
   expect(out.rows[0].id).toBe('918760099');
   expect(out.rows[0].card).toBeNull();
   expect(out.rows[0].issues).toContain('카드 정보 없음');
   expect(out.rows[0].linkedCount).toBe(2);
   expect(out.summary.incomplete).toBe(1);
 });
 it('같은 ID Lua 원본 해시가 다르면 버전 충돌로 보고하고 원본을 유지한다',()=>{
   const f=files();f.assets.push(origin('Lua','c918760001.lua','other'));
   const out=buildUnifiedIndex(shared(),[image],f);
   expect(out.rows.find(r=>r.id===id)?.issues).toContain('파일 버전 충돌');
   expect(f.assets.filter(a=>a.kind==='Lua')).toHaveLength(2);
 });
 it('카드 ID 규격 밖 레코드는 공통 인덱스에 끼워 넣지 않는다',()=>{
   const f=emptyFileCatalog();
   f.assets.push(origin('Lua','c99999999999.lua','invalid','99999999999'));
   const out=buildUnifiedIndex(emptyShared(),[],f);
   expect(out.rows).toHaveLength(0);
 });
 it('4/4 필터와 덱 필터는 서로 독립적이며 전체 CSV가 ID 단위다',()=>{
   const out=buildUnifiedIndex(shared(),[image],files());
   expect(filterUnifiedRows(out.rows,'complete','')).toHaveLength(1);
   expect(filterUnifiedRows(out.rows,'missing','')).toHaveLength(1);
   expect(filterUnifiedRows(out.rows,'deck','')).toHaveLength(2);
   const csv=unifiedReport(out.rows);
   expect(csv).toContain('918760001');
   expect(csv).toContain('4/4');
   expect(csv.split('\r\n')).toHaveLength(4);
 });
 it('CSV 셀의 수식 시작 문자를 무력화한다',()=>{
   const s=shared();s.cards[0].name='=HYPERLINK("evil")';
   const csv=unifiedReport(buildUnifiedIndex(s,[image],files()).rows);
   expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
 });
});

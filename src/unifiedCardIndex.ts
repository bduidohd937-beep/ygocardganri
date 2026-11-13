/** V3.0: a read-only numerical ID index across independent browser stores. Not an approval or engine validator. */
import {validCardId,type SharedCard,type SharedCatalog} from './sharedCatalog';
import type {MediaItem} from './sharedMedia';
import type {AssetEntry,FileCatalog,IndexedCard} from './fileCatalog';

export type UnifiedIssue='카드 정보 없음'|'일러스트 없음'|'CDB 원문 없음'|'Lua 없음'|'CDB 원문 충돌'|'카드 원문 불일치'|'파일 버전 충돌';
export type UnifiedDeckUse={name:string;source:'공통 YDK'|'파일 센터 YDK';theme:string;main:number;extra:number;side:number;total:number};
export type UnifiedCardRow={
  id:string;name:string;theme:string;card:SharedCard|null;image:MediaItem|null;
  cdb:IndexedCard[];lua:AssetEntry[];fileImages:AssetEntry[];
  deckUses:UnifiedDeckUse[];issues:UnifiedIssue[];linkedCount:number;
  cdbVariants:number;assetSources:AssetEntry[];
};
export type UnifiedSummary={total:number;complete:number;incomplete:number;conflicts:number;inDeck:number;
  cards:number;images:number;cdb:number;lua:number};

const countIds=(ids:readonly string[],counts:Map<string,number>)=>{
  for(const v of ids){const id=validCardId(v);if(id)counts.set(id,(counts.get(id)||0)+1);}
};
export function buildUnifiedIndex(
  shared:SharedCatalog,media:readonly MediaItem[],files:FileCatalog
):{rows:UnifiedCardRow[];summary:UnifiedSummary}{
  const byId=new Map<string,UnifiedCardRow>();
  const ensure=(value:unknown):UnifiedCardRow|null=>{
    const id=validCardId(value);
    if(!id)return null;
    let row=byId.get(id);
    if(!row){
      row={id,name:'이름 미등록',theme:'미확인',card:null,image:null,cdb:[],lua:[],fileImages:[],
        deckUses:[],issues:[],linkedCount:0,cdbVariants:0,assetSources:[]};
      byId.set(id,row);
    }
    return row;
  };
  for(const card of shared.cards){const row=ensure(card.id);if(row)row.card=card;}
  for(const image of media){const row=ensure(image.id);if(row&&image.blob instanceof Blob)row.image=image;}
  const assetById=new Map(files.assets.map(a=>[a.id,a]));
  const themeById=new Map(files.themes.map(t=>[t.id,t.name]));
  for(const card of files.cards){
    const row=ensure(card.passcode);
    const asset=assetById.get(card.sourceId);
    if(!row||!asset||asset.kind!=='CDB'||asset.themeId!==card.themeId)continue;
    row.cdb.push(card);
    if(!row.assetSources.some(a=>a.id===asset.id))row.assetSources.push(asset);
  }
  for(const asset of files.assets){
    if(asset.kind!=='Lua'&&asset.kind!=='이미지')continue;
    const row=ensure(asset.cardId);
    if(!row)continue;
    if(asset.kind==='Lua')row.lua.push(asset);
    if(asset.kind==='이미지')row.fileImages.push(asset);
    if(!row.assetSources.some(a=>a.id===asset.id))row.assetSources.push(asset);
  }
  const addUse=(source:UnifiedDeckUse['source'],name:string,theme:string,
    main:readonly string[],extra:readonly string[],side:readonly string[])=>{
    const counts=[new Map<string,number>(),new Map<string,number>(),new Map<string,number>()];
    countIds(main,counts[0]);countIds(extra,counts[1]);countIds(side,counts[2]);
    const unique=new Set([...counts[0].keys(),...counts[1].keys(),...counts[2].keys()]);
    for(const id of unique){
      const row=ensure(id);
      if(!row)continue;
      const m=counts[0].get(id)||0,e=counts[1].get(id)||0,s=counts[2].get(id)||0;
      row.deckUses.push({name,source,theme,main:m,extra:e,side:s,total:m+e+s});
    }
  };
  for(const deck of shared.decks)addUse('공통 YDK',deck.name,'공통 보관함',deck.main,deck.extra,deck.side);
  for(const deck of files.decks)addUse('파일 센터 YDK',deck.name,themeById.get(deck.themeId)||'테마 미확인',deck.main,deck.extra,deck.side);
  const summary:UnifiedSummary={total:0,complete:0,incomplete:0,conflicts:0,inDeck:0,cards:0,images:0,cdb:0,lua:0};
  const rows=[...byId.values()];
  for(const row of rows){
    const candidates=row.cdb.filter(c=>c.name.trim()||c.effectText.trim());
    const variants=new Set(candidates.map(c=>JSON.stringify([c.name.trim(),c.effectText.trim()])));
    row.cdbVariants=variants.size;
    row.name=row.card?.name||candidates.find(c=>c.name.trim())?.name||'이름 미등록';
    row.theme=row.card?.theme||(
      row.cdb[0]?themeById.get(row.cdb[0].themeId):undefined
    )||(
      row.assetSources[0]?themeById.get(row.assetSources[0].themeId):undefined
    )||'미확인';
    const imagePresent=!!row.image||row.fileImages.length>0;
    row.linkedCount=Number(!!row.card)+Number(imagePresent)+Number(row.cdb.length>0)+Number(row.lua.length>0);
    if(!row.card)row.issues.push('카드 정보 없음');
    if(!imagePresent)row.issues.push('일러스트 없음');
    if(!row.cdb.length)row.issues.push('CDB 원문 없음');
    if(!row.lua.length)row.issues.push('Lua 없음');
    if(variants.size>1)row.issues.push('CDB 원문 충돌');
    if(row.card&&candidates.some(c=>
      (!!c.name.trim()&&c.name.trim()!==row.card!.name.trim())||
      (!!c.effectText.trim()&&!!row.card!.effect.trim()&&c.effectText.trim()!==row.card!.effect.trim())
    ))row.issues.push('카드 원문 불일치');
    if(['Lua','이미지'].some(kind=>{
      const assets=kind==='Lua'?row.lua:row.fileImages;
      return new Set(assets.map(a=>a.sha256)).size>1;
    }))row.issues.push('파일 버전 충돌');
    summary.total++;
    if(row.linkedCount===4)summary.complete++;else summary.incomplete++;
    if(row.issues.some(i=>i.includes('충돌')||i==='카드 원문 불일치'))summary.conflicts++;
    if(row.deckUses.length)summary.inDeck++;
    if(row.card)summary.cards++;
    if(imagePresent)summary.images++;
    if(row.cdb.length)summary.cdb++;
    if(row.lua.length)summary.lua++;
  }
  rows.sort((a,b)=>Number(a.id)-Number(b.id));
  return {rows,summary};
}
export type UnifiedFilter='all'|'missing'|'conflict'|'deck'|'complete';
export function filterUnifiedRows(rows:readonly UnifiedCardRow[],filter:UnifiedFilter,query:string):UnifiedCardRow[]{
  const q=query.trim().toLocaleLowerCase();
  return rows.filter(row=>{
    if(filter==='missing'&&row.linkedCount===4)return false;
    if(filter==='conflict'&&!row.issues.some(i=>i.includes('충돌')||i==='카드 원문 불일치'))return false;
    if(filter==='deck'&&!row.deckUses.length)return false;
    if(filter==='complete'&&row.linkedCount!==4)return false;
    return !q||(row.id+' '+row.name+' '+row.theme+' '+row.cdb.map(c=>c.name).join(' '))
      .toLocaleLowerCase().includes(q);
  });
}
export function unifiedReport(rows:readonly UnifiedCardRow[]):string{
  const columns=['카드 ID','카드명','테마','연결 수','공통 카드','일러스트','CDB 원문','Lua','덱 사용','문제'];
  const csv=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
  return '\uFEFF'+[columns.join(','),...rows.map(r=>[
    r.id,r.name,r.theme,String(r.linkedCount)+'/4',r.card?'있음':'없음',r.image||r.fileImages.length?'있음':'없음',
    r.cdb.length?'있음':'없음',r.lua.length?'있음':'없음',String(r.deckUses.length),r.issues.join(' / ')
  ].map(csv).join(','))].join('\r\n')+'\r\n';
}

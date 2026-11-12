import type {SharedCard,SharedDeck} from './sharedCatalog';

/** Read-only deck view: copies are counted by YDK zone, missing IDs are deduplicated. */
export type ZoneKey='main'|'extra'|'side';
export type LinkedDeckEntry={id:string;copies:number;card:SharedCard|null;hasImage:boolean};
export type LinkedDeckZone={key:ZoneKey;label:string;total:number;named:number;illustrated:number;entries:LinkedDeckEntry[]};
export type LinkedDeckReport={
  total:number;named:number;illustrated:number;
  zones:LinkedDeckZone[];missingIds:string[];withoutImageIds:string[];
};
const ZONES:ReadonlyArray<{key:ZoneKey;label:string}>=[
  {key:'main',label:'메인'},{key:'extra',label:'엑스트라'},{key:'side',label:'사이드'}
];

export function buildDeckLinkReport(
  deck:SharedDeck,cards:ReadonlyArray<SharedCard>,imageIds:ReadonlySet<string>
):LinkedDeckReport{
  const byId=new Map(cards.map(card=>[card.id,card] as const));
  const missing=new Set<string>(),noImage=new Set<string>();
  let total=0,named=0,illustrated=0;
  const zones:LinkedDeckZone[]=ZONES.map(({key,label})=>{
    const counts=new Map<string,number>();
    for(const id of deck[key])counts.set(id,(counts.get(id)||0)+1);
    const entries:LinkedDeckEntry[]=[];
    let zoneNamed=0,zoneIllustrated=0;
    for(const [id,copies] of counts){
      const card=byId.get(id)||null;
      const hasImage=card!==null&&imageIds.has(id);
      if(!card)missing.add(id);
      else if(!hasImage)noImage.add(id);
      if(card)zoneNamed+=copies;
      if(hasImage)zoneIllustrated+=copies;
      entries.push({id,copies,card,hasImage});
    }
    total+=deck[key].length;named+=zoneNamed;illustrated+=zoneIllustrated;
    return {key,label,total:deck[key].length,named:zoneNamed,illustrated:zoneIllustrated,entries};
  });
  return {total,named,illustrated,zones,missingIds:[...missing],withoutImageIds:[...noImage]};
}

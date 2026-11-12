import { useEffect,useMemo,useState } from 'react';
import type { DeckStudy } from './deckMath';
import type { ArenaIntakeRecord } from './arenaIntake';
import { getArenaIntakeFile } from './arenaIntakeVault';
import { sha256Blob } from './arenaIntake';
import { arenaDataSets,arenaResultValues,arenaTableFromText,REVIEW_CATEGORIES,
  summarizeArenaReview,validateReviewMapping } from './arenaSessionReview';
import type { ArenaTable,ReviewCategory,ReviewMapping } from './arenaSessionReview';
import { loadArenaReview,saveArenaReview } from './arenaReviewVault';
import type { StoredArenaReview } from './arenaReviewVault';

type Props={record:ArenaIntakeRecord|null;study:DeckStudy;fingerprint:string;dirty:boolean};
const emptyMapping=(dataSet:string):ReviewMapping=>({dataSet,sessionField:'',resultField:'',values:{}});
function exportJson(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
export default function ArenaSessionReview({record,study,fingerprint,dirty}:Props){
  const [raw,setRaw]=useState('');
  const [datasets,setDatasets]=useState<string[]>([]);
  const [dataset,setDataset]=useState('');
  const [table,setTable]=useState<ArenaTable|null>(null);
  const [mapping,setMapping]=useState<ReviewMapping>(emptyMapping(''));
  const [stored,setStored]=useState<StoredArenaReview|null>(null);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let alive=true;
    setRaw('');setDatasets([]);setDataset('');setTable(null);setMapping(emptyMapping(''));
    setStored(null);setError('');setStatus('');
    if(!record)return;
    if(record.format==='zip'){setStatus('ZIP 내부의 JSON·CSV는 압축 해제하지 않으므로 아직 분석 대상이 아닙니다.');return;}
    setBusy(true);
    void Promise.all([getArenaIntakeFile(record.id),loadArenaReview(record.id)])
      .then(async ([file,old])=>{
        if(file.size!==record.size||await sha256Blob(file)!==record.sha256)
          throw new Error('원본 SHA256이 일치하지 않아 세션 분석을 중단했습니다.');
        const text=await file.text();
        const found=arenaDataSets(text,record.format as 'json'|'csv');
        if(!found.length)throw new Error('JSON에 분석 가능한 최상위 배열이 없습니다.');
        if(!alive)return;
        const validOld=old&&old.sourceSha256===record.sha256&&old.studyId===record.studyId&&
          old.studyRevision===record.studyRevision&&old.deckFingerprint===record.deckFingerprint;
        if(old&&!validOld)throw new Error('저장된 필드 매핑의 출처가 현재 파일과 다릅니다.');
        setRaw(text);setDatasets(found);setStored(validOld?old:null);
        setDataset(validOld&&found.includes(old.mapping.dataSet)?old.mapping.dataSet:found[0]);
      }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'수집 파일 분석에 실패했습니다.');})
      .finally(()=>{if(alive)setBusy(false);});
    return()=>{alive=false;};
  },[record?.id,record?.sha256,record?.format]);

  useEffect(()=>{
    if(!record||!raw||!dataset)return;
    try{
      const next=arenaTableFromText(raw,record.format as 'json'|'csv',dataset);
      setTable(next);
      setMapping(stored&&stored.mapping.dataSet===dataset&&validateReviewMapping(next,stored.mapping)?
        stored.mapping:emptyMapping(dataset));
      setError('');
    }catch(e){
      setTable(null);setMapping(emptyMapping(dataset));
      setError(e instanceof Error?e.message:'데이터 행을 분석할 수 없습니다.');
    }
  },[record?.id,record?.format,raw,dataset,stored]);
  const resultValues=useMemo(()=>{
    if(!table||!mapping.resultField)return {values:[] as string[],error:''};
    try{return {values:arenaResultValues(table,mapping.resultField),error:''};}
    catch(e){return {values:[] as string[],error:e instanceof Error?e.message:'결과 값 분석 실패'};}
  },[table,mapping.resultField]);
  const valid=Boolean(table&&!resultValues.error&&validateReviewMapping(table,mapping));
  const totals=useMemo(()=>{
    if(!table||!valid)return null;
    try{return summarizeArenaReview(table,mapping);}
    catch{return null;}
  },[table,mapping,valid]);
  const sameVersion=Boolean(record&&record.studyId===study.id&&
    record.studyRevision===study.revision&&record.deckFingerprint===fingerprint);
  const canSave=Boolean(record&&sameVersion&&!dirty&&!busy&&valid&&Object.keys(mapping.values).length>0);
  const write=async()=>{
    if(!canSave||!record)return;
    setBusy(true);setError('');setStatus('');
    try{
      const next=await saveArenaReview({
        schemaVersion:1,sourceId:record.id,sourceSha256:record.sha256,studyId:record.studyId,
        studyRevision:record.studyRevision,deckFingerprint:record.deckFingerprint,mapping,
      },stored?.revision||0);
      setStored(next);setStatus('사용자 지정 분류표를 별도 브라우저 저장소에 보관했습니다. 엔진 결과가 검증된 것은 아닙니다.');
    }catch(e){setError(e instanceof Error?e.message:'분류표 저장 실패');}
    finally{setBusy(false);}
  };
  const report=()=>{
    if(!record||!totals||!valid)return;
    const output={
      kind:'ygo_card_studio_arena_manual_mapping_report',schemaVersion:1,
      exportedAt:new Date().toISOString(),sourceFile:record.filename,sourceSha256:record.sha256,
      sourceRecordId:record.id,studyId:record.studyId,studyRevision:record.studyRevision,
      deckFingerprint:record.deckFingerprint,
      provenance:'사용자 선택 외부 파일 + 사용자 지정 필드·결과 코드 매핑, 엔진 검증 아님',
      mapping,totals,
    };
    exportJson(new Blob([JSON.stringify(output,null,2)],{type:'application/json;charset=utf-8'}),
      '경기장_세션검수_'+record.sha256.slice(0,12)+'.json');
    setStatus('분류표와 집계만 JSON으로 내보냈습니다. 원본 파일이나 리플레이는 포함되지 않습니다.');
  };
  if(!record)return null;
  return <section className="arena-review" aria-label="경기장 세션 결과 검수">
    <h4>세션 결과 검수 <small>외부 파일 · 사용자 지정 매핑 · 엔진 미검증</small></h4>
    <p>선택한 원본: <strong>{record.filename}</strong> / SHA256 {record.sha256.slice(0,16)}…</p>
    {!sameVersion&&<p className="testlab-warning">현재 연구안의 리비전·지문이 다릅니다. 이 파일의 설정 저장은 차단합니다.</p>}
    {record.format==='zip'?<p>ZIP은 현재 내부 해석을 지원하지 않습니다. CSV 또는 JSON을 별도로 내보내 선택해 주세요.</p>:<>
      <div className="arena-review-grid">
        <label>분석 대상 배열
          <select aria-label="분석 대상 배열" disabled={busy||!datasets.length} value={dataset}
            onChange={e=>setDataset(e.target.value)}>
            {datasets.map(x=><option key={x} value={x}>{x==='@root'?'JSON 최상위 배열':x==='@csv'?'CSV 데이터 행':x}</option>)}
          </select>
        </label>
        <label>세션 ID 필드
          <select aria-label="세션 ID 필드" value={mapping.sessionField}
            disabled={!table||busy} onChange={e=>setMapping(old=>({...old,sessionField:e.target.value}))}>
            <option value="">직접 선택</option>
            {table?.fields.map(x=><option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>결과 코드 필드
          <select aria-label="결과 코드 필드" value={mapping.resultField}
            disabled={!table||busy} onChange={e=>setMapping(old=>({...old,resultField:e.target.value,values:{}}))}>
            <option value="">직접 선택</option>
            {table?.fields.map(x=><option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      </div>
      <p className="testlab-note">데이터 행 {table?.rows.length??'—'}개. 동일 세션 ID가 중복되면 해당 ID의 모든 행을 집계에서 제외합니다. 초기 패·상대·엔진 성공 여부는 확인하지 않습니다.</p>
      {resultValues.error&&<p className="testlab-warning">{resultValues.error}</p>}
      {resultValues.values.length>0&&<div className="arena-review-codes">
        <strong>원본 결과 코드별 의미 직접 지정 (미지정은 미확인)</strong>
        {resultValues.values.map(value=><label key={value}>
          <span title={value}>{value}</span>
          <select aria-label={'결과 코드 '+value} value={Object.prototype.hasOwnProperty.call(mapping.values,value)?mapping.values[value]:''}
            onChange={e=>setMapping(old=>{
              const values={...old.values};
              if(!e.target.value)delete values[value];
              else values[value]=e.target.value as ReviewCategory;
              return {...old,values};
            })}>
            <option value="">분류 안 함</option>
            {REVIEW_CATEGORIES.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </label>)}
      </div>}
      {totals&&<div className="arena-review-stats" aria-label="세션 분류 집계">
        <div><small>원본 행</small><strong>{totals.sourceRows}</strong></div>
        <div><small>승리로 분류</small><strong>{totals.win}</strong></div>
        <div><small>패배로 분류</small><strong>{totals.loss}</strong></div>
        <div><small>무승부로 분류</small><strong>{totals.draw}</strong></div>
        <div><small>교착·중단 분류</small><strong>{totals.interrupted}</strong></div>
        <div><small>미분류·미확인</small><strong>{totals.unmapped+totals.unknown}</strong></div>
        <div><small>세션 ID 중복 행 제외</small><strong>{totals.duplicateRows}</strong></div>
        <div><small>세션 ID 누락 제외</small><strong>{totals.invalidIds}</strong></div>
      </div>}
      <div className="testlab-entry-actions">
        <button className="outline-button" type="button" onClick={()=>void write()} disabled={!canSave}>분류표 저장</button>
        <button className="outline-button" type="button" onClick={report} disabled={!totals}>검수 보고서 JSON 받기</button>
      </div>
    </>}
    {error&&<p role="alert" className="testlab-error">{error}</p>}
    {status&&<p role="status" className="testlab-success">{status}</p>}
    <p className="testlab-note">이 집계는 **파일 속 원본 값에 사용자가 부여한 의미**를 세는 것입니다. EDOPro의 실제 대전 완료, 승률, 덱 초동 성공률을 자동 검증하지 않으며 P5/P6 통계에 합치지 않습니다.</p>
  </section>;
}

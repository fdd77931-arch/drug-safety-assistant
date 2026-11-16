import {BrowserSearch} from './retrieval.mjs';
let loading;
const base=new URL('../',import.meta.url);
function load() {
 if(!loading)loading=Promise.all(['corpus/corpus.json','static/aliases.json'].map(async p=>{const r=await fetch(new URL(p,base));if(!r.ok)throw Error('文献库加载失败，请刷新重试。');return r.json()}))
  .then(([corpus,aliases])=>({corpus,search:new BrowserSearch(corpus.chunks,aliases)}))
  .catch(e=>{loading=null;throw e});
 return loading;
}
export async function health() {
 const {corpus}=await load();
 return {chunks:corpus.chunks.length,documents:corpus.documents,answer_generation:!!window.EVIDENCE_API};
}
export function pdf(path){return new URL(path,base).href}
export async function ask(payload,onEvent,signal) {
 const started=performance.now();
 onEvent({stage:'retrieving',message:'正在浏览器中检索文献与药物别名'});
 const {corpus,search}=await load();
 const retrieval=search.query(payload);
 const endpoint=(window.EVIDENCE_API||'').replace(/\/$/,'');
 if(!endpoint) {
  onEvent({stage:'complete',result:{...retrieval,answer_status:'not_configured',claims:[],model_supplement:null,limitations:['文献检索可用，回答服务尚未连接。'],request_seconds:Number(((performance.now()-started)/1000).toFixed(2))}});
  return;
 }
 onEvent({stage:'generating',message:'已检索到 '+retrieval.results.length+' 个候选片段，正在整理回答并核对引用'});
 let data;
 try {
 const r=await fetch(endpoint+'/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,chunk_ids:retrieval.results.map(h=>h.chunk_id),corpus_version:corpus.version}),signal});
 try{data=await r.json()}catch{throw Error('回答服务未返回有效内容，请稍后重试。')}
 if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'回答服务暂时不可用，请稍后重试。');
 } catch(e) { data={claims:[],model_supplement:null,answer_status:'unavailable',limitations:[e.name==='TimeoutError'?'回答超时；文献检索结果仍可查看。':(e.message||'回答服务暂时不可用。')]}; }
 onEvent({stage:'complete',result:{...retrieval,...data,request_seconds:Number(((performance.now()-started)/1000).toFixed(2))}});
}

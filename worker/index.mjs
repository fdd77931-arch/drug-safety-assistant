import corpus from '../corpus/corpus.json' with {type:'json'};
import {validateRequest,selectEvidence,generate} from './core.mjs';
import {configuredProvider,complete} from './provider.mjs';
import {lookup,abstract} from './literature.mjs';
export {Quota} from './quota.mjs';
export default {async fetch(request,env){
 const origin=request.headers.get('Origin'),headers={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Vary':'Origin','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
 const json=(v,status=200)=>Response.json(v,{status,headers});
 if(origin!==env.ALLOWED_ORIGIN)return json({detail:'请从公开演示页面访问。'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const path=new URL(request.url).pathname;
 if(path==='/literature' && request.method==='GET'){
   const params=new URL(request.url).searchParams;
   const term=(params.get('term')||'').trim();
   if(!term || term.length>200)return json({detail:'请输入 1 至 200 字的文献检索词。'},400);
   try{return json(await lookup(term,params.get('scope')));}catch{}
   return json({detail:'在线文献来源暂时不可用。'},503);
 }
 if(path==='/abstract' && request.method==='GET'){
   const id=new URL(request.url).searchParams.get('pmid');
   if(!/^\d{1,12}$/.test(id||''))return json({detail:'PMID 无效'},400);
   try{const r=await abstract(id);return new Response(r.body,{headers:{...headers,'Content-Type':'application/xml; charset=utf-8'}});}catch{return json({detail:'摘要暂时不可用'},503);}
 }
 const provider=configuredProvider(env);
 if(path==='/health'&&request.method==='GET')return json({configured:!!provider,version:corpus.version});
 if(path!=='/ask'||request.method!=='POST')return json({detail:'接口不存在。'},404);
 if(!provider)return json({detail:'回答服务尚未配置。'},503);
 let p;try{const body=await request.text();if(body.length>10000)throw Error('请求过长。');p=validateRequest(JSON.parse(body),corpus)}catch(e){return json({detail:e instanceof SyntaxError?'请求格式错误。':e.message},422)}
 const evidence=selectEvidence(p,corpus);
 if(!evidence.length&&!p.allow_model_knowledge)return json(await generate(p.question,[],false,()=>{}));
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('CF-Connecting-IP')||'unknown'));
 const ip=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
 let quota;try{quota=await env.QUOTA.get(env.QUOTA.idFromName('global')).fetch('https://quota/consume',{method:'POST',body:JSON.stringify({ip})});}catch{return json({detail:'调用额度服务暂时不可用；请稍后重试。'},503)}
 if(!quota.ok)return json(await quota.json(),429);
 return json(await generate(p.question,evidence,p.allow_model_knowledge,(system,input)=>complete(provider,system,input)));
}};

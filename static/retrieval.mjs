const DEFAULT_DRUGS = {
 semaglutide:['司美格鲁肽','semaglutide','ozempic','wegovy'],
 pembrolizumab:['帕博利珠单抗','pembrolizumab','keytruda'],
 'trastuzumab deruxtecan':['德曲妥珠单抗','trastuzumab deruxtecan','t-dxd','ds-8201','enhertu']
};
const DEFAULT_EVENTS={NAION:['NAION','非动脉炎性前部缺血性视神经病变'],myocarditis:['心肌炎','myocarditis'],ILD:['ILD','间质性肺病','interstitial lung disease','pneumonitis']};
const STOP=new Set('a an and are as at be by for from has have in is it of on or that the this to was were with what which how risk risks safety evidence study studies drug adverse event events'.split(' '));
export function contains(text,alias) {
 text=text.toLowerCase();alias=alias.toLowerCase();
 if (/[\u4e00-\u9fff]/.test(alias)) return text.includes(alias);
 const escaped=alias.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
 return new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])').test(text);
}
export function words(text) {
 return (text.toLowerCase().normalize('NFKC').match(/[a-z0-9]+(?:[-'][a-z0-9]+)*|[\u4e00-\u9fff]{2,}/g)||[]).filter(w=>!STOP.has(w));
}
export function terms(question,aliases) {
 return Object.fromEntries(['drugs','events'].map(type=>[type,Object.keys(aliases[type]).filter(k=>aliases[type][k].some(a=>contains(question,a)))]));
}
export function eligible(h,request,found,aliases) {
 const m=h.metadata,text=h.text,scope=(m.title||'')+' '+text;
 if ((text.match(/10\.\d{4,9}\//g)||[]).length>=3 || (text.match(/\b\d+(?:\.\d+)?\/\d+(?:\.\d+)?\b/g)||[]).length>=8) return false;
 if (/^references?$/i.test(m.section||'')) return false;
 if(request.category && !m.drug_category?.includes(request.category))return false;
 if((request.year_from || request.year_to) && !m.year)return false;
 if(request.year_from && m.year<request.year_from || request.year_to && m.year>request.year_to)return false;
 if(found.drugs.length && !found.drugs.some(d=>aliases.drugs[d].some(a=>contains(scope,a))))return false;
 if(found.events.length && !found.events.some(d=>aliases.events[d].some(a=>contains(text,a))))return false;
 return true;
}
export function excerpt(text,question,aliases={drugs:DEFAULT_DRUGS,events:DEFAULT_EVENTS},limit=3500) {
 if(text.length<=limit)return text;
 const found=terms(question,aliases),needles=[...found.events.flatMap(k=>aliases.events[k]),...found.drugs.flatMap(k=>aliases.drugs[k])];
 const lower=text.toLowerCase();let pos=-1;
 for(const a of needles){pos=lower.indexOf(a.toLowerCase());if(pos>=0)break}
 const start=Math.max(0,Math.min(text.length-limit,pos-500));
 return text.slice(start,start+limit);
}
export class BrowserSearch {
 constructor(chunks,aliases={drugs:DEFAULT_DRUGS,events:DEFAULT_EVENTS}) {
  this.chunks=chunks;this.aliases=aliases;this.df=new Map();
  this.docs=chunks.map(h=>{const ts=words((h.metadata.title||'')+' '+h.text),freq=new Map();for(const t of ts)freq.set(t,(freq.get(t)||0)+1);for(const t of freq.keys())this.df.set(t,(this.df.get(t)||0)+1);return {h,freq,length:ts.length}});
  this.avg=this.docs.reduce((a,d)=>a+d.length,0)/Math.max(1,this.docs.length);
 }
 query(request) {
  const start=performance.now(),found=terms(request.question,this.aliases);
  const expansion=[...found.drugs,...found.events.flatMap(k=>[k,...this.aliases.events[k].filter(a=>!/[\u4e00-\u9fff]/.test(a))])].join(' ');
  const ts=[...new Set(words(request.question+' '+expansion))],ranked=[];
  for(const d of this.docs) {
   if(!eligible(d.h,request,found,this.aliases))continue;
   let score=0;
   for(const t of ts){const tf=d.freq.get(t)||0;if(!tf)continue;const df=this.df.get(t)||0,idf=Math.log(1+(this.docs.length-df+.5)/(df+.5));score+=idf*tf*2.5/(tf+1.5*(.25+.75*d.length/this.avg))}
   if(score>0)ranked.push({...d.h,retrieval_score:score});
  }
  ranked.sort((a,b)=>b.retrieval_score-a.retrieval_score);
  const results=[],seen=new Set();
  for(const h of ranked){const key=h.metadata.doi||h.metadata.document_id;if(seen.has(key))continue;seen.add(key);results.push({...h,evidence_id:'S'+(results.length+1),rerank_window:{text:excerpt(h.text,request.question,this.aliases)},source:{pdf_endpoint:'corpus/pdfs/'+h.metadata.document_id+'.pdf'}});if(results.length>=Math.min(request.k||5,5))break}
  return {question:request.question,terms:found,results,candidate_count:ranked.length,elapsed_seconds:Number(((performance.now()-start)/1000).toFixed(3)),retrieval_method:'browser-bm25-aliases'};
 }
}

export function resolveTopic(question, drugs, aliases, previous) {
 const named = terms(question,aliases).drugs;
 const normalize = text => text.toLowerCase().replace(/[－‐‑–-]/g,'');
 const mentions = value => normalize(question).includes(normalize(value));
 let matched = drugs.filter(d => [d.name,d.generic,...d.aliases].some(mentions));
 if (!named.length && !matched.length) matched = drugs.filter(d =>
   [...d.conditions,...d.targets].some(mentions) ||
   (d.targets.includes('GLP-1R') && /glp[- ]?1/i.test(question)));
 const follow = previous && !matched.length && !named.length &&
   /它|该药|这种|这些|上述|上面|前者|后者|其中|刚才|上次|那|呢|再讲|继续|详细|具体|依据|出处|哪些研究|有何证据|发生率|怎么监测|如何监测/.test(question);
 if (follow) matched = previous.matched;
 const broadClass = /类药物|抑制剂|激动剂|抗体偶联药物/.test(question) && !named.length;
 const names = broadClass ? [] : matched.map(d => d.generic);
 const context = follow ? '上轮问题：'+previous.question.slice(0,250)+'。已讨论：'+previous.summary.slice(0,320)+'。' : '';
 const resolved = question + (names.length ? '（目录匹配：'+names.join('、')+'）' : '');
 return {matched,question,query:resolved + (follow ? ' '+previous.searchTerms : ''),
   searchTerms:[...new Set([...names,...named,...(follow ? previous.searchTerms.split(' ') : []),...terms(question,aliases).events])].join(' '),
   prompt:(context+'本轮问题：'+resolved+'。请简明回答，直接回应本轮问题。').slice(0,2000)};
}

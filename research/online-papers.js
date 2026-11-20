// Europe PMC REST search, resultType=core includes identifiers and abstracts.
// https://europepmc.org/RestfulWebService
import {lookup} from './ncbi.mjs';
export async function searchPapers(term,scope,signal) {
  const url=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  const query='('+term+') AND SRC:MED'+(scope==='pmc'?' AND OPEN_ACCESS:Y AND IN_PMC:Y':'');
  url.search=new URLSearchParams({query,format:'json',resultType:'core',pageSize:'8'});
  async function relayed(){
    const endpoint=new URL('literature',window.EVIDENCE_API.replace(/\/?$/,'/'));
    endpoint.search=new URLSearchParams({term,scope});
    const r=await fetch(endpoint,{signal,credentials:'omit'});
    if(!r.ok)throw Error('中转服务暂时不可用');
    return r.json();
  }
  let data;
  try{data=await lookup(term,scope,AbortSignal.any([signal,AbortSignal.timeout(6000)]));}
  catch{
    const europe=async()=>{const r=await fetch(url,{signal,credentials:'omit'});if(!r.ok)throw Error();return r.json();};
    data=await Promise.any(window.EVIDENCE_API?[relayed(),europe()]:[europe()]);
  }
  const results=data.resultList.result.flatMap(item=>{
    const pmid=String(item.pmid||'');

    const pmcid=/^PMC\d+$/.test(item.pmcid)?item.pmcid:'';
    if(!/^\d+$/.test(pmid) && !pmcid)return [];
    const plain=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    return [{id:pmid?'MED:'+pmid:pmcid,title:plain(item.title),pmid,pmcid,doi:item.doi||'',
      journal:item.journalInfo?.journal?.title||'',date:item.firstPublicationDate||item.pubYear,
      abstract:plain(item.abstractText),types:item.pubTypeList?.pubType||[],
      url:pmid?'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/':'',pmcUrl:pmcid?'https://pmc.ncbi.nlm.nih.gov/articles/'+pmcid+'/':''}];
  });
  return {total:data.hitCount,results};
}

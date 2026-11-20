const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
async function get(endpoint, params) {
  const url = new URL(endpoint+'.fcgi', base);
  url.search = new URLSearchParams({...params, tool:'DrugSafetyResearchAssistant'});
  const response = await fetch(url, {signal: AbortSignal.timeout(8500), cf:{cacheTtl:300,cacheEverything:true}});
  if (!response.ok) throw Error('NCBI temporarily unavailable');
  return response;
}
export async function lookup(term, scope) {
  const db = scope === 'pmc' ? 'pmc' : 'pubmed';
  const query = db === 'pmc' ? '('+term+') AND open access[filter]' : term;
  const search = await (await get('esearch',{db,term:query,retmode:'json',retmax:'8'})).json();
  const {count,idlist} = search.esearchresult;
  if(!idlist.length)return {hitCount:Number(count),resultList:{result:[]}};
  const summary = await (await get('esummary',{db,id:idlist.join(','),retmode:'json'})).json();
  const result = summary.result.uids.map(id=>{
    const item=summary.result[id];
    const ids=Object.fromEntries(item.articleids.map(a=>[a.idtype,a.value]));
    return {pmid:db==='pubmed'?id:ids.pmid,pmcid:db==='pmc'?'PMC'+id:ids.pmc||ids.pmcid,doi:ids.doi,title:item.title,firstPublicationDate:item.pubdate,journalInfo:{journal:{title:item.fulljournalname}},pubTypeList:{pubType:item.pubtype||[]}};
  });
  return {hitCount:Number(count),resultList:{result}};
}
export async function abstract(id) {
  return get('efetch',{db:'pubmed',id,retmode:'xml',rettype:'abstract'});
}

import {searchPapers} from './online-papers.js';
import {readEvidence, removeEvidence, evidencePdf, evidenceMarkdown} from './saved-evidence.js';

const $ = id => document.getElementById(id);
const storageKey = 'drug-intelligence-research-v1';
let saved = {favorites: [], drugs: [], papers: [], onlinePapers: [], recent: [], reports: {}};
try { saved = {...saved, ...JSON.parse(localStorage.getItem(storageKey))}; } catch {}
let catalog;
let current;

function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function link(label, href) {
  const node = el('a', label);
  node.href = href;
  if (href.startsWith('https:')) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}
function button(label, run) {
  const node = el('button', label);
  node.type = 'button';
  node.addEventListener('click', run);
  return node;
}
const trialUrl = id => 'https://clinicaltrials.gov/study/' + id;
const paperUrl = id => 'https://pubmed.ncbi.nlm.nih.gov/' + id + '/';

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
  catch { $('save-status').textContent = '当前浏览器无法保存本地研究记录。'; }
}
function facts(fields) {
  const list = el('dl');
  for (const [label,value] of fields) list.append(el('dt',label),el('dd',value || '来源未提供'));
  return list;
}
function report(drug) {
  const t = drug.trial;
  const a = drug.article;
  return [
    '# ' + drug.name + ' · 研究报告草稿',
    '', '## 研究问题', '请填写研究问题、目标人群和比较方案。',
    '', '## 研究登记', t.title,
    '来源：' + trialUrl(t.id),
    '登记状态：' + t.status + '。记录更新：' + t.updated,
    ...t.planned.map(x => '- 计划主要终点：' + x.measure + '（' + x.timeFrame + '）'),
    '', '## 关联文献', a.title, paperUrl(a.id),
    '', '## 证据与局限', '请核对研究人群、对照、时间点、效应量和区间，并补充可定位原文。登记资料仅反映所选试验。',
    '', '数据取回日期：' + catalog.retrieved,
  ].join('\n');
}
function renderSavedEvidence() {
  const target = $('saved-evidence');
  const entries = readEvidence();
  target.replaceChildren(el('h3','药物安全证据'));
  if (!entries.length) target.append(el('p','在安全知识库收藏检索到的原文片段，可在这里加入报告草稿。'));
  for (const entry of entries) {
    const card = el('article','','record');
    const actions = el('div','','record-actions');
    const add = button('加入当前草稿',()=>{
      if (!current) return;
      const draft = $('draft');
      const passage = evidenceMarkdown(entry);
      if (draft.value.includes(passage)) {
        $('save-status').textContent = '当前草稿已有这条证据。';
      } else {
        draft.value = (draft.value.trimEnd() || report(current)) + '\n\n' + passage + '\n';
        $('save-status').textContent = '证据已加入「'+current.name+'」草稿。保存后可再次打开。';
      }
      draft.focus();
    });
    add.disabled = !current;
    if (current) add.setAttribute('aria-label','加入当前草稿 · '+current.name);
    actions.append(link(entry.sourceUrl ? '查看官方说明书 ↗' : '查看 PDF 原页 ↗', evidencePdf(entry)),add,
      button('移除片段',()=>{
        try { removeEvidence(entry.id); }
        catch { $('save-status').textContent = '当前浏览器无法更新收藏。'; }
      }));
    card.append(el('strong',entry.title),el('p',entry.sourceUrl ? '说明书 · '+entry.section : 'PDF 第 '+(entry.pages?.join('、') || '未标注')+' 页'),actions);
    target.append(card);
  }
}
window.addEventListener('safety-evidence-change',renderSavedEvidence);
renderSavedEvidence();

function renderLibrary() {
  const items = $('library');
  items.replaceChildren();
  for (const [label,ids] of [['收藏文献',saved.favorites],['最近研究',saved.recent]]) {
    const row = el('div', '', 'record');
    row.append(el('h3',label));
    if (!ids.length) row.append(el('p','暂无记录'));
    for (const id of ids) {
      const drug = catalog.drugs.find(d=>d.id===id);
      if (!drug) continue;
      const actions = el('div','','record-actions');
      if (label === '收藏文献') {
        actions.append(link(drug.article.title,paperUrl(drug.article.id)),button('取消收藏',()=>{
          saved.favorites = saved.favorites.filter(x=>x!==id);
          persist();
          renderPapers();
          showDetail(current,false);
        }));
      } else actions.append(button(drug.name,()=>{location.hash='explorer';showDetail(drug);}));
      row.append(actions);
    }
    items.append(row);
  }
  $('reports').replaceChildren();
  for (const id of Object.keys(saved.reports)) {
    const d = catalog.drugs.find(x=>x.id===id);
    if (d) $('reports').append(button('打开已存草稿 · '+d.name,()=>{
      showDetail(d,false);
      $('draft').value = saved.reports[id];
    }));
  }
}
function showDetail(drug, moveFocus = true) {
  if (!drug) return;
  if (current?.id !== drug.id || !$('draft').value) $('draft').value = saved.reports[drug.id] || '';
  current = drug;
  renderSavedEvidence();
  if (moveFocus) {
    saved.recent = [drug.id,...saved.recent.filter(id=>id!==drug.id)].slice(0,10);
    persist();
  }
  const t = drug.trial;
  const a = drug.article;
  const profile = $('profile');
  profile.replaceChildren(el('h3',drug.name+' · '+drug.generic),
    facts([['药物分类',classes[drug.id]],['研究标签',drug.fields.join('、')],['靶点',drug.targets.join('、')],
      ['样例试验人群',drug.conditions.join('、')],['检索别名',drug.aliases.join('、')]]),
    link('查询该药安全性 →','./?q='+encodeURIComponent(drug.name+'有哪些安全风险？')),
    el('p','获批适应证与分地区标签需另行核对。'));
  const label = labels[drug.id];
  if (label) {
    profile.append(el('h3',label.title+' · '+label.jurisdiction+'药品标签'),facts([['作用机制',label.mechanism],['代表性获批适应证',label.indications],['监管状态',label.status],['来源核对日期',label.checked]]),link('核对 DailyMed 完整标签 ↗',label.url));
  }
  profile.append(button(saved.drugs.includes(drug.id)?'取消药物收藏':'收藏药物',()=>{
    saved.drugs=saved.drugs.includes(drug.id)?saved.drugs.filter(id=>id!==drug.id):[...saved.drugs,drug.id];
    persist(); showDetail(drug,false);
  }));
  $('pipeline-data').replaceChildren(facts([['登记研究',t.id],['申办方',t.sponsor],['阶段',t.phases.join(' / ')],['登记状态',t.status],['来源更新',t.updated]]),link('查看登记记录 ↗',trialUrl(t.id)));
  const trial = $('trial-data');
  trial.replaceChildren(el('h3',t.title),facts([['样本量',String(t.enrollment.count ?? '')+' '+(t.enrollment.type||'')],['分组方式',t.design.allocation],['研究模型',t.design.interventionModel],['结果状态',t.reported?'已发布登记结果':'暂无登记结果']]));
  for (const x of t.planned) trial.append(el('p','登记主要终点 · '+x.measure+' · '+x.timeFrame));
  for (const outcome of t.outcomes) {
    const details=el('details');
    details.append(el('summary',outcome.title),el('p',[outcome.timeFrame,outcome.paramType,outcome.unitOfMeasure].filter(Boolean).join(' · ')));
    const groupNames=new Map((outcome.groups||[]).map(x=>[x.id,x.title]));
    for (const group of outcome.classes || []) for (const category of group.categories || []) {
      for (const m of category.measurements||[]) {
        const label=[group.title, category.title, groupNames.get(m.groupId)||m.groupId].filter(Boolean).join(' · ');
        if (m.value != null) details.append(el('p',label+' · '+m.value+(m.lowerLimit!=null && m.upperLimit!=null?' ['+m.lowerLimit+', '+m.upperLimit+']':'')));
      }
    }
    details.append(link('核对完整结果、单位与分析人群 ↗',trialUrl(t.id)+'?tab=results'),el('p',outcome.locator));
    trial.append(details);
  }
  trial.append(link('查看 ClinicalTrials.gov 登记 ↗',trialUrl(t.id)),document.createTextNode('　'),link('原始 API 记录 ↗',t.source));
  const related=el('div','','record-actions');
  related.append(link('检索相关不良事件 →','./workspace.html?q='+encodeURIComponent(drug.name)+'#safety-library'),link('查看试验登记 · '+t.id+' ↗',trialUrl(t.id)),link('关联研究文献 ↗',paperUrl(a.id)),button('生成研究报告草稿',()=>{
    $('draft').value=report(drug);
    location.hash='saved';
    requestAnimationFrame(()=>$('draft').focus());
  }));
  profile.append(related);
  renderLibrary();
  renderPersonal();
  if (moveFocus && !profile.closest('section').hidden) profile.focus();
}
function renderSearch() {
  const query = $('search').value.trim().toLowerCase();
  const matches = catalog.drugs.filter(d=>matchesText([d.name,d.generic,...d.aliases,...d.targets,...d.fields,...d.conditions,d.trial.id,d.article.id,labels[d.id]?.indications],query)
    && includesFilter(d.conditions,'condition') && includesFilter(d.fields,'domain') && includesFilter([classes[d.id]],'class'));
  $('drugs').replaceChildren();
  for (const drug of matches) {
    const card=el('article','','card');
    card.append(button(drug.name,()=>{location.hash='explorer';showDetail(drug);}),el('p',drug.generic),el('p',drug.targets.join('、')+' · '+drug.fields.join('、')));
    $('drugs').append(card);
  }
  $('status').textContent = matches.length+' 个匹配药物 · 官方来源快照 · '+catalog.retrieved;
  $('profile').hidden=!matches.length;
  if(matches.length && !matches.includes(current)) showDetail(matches[0],false);
  if (!matches.length) $('drugs').append(el('p','首版目录没有匹配药物。可以用其他名称或登记号重试。'));
}
$('save-report').addEventListener('click',()=>{
  if (!current || !$('draft').value.trim()) return;
  saved.reports[current.id]=$('draft').value;
  $('save-status').textContent='已保存草稿。';
  persist();
  renderLibrary();
});
$('download').addEventListener('click',()=>{
  if (!current || !$('draft').value.trim()) return;
  const url=URL.createObjectURL(new Blob([$('draft').value],{type:'text/markdown;charset=utf-8'}));
  const a=link('',url);
  a.download=current.id+'-research.md';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
let classes={};
let labels={}, papers=[];
const matchesText=(values,query)=>values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
const includesFilter=(values,id)=>!$(id).value || values.includes($(id).value);
function filter(id,title,values,parent,handler){
  const label=el('label',title), select=el('select');
  select.id=id; select.add(new Option('全部',''));
  for(const value of new Set(values)) select.add(new Option(value,value));
  select.onchange=handler; label.append(select); $(parent).append(label);
}
function renderTrials(){
  const list=$('trial-list');
  const matches=catalog.drugs.filter(d=>matchesText([d.name,d.generic,d.trial.title,d.trial.id,...d.conditions],$('trial-search').value)
    &&includesFilter(d.trial.phases,'phase')&&includesFilter([d.trial.status],'trial-status')&&includesFilter(d.conditions,'disease'));
  list.replaceChildren(el('p',matches.length+' 项匹配试验'));
  for(const d of matches){
    const card=el('article','','record');
    card.append(button(d.name+' · '+d.trial.id,()=>{showDetail(d,false);$('trial-data').scrollIntoView();}),el('p',d.trial.title),el('small',[...d.trial.phases,d.trial.status,...d.conditions].join(' · ')));
    list.append(card);
  }
  $('trial-data').hidden=!matches.length;
  if(matches.length&&!matches.includes(current)) showDetail(matches[0],false);
}
function renderPapers(){
  const matches=papers.filter(p=>matchesText([p.title,p.name,p.id,p.doi,p.journal],$('paper-search').value)&&includesFilter(p.types,'paper-type'));
  $('paper-list').replaceChildren(el('p',matches.length+' 项匹配资料'));
  for(const p of matches){
    const card=el('article','','record');
    const list=p.drug?saved.favorites:saved.papers,id=p.drug||p.id;
    card.append(el('small',p.types.join(' · ')),el('h3',p.title),el('p',[p.journal,p.date,p.doi].filter(Boolean).join(' · ')),link(p.origin+' ↗',p.url),document.createTextNode('　'),button(list.includes(id)?'取消收藏':'收藏文献',()=>{
      if(list.includes(id))list.splice(list.indexOf(id),1);else list.push(id);
      persist();renderPapers();renderLibrary();renderPersonal();
    }));
    $('paper-list').append(card);
  }
}
let onlineResults=[];
let onlineRequest;
function onlineCard(p){
  const card=el('article','','record'),actions=el('div','','record-actions');
  card.append(el('small',[p.journal,p.date,p.doi?'DOI '+p.doi:'',...p.types].filter(Boolean).join(' · ')),el('h3',p.title));
  if(p.pmid)actions.append(link('PubMed · '+p.pmid+' ↗',p.url));
  if(p.pmcUrl)actions.append(link('PMC · '+p.pmcid+' ↗',p.pmcUrl));
  const abstractBox=el('details');
  const body=el('p',p.abstract||'正在读取 PubMed 摘要…');
  abstractBox.append(el('summary','查看摘要'),body);if(p.abstract||p.pmid)card.append(abstractBox);
  abstractBox.addEventListener('toggle',async()=>{
    if(!abstractBox.open || p.abstract || abstractBox.dataset.loading)return;
    abstractBox.dataset.loading='1';
    try{
      const response=await fetch(window.EVIDENCE_API+'/abstract?pmid='+encodeURIComponent(p.pmid),{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error();
      const xml=new DOMParser().parseFromString(await response.text(),'application/xml');
      const parts=[...xml.querySelectorAll('Article > Abstract > AbstractText')].map(x=>(x.getAttribute('Label')?x.getAttribute('Label')+' · ':'')+x.textContent.trim());
      body.textContent=parts.join('\n') || '该 PubMed 记录未提供摘要。';
    }catch{body.textContent='摘要暂时无法载入，可打开下方 PubMed 原文。';}
    finally{delete abstractBox.dataset.loading;}
  });
  const stored=saved.onlinePapers.some(record=>record.id===p.id);
  actions.append(button(stored?'移除在线文献':'收藏在线文献',()=>{
    saved.onlinePapers=stored?saved.onlinePapers.filter(record=>record.id!==p.id):[...saved.onlinePapers,p];
    persist();renderOnline();renderPersonal();
  }));
  card.append(actions);return card;
}
function renderOnline(){$('online-results').replaceChildren(...onlineResults.map(onlineCard));}
$('online-form').onsubmit=async event=>{
  event.preventDefault();
  let term=$('online-query').value.trim();
  if(!term)return;
  for(const d of catalog?.drugs||[])term=term.replaceAll(d.name,d.generic);
  onlineRequest?.abort();
  const controller=new AbortController();onlineRequest=controller;
  const timeout=setTimeout(()=>controller.abort(),20000);
  onlineResults=[];renderOnline();$('online-status').textContent='正在查询文献数据库…';
  try{
    const found=await searchPapers(term,$('online-scope').value,controller.signal);
    if(onlineRequest!==controller)return;
    onlineResults=found.results;renderOnline();
    $('online-status').textContent='共 '+found.total+' 项匹配文献，显示 '+onlineResults.length+' 项。';
  }catch{
    if(onlineRequest!==controller)return;
    $('online-status').replaceChildren(document.createTextNode('在线服务暂时无法连接。可继续检索下方本地资料，或'),link('前往 Europe PMC 检索 ↗','https://europepmc.org/search?query='+encodeURIComponent('('+term+') AND SRC:MED'+($('online-scope').value==='pmc'?' AND OPEN_ACCESS:Y AND IN_PMC:Y':''))));
  }finally{clearTimeout(timeout);}
};
function readList(key){try{const data=JSON.parse(localStorage.getItem(key));return Array.isArray(data)?data:[];}catch{return [];}}
function renderPersonal(){
  const panel=$('personal');panel.replaceChildren();
  $('draft-label').textContent=current?'编辑草稿 · '+current.name:'编辑当前草稿';
  for(const [title,items] of [
    ['在线收藏文献',saved.onlinePapers.map(onlineCard)],
    ['收藏药物',saved.drugs.map(id=>catalog.drugs.find(d=>d.id===id)).filter(Boolean).map(d=>button(d.name,()=>{location.hash='explorer';showDetail(d);}))],
    ['收藏资料',papers.filter(p=>saved.papers.includes(p.id)).map(p=>{const row=el('p');row.append(link(p.title,p.url),document.createTextNode('　'),button('移除',()=>{saved.papers=saved.papers.filter(id=>id!==p.id);persist();renderPersonal();renderPapers();}));return row;})],
    ['最近提问',readList('drug-safety-questions-v1').map(q=>{const row=el('p');row.append(link(q,'./?q='+encodeURIComponent(q)));return row;})],
    ['收藏回答',readList('drug-safety-answers-v1').map(a=>{const detail=el('details');detail.append(el('summary',a.question),el('p',a.answer));for(const s of a.sources||[])if(/^https?:|^\.\//.test(s.url))detail.append(link(s.title,s.url),document.createTextNode('　'));return detail;})]
  ]){const card=el('div','','record');card.append(el('h3',title),...(items.length?items:[el('p','暂无记录')]));panel.append(card);}
}
function route(){
  const id=location.hash.slice(1)||'explorer', sections=[...document.querySelectorAll('main>section')];
  const active=sections.find(s=>s.id===id)||$('explorer');
  for(const s of sections)s.hidden=s!==active;
  document.title=active.querySelector('h1,h2').textContent+' · 药物安全助手';
  if(catalog && $('phase')){
    if(active.id==='trials')renderTrials();
    if(active.id==='explorer')renderSearch();
    if(active.id==='saved'){renderLibrary();renderPersonal();}
  }
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);route();
async function initialize(){
  const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error();return r.json();};
  const [areas,credits,us]=await Promise.all([get('./research/areas.json'),get('./corpus/ATTRIBUTIONS.json'),get('./research/us-labels.json').catch(()=>({}))]);labels=us;
  const ds=catalog.drugs;
  classes=Object.fromEntries(areas.flatMap(a=>(a.drugIds||[]).map(id=>[id,a.category])));
  filter('class','药物分类',areas.map(a=>a.category),'drug-filters',renderSearch);
  const area=new URLSearchParams(location.search).get('area');
  if(areas.some(a=>a.category===area))$('class').value=area;
  filter('domain','治疗领域',ds.flatMap(d=>d.fields),'drug-filters',renderSearch);
  filter('condition','研究适应证',ds.flatMap(d=>d.conditions),'drug-filters',renderSearch);
  filter('phase','研究阶段',ds.flatMap(d=>d.trial.phases),'trial-filters',renderTrials);
  filter('trial-status','登记状态',ds.map(d=>d.trial.status),'trial-filters',renderTrials);
  filter('disease','研究疾病',ds.flatMap(d=>d.conditions),'trial-filters',renderTrials);
  papers=ds.map(d=>({...d.article,drug:d.id,name:d.name+' '+d.generic,url:paperUrl(d.article.id),origin:'PubMed',types:['随机对照试验']}));
  for(const [id,c] of Object.entries(credits.documents)){
    if(!c.source_url||!c.source_url.includes('pmc.ncbi.nlm.nih.gov'))continue;
    const type=/guideline|consensus/i.test(c.title)?'指南与共识':/review|meta-analysis/i.test(c.title)?'综述与荟萃分析':'研究文献';
    papers.push({...c,id,url:c.source_url,types:[type],origin:'PMC 全文'});
  }
  for(const type of new Set(papers.flatMap(p=>p.types)))$('paper-type').add(new Option(type,type));
  $('paper-list').before(link('检索 PubMed 指南 ↗','https://pubmed.ncbi.nlm.nih.gov/?term=practice+guideline%5Bpt%5D'));
  $('trial-search').oninput=renderTrials;$('paper-search').oninput=renderPapers;$('paper-type').onchange=renderPapers;
  $('export-all').onclick=()=>{const data={...saved,evidence:readEvidence(),questions:readList('drug-safety-questions-v1'),answers:readList('drug-safety-answers-v1'),documents:papers.filter(p=>saved.papers.includes(p.id)||saved.favorites.includes(p.drug)),drugRecords:ds.filter(d=>saved.drugs.includes(d.id))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=link('',url);a.download='drug-safety-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const drugId=new URLSearchParams(location.search).get('drug');
  const linkedDrug=ds.find(d=>d.id===drugId);
  if(linkedDrug)$('search').value=linkedDrug.name;
  renderSearch();renderPapers();route();
}

try {
  const response=await fetch(new URL('./catalog.json',import.meta.url));
  if (!response.ok) throw new Error('catalog unavailable');
  catalog=await response.json();
  $('search').addEventListener('input',renderSearch);
  await initialize();
} catch {
  $('status').textContent='研究目录暂时无法加载。刷新后重试，或打开药物安全问答。';
}

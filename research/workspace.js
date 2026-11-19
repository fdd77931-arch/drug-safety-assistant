const $ = id => document.getElementById(id);
const storageKey = 'drug-intelligence-research-v1';
let saved = {favorites: [], recent: [], reports: {}};
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
          renderLibrary();
          showDetail(current,false);
        }));
      } else actions.append(button(drug.name,()=>showDetail(drug)));
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
  if (moveFocus) {
    saved.recent = [drug.id,...saved.recent.filter(id=>id!==drug.id)].slice(0,10);
    persist();
  }
  const t = drug.trial;
  const a = drug.article;
  const profile = $('profile');
  profile.replaceChildren(el('h3',drug.name+' · '+drug.generic),
    facts([['研究标签',drug.fields.join('、')],['靶点',drug.targets.join('、')],
      ['样例试验人群',drug.conditions.join('、')],['检索别名',drug.aliases.join('、')]]),
    link('打开药物安全问答 ↗','./safety.html'),
    el('p','获批适应证与分地区标签需另行核对。'));
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
  trial.append(link('原始 API 记录 ↗',t.source));
  $('papers').replaceChildren(el('div',a.followup?'关联随访文献':'关联研究文献'),link(a.title,paperUrl(a.id)),el('p',[a.journal,a.date,'PMID '+a.id,a.doi].filter(Boolean).join(' · ')),
    button(saved.favorites.includes(drug.id)?'已收藏':'收藏文献',()=>{
      saved.favorites=[...new Set([...saved.favorites,drug.id])];
      persist();
      renderLibrary();
      showDetail(drug,false);
    }),
    button('生成研究报告草稿',()=>{
      $('draft').value=report(drug);
      $('draft').focus();
    }));
  renderLibrary();
  if (moveFocus) profile.focus();
}
function renderSearch() {
  const query = $('search').value.trim().toLowerCase();
  const matches = catalog.drugs.filter(d=>[d.name,d.generic,...d.aliases,...d.targets,...d.fields,...d.conditions,d.trial.id,d.article.id].some(x=>x.toLowerCase().includes(query)));
  $('drugs').replaceChildren();
  for (const drug of matches) {
    const card=el('article','','card');
    card.append(button(drug.name,()=>showDetail(drug)),el('p',drug.generic),el('p',drug.targets.join('、')+' · '+drug.fields.join('、')));
    $('drugs').append(card);
  }
  $('status').textContent = matches.length+' 个匹配药物 · 官方来源快照 · '+catalog.retrieved;
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
try {
  const response=await fetch(new URL('./catalog.json',import.meta.url));
  if (!response.ok) throw new Error('catalog unavailable');
  catalog=await response.json();
  $('search').addEventListener('input',renderSearch);
  renderSearch();
  showDetail(catalog.drugs[0],false);
} catch {
  $('status').textContent='研究目录暂时无法加载。刷新后重试，或打开药物安全问答。';
}

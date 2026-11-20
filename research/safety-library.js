import {readEvidence, saveEvidence} from './saved-evidence.js';
import {BrowserSearch} from '../static/retrieval.mjs';

const form = document.querySelector('#evidence-form');
const query = document.querySelector('#evidence-query');
const area = document.querySelector('#evidence-area');
const output = document.querySelector('#evidence-results');
const status = document.querySelector('#evidence-status');
const typeControl=document.querySelector('#evidence-type');
const kinds={
  label:['药品说明书','核对适用地区、剂型、章节与最新修订日期。'],
  review:['综述','汇总范围取决于作者纳入的研究，需核对原始研究与人群。'],
  case:['病例报告','单例或少数病例可提示潜在线索，需结合其他证据判断关联。'],
  signal:['药物警戒研究','报告信号不能用于推算发生率或单独确定因果关系。'],
  trial:['临床试验','核对随机分配、对照组、纳排标准和终点定义。'],
  observational:['观察性研究','核对暴露与结局定义、混杂因素及调整方式。'],
  study:['其他研究文献','请核对研究设计、暴露定义、比较组与随访时间。']
};
function kind(m){
  if(m.source_type==='label')return 'label';
  if(/systematic review|meta.analysis|narrative review|a review/i.test(m.title))return 'review';
  if(/case report|case series|a case of/i.test(m.title))return 'case';
  if(/pharmacovigilance|disproportionality|adverse event reporting|FAERS/i.test(m.title))return 'signal';
  if(/clinical trial|phase [123iv]+ (?:trial|study)|randomi[sz]ed.{0,60}(?:trial|study)/i.test(m.title))return 'trial';
  if(/observational|cohort|case.control|cross.sectional|retrospective (?:analysis|study)/i.test(m.title))return 'observational';
  return 'study';
}
const browseLimit = 8;
let loading;
let shown = browseLimit;

function element(tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function anchor(text, url) {
  const node = element('a', text);
  node.href = url;
  if (url.startsWith('https:') || url.startsWith('./corpus/')) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('library unavailable');
  return response.json();
}
function loadLibrary() {
  if (!loading) {
    loading = Promise.all([
      loadJson('./corpus/corpus.json'),
      loadJson('./corpus/ATTRIBUTIONS.json'),
      loadJson('./static/aliases.json'),
    ]).then(([corpus, credits, aliases]) => {
      const documents = new Map();
      for (const chunk of corpus.chunks) {
        if (!documents.has(chunk.metadata.document_id)) documents.set(chunk.metadata.document_id, chunk);
      }
      return {corpus, credits: credits.documents, documents: [...documents.values()], aliases, searches:new Map()};
    }).catch(error => { loading = undefined; throw error; });
  }
  return loading;
}

function sourceCard(chunk, credits, question, corpusVersion) {
  const metadata = chunk.metadata;
  const credit = credits[metadata.document_id];
  const card = element('article', '', 'record');
  const pdf = './corpus/pdfs/' + encodeURIComponent(metadata.document_id) + '.pdf';
  const firstPage = metadata.pages?.[0];
  const [type,caveat]=kinds[kind(metadata)];
  card.append(element('small',type),element('h3',metadata.title),element('p',caveat),
    element('p', [metadata.year, ...(metadata.drug_category || []), credit?.license, metadata.doi].filter(Boolean).join(' · ')));
  if (credit?.authors?.length) card.append(element('p',credit.authors.join('、')));
  const links = element('div', '', 'links');
  if (metadata.source_url) links.append(anchor('查看官方说明书 ↗',metadata.source_url));
  else links.append(anchor(question && firstPage ? '打开 PDF 第 '+firstPage+' 页 ↗' : '打开原文 PDF ↗',pdf+(question && firstPage ? '#page='+firstPage : '')));
  if (metadata.doi) links.append(anchor('出版来源 ↗','https://doi.org/'+metadata.doi));
  if (question) {
    const saved = readEvidence().some(item => item.id === corpusVersion + ':' + chunk.chunk_id);
    const add = element('button', saved ? '已收藏片段' : '收藏片段');
    add.type = 'button';
    add.dataset.evidenceId = corpusVersion + ':' + chunk.chunk_id;
    add.disabled = saved;
    const feedback = element('span','');
    feedback.setAttribute('role','status');
    add.addEventListener('click', () => {
      try {
        saveEvidence(chunk, corpusVersion);
        add.textContent = '已收藏片段';
        add.disabled = true;
        feedback.textContent = '可在「我的研究」找到。';
      } catch (error) {
        feedback.textContent = error.message || '当前浏览器无法保存。';
      }
    });
    links.append(anchor('继续问这个问题','./?q='+encodeURIComponent(question)),add,feedback);
  }
  card.append(links);
  if (question) {
    const detail = element('details');
    detail.append(element('summary', metadata.source_type === 'label' ? '查看说明书摘录 · '+metadata.section : '查看命中文段 · PDF 第 '+metadata.pages.join('、')+' 页'),
      element('p',chunk.rerank_window?.text || chunk.text,'source-excerpt'));
    if (metadata.quality_flags?.length) detail.append(element('p','此片段有自动抽取质量标记，请以 PDF 原文为准。'));
    card.append(detail);
  }
  return card;
}

async function render() {
  const question = query.value.trim();
  const category = area.value;
  status.textContent = '正在读取安全知识库…';
  output.replaceChildren();
  try {
    const {documents,searches,aliases,credits,corpus} = await loadLibrary();
    if (category !== area.value || question !== query.value.trim()) return;
    const type=typeControl.value;
    const filtered=documents.filter(({metadata})=>(!category || metadata.drug_category?.includes(category))&&(!type||kind(metadata)===type));
    const normalizedDoi = question.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase();
    const exact = question ? filtered.filter(({metadata})=>metadata.doi?.toLowerCase()===normalizedDoi) : [];
    if(question&&!exact.length&&!searches.has(type))searches.set(type,new BrowserSearch(corpus.chunks.filter(c=>!type||kind(c.metadata)===type),aliases));
    const found = !question ? filtered.slice(0,shown) : exact.length ? exact : searches.get(type).query({question,category,k:5}).results;
    status.textContent = question
      ? found.length ? '返回 '+found.length+' 份匹配文献 · 语料版本 '+corpus.version : '没有匹配证据。可试用英文药名、事件简称或 DOI。'
      : '当前领域 '+filtered.length+' 份 · 已显示 '+found.length+' 份 · 全库 '+corpus.chunks.length+' 个片段';
    for (const item of found) output.append(sourceCard(item,credits,question,corpus.version));
    if (!question && shown<filtered.length) {
      const more = element('button','查看更多资料');
      more.type='button';
      more.onclick = ()=>{shown+=browseLimit;render();};
      output.append(more);
    }
  } catch {
    status.textContent='暂时无法加载文献。请点击「检索证据」重试。';
  }
}

form.addEventListener('submit',event=>{event.preventDefault();shown=browseLimit;render();});
area.addEventListener('change',()=>{shown=browseLimit;render();});
document.querySelector('#evidence-examples').addEventListener('click',event=>{
  const example=event.target.closest('[data-evidence]');
  if (!example) return;
  query.value=example.dataset.evidence;
  area.value='';
  form.requestSubmit();
});
typeControl.onchange=()=>{shown=browseLimit;render();};
const initialQuery=new URLSearchParams(location.search).get('q');
if(initialQuery)query.value=initialQuery.slice(0,200);
function enter(){if(location.hash==='#safety-library')render();}
window.addEventListener('hashchange',enter);enter();

window.addEventListener('safety-evidence-change', () => {
  const ids = new Set(readEvidence().map(item => item.id));
  for (const control of output.querySelectorAll('[data-evidence-id]')) {
    control.disabled = ids.has(control.dataset.evidenceId);
    control.textContent = control.disabled ? '已收藏片段' : '收藏片段';
  }
});

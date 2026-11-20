import {readEvidence, saveEvidence} from './saved-evidence.js';
import {BrowserSearch} from '../static/retrieval.mjs';

const form = document.querySelector('#evidence-form');
const query = document.querySelector('#evidence-query');
const area = document.querySelector('#evidence-area');
const output = document.querySelector('#evidence-results');
const status = document.querySelector('#evidence-status');
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
      return {corpus, credits: credits.documents, documents: [...documents.values()], search: new BrowserSearch(corpus.chunks, aliases)};
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
  card.append(element('h3',metadata.title),
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
    const {documents,search,credits,corpus} = await loadLibrary();
    if (category !== area.value || question !== query.value.trim()) return;
    const filtered = documents.filter(({metadata})=>!category || metadata.drug_category?.includes(category));
    const normalizedDoi = question.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase();
    const exact = question ? filtered.filter(({metadata})=>metadata.doi?.toLowerCase()===normalizedDoi) : [];
    const found = !question ? filtered.slice(0,shown) : exact.length ? exact : search.query({question,category,k:5}).results;
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
render();

window.addEventListener('safety-evidence-change', () => {
  const ids = new Set(readEvidence().map(item => item.id));
  for (const control of output.querySelectorAll('[data-evidence-id]')) {
    control.disabled = ids.has(control.dataset.evidenceId);
    control.textContent = control.disabled ? '已收藏片段' : '收藏片段';
  }
});

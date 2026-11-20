const $ = s => document.querySelector(s);
let category = '', busy = false, turnCount = 0;
const pagesClient = window.PAGES_MODE ? import('./static-client.mjs') : null;
const api = () => window.PAGES_MODE ? (window.EVIDENCE_API || '') : (localStorage.getItem('evidence-api') || window.EVIDENCE_API || '');
const url = path => api().replace(/\/$/, '') + path;
function node(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
async function health() {
  try {
    const h = pagesClient ? await (await pagesClient).health() : await (async () => {const r = await fetch(url('/health'), {signal: AbortSignal.timeout(15000)}); if(!r.ok) throw Error(); return r.json();})();
    $('#status').textContent = h.answer_generation ? '知识库可用 · 回答接口已连接' : '知识库可用 · 回答接口未确认';
  } catch { $('#status').textContent = '服务连接中 · 请稍后重试'; }
}
$('.examples').querySelectorAll('button').forEach(b => b.onclick = () => {
  if (busy) return;
  $('#question').value = b.dataset.question;
  $('#form').requestSubmit();
});
document.querySelectorAll('.category').forEach(b => b.onclick = () => {
  if (busy) return;
  document.querySelectorAll('.category').forEach(x => {
    x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false');
  });
  b.classList.add('selected'); b.setAttribute('aria-pressed', 'true');
  category = b.dataset.category; $('#scope').textContent = category || '全部领域';
});
$('#new-chat').onclick = () => {
  if (busy) return;
  $('#conversation').replaceChildren(); $('#welcome').hidden = false;
  $('#question').value = ''; $('#question').focus();
  $('#message').textContent = '回答供研究参考，不替代专业诊疗建议。';
  window.scrollTo({top: 0});
};
$('#filter-toggle').onclick = () => {
  $('#filters').hidden = !$('#filters').hidden;
  $('#filter-toggle').setAttribute('aria-expanded', String(!$('#filters').hidden));
};
$('#connection-options').hidden = window.PAGES_MODE || !['localhost', '127.0.0.1', ''].includes(location.hostname);
$('#settings').onclick = () => { $('#api-url').value = api(); $('#dialog').showModal(); };
$('#dialog').addEventListener('close', () => {
  if ($('#dialog').returnValue !== 'save') return;
  let value = $('#api-url').value.trim();
  if (value) {
    try {
      const u = new URL(value);
      if (!['https:', 'http:'].includes(u.protocol)) throw Error();
      value = u.origin + u.pathname.replace(/\/$/, '');
    } catch { $('#message').textContent = '请输入有效的 HTTP 或 HTTPS 地址。'; return; }
  }
  localStorage.setItem('evidence-api', value); health();
});
$('#question').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault(); if (!busy) $('#form').requestSubmit();
  }
});
function heading(label) {
  const h = node('div', undefined, 'assistant-heading');
  h.append(node('span', '药物安全助手'), node('small', label));
  return h;
}
function createTurn(question) {
  const turn = node('article', undefined, 'turn'); turn.id = 'turn-' + (++turnCount);
  const row = node('div', undefined, 'question-row');
  row.append(node('p', question, 'user-question')); turn.append(row, heading('正在处理'));
  const panel = node('div', undefined, 'progress-panel');
  panel.setAttribute('role', 'status'); panel.setAttribute('aria-label', '回答处理进度');
  const title = node('div', undefined, 'progress-title');
  title.append(node('span', undefined, 'pulse'), node('span', '正在理解你的问题'), node('span', '0s', 'elapsed'));
  const steps = node('div', undefined, 'progress-steps');
  for (const name of ['检索专业文献', '组织与核对', '形成回答']) {
    const s = node('span'); s.append(node('i', undefined, 'step-dot'), document.createTextNode(name)); steps.append(s);
  }
  panel.append(title, steps, node('p', '正在连接问答服务…', 'progress-detail'), node('div', undefined, 'skeleton'), node('div', undefined, 'skeleton short'));
  turn.append(panel); $('#conversation').append(turn); $('#welcome').hidden = true;
  turn.scrollIntoView({block: 'start', behavior: 'auto'});
  return turn;
}
function updateProgress(turn, event) {
  const panel = turn.querySelector('.progress-panel'); if (!panel) return;
  const phase = event.stage === 'generating' ? 1 : 0;
  panel.querySelector('.progress-title span:nth-child(2)').textContent = phase ? '正在整理证据与答案' : '正在检索专业知识';
  panel.querySelector('.progress-detail').textContent = event.message;
  [...panel.querySelector('.progress-steps').children].forEach((s, i) => {
    s.className = i < phase ? 'done' : i === phase ? 'active' : '';
  });
}
function show(data, turn) {
  turn.querySelector('.progress-panel')?.remove();
  turn.querySelector('.assistant-heading small').textContent = data.cached ? '已复用回答' : '回答完成';
  const content = node('div', undefined, 'answer-content');
  const claims = data.claims || [], results = data.results || [];
  const cited = new Set(claims.flatMap(c => c.citations));
  const sources = node('details', undefined, 'sources');
  for (const claim of claims) {
    const p = node('p', claim.text, 'claim');
    for (const id of claim.citations) {
      const b = node('button', id, 'cite');
      b.setAttribute('aria-label', '查看参考文献 ' + id);
      b.onclick = () => {
        sources.open = true;
        document.getElementById(turn.id + '-' + id)?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center'});
      };
      p.append(b);
    }
    content.append(p);
  }
  if (data.model_supplement?.text) {
    for (const paragraph of data.model_supplement.text.split(/\n+/).filter(x => x.trim())) {
      const p = node('p', undefined, 'knowledge-inline');
      const tag = node('span', '知识补充', 'knowledge-tag');
      tag.title = '来自 DeepSeek 的一般知识，未经当前文献库核验，非实时联网结果。';
      p.append(tag, document.createTextNode(paragraph));
      content.append(p);
    }
  }
  if (!claims.length && !data.model_supplement?.text) {
    content.append(node('p', data.answer_status === 'not_configured' ? '回答服务暂未配置，可先查看检索文献。' : '当前证据不足以形成可靠回答，请尝试补充药物名称或具体不良事件。', 'claim'));
  }
  const notes = [...(data.limitations || [])];
  if (data.model_supplement?.text) notes.push('“知识补充”来自模型一般知识，未经当前文献库核验。');
  if (notes.length) content.append(node('p', [...new Set(notes)].join(' '), 'answer-caveat'));
  if (results.length) {
    sources.append(node('summary', cited.size ? '参考文献 · ' + cited.size + ' 个引用片段' : '候选文献 · ' + results.length + ' 个片段（未被回答引用）'));
    const list = node('div', undefined, 'source-list');
    if (!cited.size) list.append(node('p', '以下候选片段未支持本次回答，不作为知识补充的依据。', 'source-notice'));
    for (const h of [...results].sort((a, b) => Number(cited.has(b.evidence_id)) - Number(cited.has(a.evidence_id)))) {
      const m = h.metadata, card = node('article', undefined, 'source-card');
      card.id = turn.id + '-' + h.evidence_id;
      const title = node('div', undefined, 'source-title');
      title.append(node('span', h.evidence_id, 'badge'), document.createTextNode(m.title || '文献题名待核查'));
      card.append(title, node('div', (m.source_type === 'label' ? '美国药品说明书 · ' + m.section : (m.year ?? '年份待核查') + ' · PDF 第 ' + m.pages.join('、') + ' 页') + (cited.has(h.evidence_id) ? ' · 已引用' : ' · 候选片段'), 'source-meta'));
      if (m.doi) card.append(node('div', 'DOI ' + m.doi, 'source-meta'));
      card.append(node('div', h.rerank_window.text, 'quote'));
      if (m.quality_flags?.length) card.append(node('p', '解析存在待审核标记，关键数值请核查原文。', 'source-notice'));
      const link = node('a', m.source_url ? '查看官方说明书 ↗' : '查看原始 PDF ↗', 'pdf-link');
      link.href = m.source_url || (window.PAGES_MODE ? new URL(h.source.pdf_endpoint.split('#')[0], document.baseURI).href : url(h.source.pdf_endpoint.split('#')[0])) + '#page=' + m.pages[0];
      link.target = '_blank'; link.rel = 'noopener';
      card.append(link); list.append(card);
    }
    sources.append(list); content.append(sources);
  }
  turn.append(content);
}
async function consumeStream(response, onEvent) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    onEvent({stage: 'complete', result: await response.json()}); return;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', complete = false;
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
      let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        const line = frame.split('\n').find(l => l.startsWith('data: '));
        if (line) {
          const event = JSON.parse(line.slice(6));
          if (event.stage === 'error') throw Error(event.message);
          onEvent(event); if (event.stage === 'complete') complete = true;
        }
      }
      if (done) break;
    }
    if (!complete) throw Error('连接中断，回答尚未完成，请重试。');
  } finally { reader.releaseLock(); }
}
$('#form').onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  const question = $('#question').value.trim(); if (!question) return;
  const payload = {question, k: 5, allow_model_knowledge: $('#allow-model').checked};
  if (category) payload.category = category;
  for (const [id, key] of [['year-from', 'year_from'], ['year-to', 'year_to']]) if ($('#' + id).value) payload[key] = Number($('#' + id).value);
  if (payload.year_from && payload.year_to && payload.year_from > payload.year_to) {
    $('#message').textContent = '起始年份不能晚于结束年份。'; $('#message').classList.add('error'); return;
  }
  busy = true; $('#message').classList.remove('error'); $('#form').setAttribute('aria-busy', 'true');
  $('#submit').disabled = true; $('#new-chat').disabled = true;
  $('#submit').textContent = '回答中…'; $('#question').value = '';
  const turn = createTurn(question), started = Date.now();
  const timer = setInterval(() => {
    const elapsed = turn.querySelector('.elapsed');
    const seconds = Math.floor((Date.now() - started) / 1000);
    if (elapsed) elapsed.textContent = seconds + 's';
    if (seconds > 30) $('#message').textContent = '仍在处理，专业文献检索与回答可能需要约一分钟。';
  }, 1000);
  try {
    if (pagesClient) {
      await (await pagesClient).ask(payload, event => {if(event.stage === 'complete') show(event.result, turn); else updateProgress(turn,event);}, AbortSignal.timeout(240000));
    } else {
    const r = await fetch(url('/ask?stream=true'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: AbortSignal.timeout(240000)});
    if (!r.ok) {
      let detail; try { detail = (await r.json()).detail; } catch {}
      throw Error(r.status === 429 ? (typeof detail === 'string' ? detail : '当前提问较多，请稍等片刻再试。') : r.status === 422 ? '请检查问题和年份条件。' : '服务暂时不可用，请稍后重试。');
    }
    await consumeStream(r, event => {
      if (event.stage === 'complete') show(event.result, turn); else updateProgress(turn, event);
    });
    }
    $('#message').textContent = '回答供研究参考，可点击引用核查原文。';
  } catch (error) {
    turn.querySelector('.progress-panel')?.remove();
    turn.querySelector('.assistant-heading small').textContent = '暂未完成';
    const notice = node('p', error.name === 'TimeoutError' ? '本次处理时间较长，请稍后重试。' : error.message, 'turn-error');
    const retry = node('button', '重新提问', 'retry-button');
    retry.onclick = () => { if (!busy) { $('#question').value = question; $('#question').focus(); } };
    notice.append(retry); turn.append(notice);
    $('#message').textContent = '可以重新提问，或稍后再试。'; $('#message').classList.add('error');
  } finally {
    clearInterval(timer); busy = false; $('#form').removeAttribute('aria-busy');
    $('#submit').disabled = false; $('#new-chat').disabled = false;
    $('#submit').replaceChildren(document.createTextNode('发送 '), node('span', '↑'));
  }
};
const importedQuestion = new URLSearchParams(location.search).get('q');
if (importedQuestion) $('#question').value = importedQuestion.slice(0, 2000);
health();

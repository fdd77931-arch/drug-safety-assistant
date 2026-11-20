const key = 'drug-intelligence-safety-evidence-v1';
const cap = 40;

export function readEvidence() {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function updateEvidence(entries) {
  localStorage.setItem(key, JSON.stringify(entries));
  window.dispatchEvent(new Event('safety-evidence-change'));
}

export function saveEvidence(chunk, corpusVersion) {
  const metadata = chunk.metadata;
  const entry = {
    id: corpusVersion + ':' + chunk.chunk_id,
    title: metadata.title,
    doi: metadata.doi,
    documentId: metadata.document_id,
    pages: metadata.pages,
    sourceUrl: metadata.source_url,
    section: metadata.section,
    excerpt: chunk.rerank_window?.text || chunk.text,
    qualityFlags: metadata.quality_flags || [],
    corpusVersion,
  };
  const prior = readEvidence();
  if (prior.some(item => item.id === entry.id)) return false;
  if (prior.length >= cap) throw new Error('已收藏 40 条。请先在「我的研究」移除一条。');
  updateEvidence([...prior,entry]);
  return true;
}

export function removeEvidence(id) {
  updateEvidence(readEvidence().filter(item => item.id !== id));
}

export function evidencePdf(entry) {
  if (entry.sourceUrl) return entry.sourceUrl;
  const page = entry.pages?.[0];
  return './corpus/pdfs/' + encodeURIComponent(entry.documentId) + '.pdf' + (page ? '#page=' + page : '');
}

export function evidenceMarkdown(entry) {
  const pdf = new URL(evidencePdf(entry), location.href).href;
  return [
    '### ' + entry.title,
    '',
    (entry.sourceUrl ? '说明书章节 ' + entry.section : 'PDF 页码 ' + (entry.pages?.join('、') || '未标注')) + ' · 语料版本 ' + entry.corpusVersion,
    '',
    entry.doi ? 'DOI https://doi.org/' + entry.doi : '',
    '原文 ' + pdf,
    '',
    entry.qualityFlags.length ? '抽取片段带质量标记，请核对原始 PDF。' : '摘录自自动抽取文本，请核对原始 PDF。',
    '',
    ...entry.excerpt.trim().split(/\r?\n/).map(line => '> ' + line),
  ].filter((line,i,lines) => line || lines[i-1]).join('\n');
}

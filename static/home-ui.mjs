const areaList = document.querySelector('#home-areas');
try {
  const response = await fetch(new URL('../research/areas.json', import.meta.url));
  if (!response.ok) throw Error();
  for (const {label, category, description} of await response.json()) {
    const link = document.createElement('a');
    link.href = './workspace.html?area=' + encodeURIComponent(category) + '#explorer';
    link.textContent = label;
    link.title = description;
    areaList.append(link);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scope-chip';
    button.dataset.category = category;
    button.textContent = label;
    button.setAttribute('aria-pressed','false');
    document.querySelector('#ask-areas').append(button);
  }
} catch {
  areaList.textContent = '研究领域暂时无法加载。';
}
function showRecent() {
  const list = document.querySelector('#home-recent');
  list.replaceChildren();
  let history = [];
  try {
    const data = JSON.parse(localStorage.getItem('drug-safety-questions-v1'));
    if (Array.isArray(data)) history = data.filter(q => typeof q === 'string' && q.trim()).slice(0, 4);
  } catch {}
  if (!history.length) list.textContent = '暂无查询记录，提问后会显示在这里。';
  for (const question of history) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = question;
    button.onclick = () => {
      document.querySelector('#question').value = question;
      document.querySelector('#form').requestSubmit();
    };
    list.append(button);
  }
}
showRecent();
new MutationObserver(showRecent).observe(document.querySelector('#welcome'), {attributes:true, attributeFilter:['hidden']});
window.addEventListener('drug-safety-history', showRecent);

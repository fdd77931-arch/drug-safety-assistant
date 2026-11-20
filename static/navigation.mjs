const pages = [
  ['首页', ''], ['药物库', 'explorer'], ['临床研究', 'trials'],
  ['安全信息', 'safety-library'], ['文献资料', 'literature'], ['我的收藏', 'saved']
];
const secondary = {pipeline: 'trials', industry: 'explorer'};

class DrugNavigation extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<div class="ds-bar"><a class="ds-brand" href="./"><strong>药物安全助手</strong><small lang="en">Drug Safety AI Assistant</small></a><nav aria-label="主导航"></nav></div>';
    const nav = this.querySelector('nav');
    for (const [label, route] of pages) {
      const link = document.createElement('a');
      link.href = route ? './workspace.html#' + route : './';
      link.textContent = label;
      link.dataset.route = route;
      nav.append(link);
    }
    this.update = () => {
      const hash = location.hash.slice(1);
      const route = location.pathname.endsWith('workspace.html') ? secondary[hash] || hash || 'explorer' : '';
      for (const link of nav.children) {
        if (link.dataset.route === route) link.setAttribute('aria-current','page');
        else link.removeAttribute('aria-current');
      }
    };
    this.update();
    window.addEventListener('hashchange', this.update);
  }
  disconnectedCallback() { window.removeEventListener('hashchange', this.update); }
}
customElements.define('drug-navigation', DrugNavigation);

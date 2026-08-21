let items = [];
let activeFilter = 'all';
let query = '';

const grid = qs('#workGrid');
const resultCount = qs('#resultCount');
const websiteCount = qs('#websiteCount');
const proposalCount = qs('#proposalCount');

function render(){
  const filtered = items.filter(item => {
    const typeMatch = activeFilter === 'all' || item.type === activeFilter;
    const haystack = `${item.title} ${item.category} ${item.description}`.toLowerCase();
    return typeMatch && haystack.includes(query.toLowerCase());
  });
  resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'} shown`;

  if(!filtered.length){
    grid.innerHTML = `<div class="empty-state"><div><div class="empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7.5h16M7.5 4v7M16.5 4v7M5 20h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z" stroke="currentColor" stroke-width="1.4"/></svg></div><h3>${items.length ? 'No matching work.' : 'Your archive is ready.'}</h3><p>${items.length ? 'Try another filter or search term.' : 'Open Manage to add your first website or proposal.'}</p>${items.length ? '' : '<a class="small-btn brand" href="admin.html">Add work</a>'}</div></div>`;
    return;
  }

  grid.innerHTML = filtered.map((item, i) => {
    const image = item.image ? `<img loading="lazy" src="${escapeHTML(safeUrl(item.image))}" alt="${escapeHTML(item.title)} cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">` : '';
    const fallbackStyle = item.image ? 'style="display:none"' : '';
    return `<a class="work-card ${item.featured === 'true' ? 'featured' : ''}" href="${escapeHTML(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" style="transition-delay:${Math.min(i*45,280)}ms">
      <div class="card-visual">${image}<div class="abstract-visual" ${fallbackStyle}></div><span class="card-chip">${escapeHTML(item.type === 'proposal' ? 'Proposal' : (item.category || 'Website'))}</span><span class="card-number">${String(i+1).padStart(2,'0')}</span></div>
      <div class="card-body"><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description || 'Selected Ferrn project archive entry.')}</p><div class="card-bottom"><span>${escapeHTML(item.year || 'Ferrn')}</span><span class="open-pill"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m8 16 8-8M10 8h6v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div></div>
    </a>`;
  }).join('');

  requestAnimationFrame(() => qsa('.work-card').forEach(card => card.classList.add('reveal')));
}

async function loadItems(){
  grid.innerHTML = Array.from({length:6},()=>'<div class="work-card reveal skeleton"></div>').join('');
  try{
    const data = await api('items');
    items = data.items || [];
    websiteCount.textContent = items.filter(x => x.type === 'website').length;
    proposalCount.textContent = items.filter(x => x.type === 'proposal').length;
    render();
  }catch(err){
    if(err.status === 401) return location.replace('/');
    grid.innerHTML = `<div class="empty-state"><div><h3>Could not load the archive.</h3><p>${escapeHTML(err.message)}</p></div></div>`;
  }
}

qsa('.tab').forEach(tab => tab.addEventListener('click', () => {
  qsa('.tab').forEach(x => x.classList.remove('active'));
  tab.classList.add('active');
  activeFilter = tab.dataset.filter;
  render();
}));
qs('#searchInput').addEventListener('input', e => { query = e.target.value.trim(); render(); });

loadItems();

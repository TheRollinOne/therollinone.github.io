(function(){
  function slugify(str){
    return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  const state = {
    query:'',
    categories:new Set(),
    prereq:null, // null | 'none' | 'some'
    prereqQuery:'',
    sort:'name',
    open:new Set()
  };

  document.getElementById('brandSub').textContent = `Feat Library · ${FEATS_DATA.length} Feats`;

  FEATS_DATA.forEach((f,i)=>{
    f._idx = i;
    f._slug = slugify(f.category);
    f._prereqBlob = (f.prerequisites||'').toLowerCase();
    f._blob = [
      f.name, f.category, f.flavor_text, f.prerequisites, f.benefits,
      f.normal, f.special
    ].filter(Boolean).join(' ').toLowerCase();
  });

  const allCategories = Array.from(new Set(FEATS_DATA.map(f=>f.category))).sort();
  const categoryChips = document.getElementById('categoryChips');
  allCategories.forEach(cat=>{
    const slug = slugify(cat);
    const chip = document.createElement('div');
    chip.className='chip';
    chip.style.setProperty('--dotc', `var(--cat-${slug})`);
    chip.style.setProperty('--chipc', `var(--cat-${slug})`);
    chip.dataset.cat = cat;
    chip.innerHTML = `<span class="dot"></span>${cat}`;
    chip.addEventListener('click', ()=>{
      if(state.categories.has(cat)) state.categories.delete(cat);
      else state.categories.add(cat);
      chip.classList.toggle('active');
      render();
    });
    categoryChips.appendChild(chip);
  });

  const prereqChips = document.getElementById('prereqChips');
  prereqChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const val = chip.dataset.prereq;
      if(state.prereq === val){
        state.prereq = null;
        chip.classList.remove('active');
      } else {
        state.prereq = val;
        prereqChips.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
      }
      render();
    });
  });

  initMobileFiltersCollapse();

  document.getElementById('clearCategories').addEventListener('click', ()=>{
    state.categories.clear();
    document.querySelectorAll('#categoryChips .chip').forEach(el=>el.classList.remove('active'));
    render();
  });

  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.getElementById('searchWrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  const syncSearchClearIcon = wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q)=>{ state.query = q; },
    render: ()=>render()
  });

  const prereqSearchInputEl = document.getElementById('prereqSearchInput');
  const prereqSearchWrapEl = document.getElementById('prereqSearchWrap');
  const prereqSearchClearIcon = document.getElementById('prereqSearchClearIcon');
  const syncPrereqSearchClearIcon = wireSearchInput({
    inputEl: prereqSearchInputEl,
    wrapEl: prereqSearchWrapEl,
    clearIconEl: prereqSearchClearIcon,
    onQuery: (q)=>{ state.prereqQuery = q; },
    render: ()=>render()
  });

  document.getElementById('clearPrereq').addEventListener('click', ()=>{
    state.prereq = null;
    document.querySelectorAll('#prereqChips .chip').forEach(el=>el.classList.remove('active'));
    state.prereqQuery = '';
    prereqSearchInputEl.value = '';
    syncPrereqSearchClearIcon();
    render();
  });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    syncSearchClearIcon();
    state.categories.clear();
    document.querySelectorAll('#categoryChips .chip').forEach(el=>el.classList.remove('active'));
    state.prereq = null;
    document.querySelectorAll('#prereqChips .chip').forEach(el=>el.classList.remove('active'));
    state.prereqQuery = '';
    prereqSearchInputEl.value = '';
    syncPrereqSearchClearIcon();
    render();
  });

  wireSortSelect(state, ()=>render());

  wireCopyableList('featList', 'feat-name');

  function matchesQuery(feat, query){
    return matchesQueryOnBlob(feat._blob, query);
  }

  function matchesPrereqQuery(feat, query){
    return matchesQueryOnBlob(feat._prereqBlob, query);
  }

  function cardHTML(f){
    const cVar = `var(--cat-${f._slug})`;
    const isOpen = state.open.has(f._idx);

    const flavorHtml = f.flavor_text ? `<p class="feat-flavor copyable" data-copy="${escapeHtml(f.flavor_text)}">${escapeHtml(f.flavor_text)}</p>` : '';

    const prereqHtml = (f.prerequisites && f.prerequisites.length>0) ? `\n        <div class="feat-section">\n          <div class="feat-section-title">Prerequisites</div>\n          <div class="feat-desc copyable" data-copy="${escapeHtml(boldLeadingLabelText(f.prerequisites))}"><div>${boldLeadingLabel(f.prerequisites)}</div></div>\n        </div>` : '';

    const groupFields = [
      ['Benefits', f.benefits],
      ['Normal', f.normal],
      ['Special', f.special]
    ].filter(([label,val])=>val && val.length>0);

    const groupInnerHtml = groupFields.map(([label,val])=>{
      return `\n        <div class="feat-section">\n          <div class="feat-section-title">${escapeHtml(label)}</div>\n          <div class="feat-desc"><div>${boldLeadingLabel(val)}</div></div>\n        </div>`;
    }).join('');

    const combinedCopyText = boldLeadingLabelText(
      groupFields.map(([label,val])=> label==='Benefits' ? val : `${label}: ${val}`).join('\n\n')
    );

    const groupHtml = groupFields.length
      ? `<div class="feat-copy-group copyable" data-copy="${escapeHtml(combinedCopyText)}">${groupInnerHtml}\n        </div>`
      : '';

    return `\n    <div class="feat-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${f._idx}">\n      <div class="feat-head" data-toggle="${f._idx}">\n        <div class="feat-title-block">\n          <span class="feat-name copyable" data-copy="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>\n          <span class="feat-category-tag">${escapeHtml(f.category)}</span>\n        </div>\n        <div class="feat-right">\n          <span class="feat-badge" title="${escapeHtml(f.flavor_text||'')}">${escapeHtml(f.flavor_text||'')}</span>\n          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>\n        </div>\n      </div>\n      <div class="feat-body">\n        ${flavorHtml}${prereqHtml}${groupHtml}\n      </div>\n    </div>`;
  }

  function filtered(){
    let list = FEATS_DATA;
    if(state.query){
      list = list.filter(f=>matchesQuery(f, state.query));
    }
    if(state.categories.size){
      list = list.filter(f=>state.categories.has(f.category));
    }
    if(state.prereq === 'none'){
      list = list.filter(f=>!f.prerequisites);
    } else if(state.prereq === 'some'){
      list = list.filter(f=>!!f.prerequisites);
    }
    if(state.prereqQuery){
      list = list.filter(f=>matchesPrereqQuery(f, state.prereqQuery));
    }
    const sorted = list.slice();
    if(state.sort==='name'){
      sorted.sort((a,b)=>a.name.localeCompare(b.name));
    } else if(state.sort==='category'){
      sorted.sort((a,b)=>(a.category||'').localeCompare(b.category||'') || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Feat${results.length!==1?'s':''} Listed`;
    const listEl = document.getElementById('featList');
    if(results.length===0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No feats found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    listEl.innerHTML = results.map(cardHTML).join('');
    wireCardToggle(listEl, state, 'feat-card', 'feat-name');
  }

  render();
})();
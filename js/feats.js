(function(){
  function slugify(str){
    return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  // CATEGORY_COLORS moved to base.js's shared TYPE_COLORS/buildTypeColorMap.

  const state = {
    query:'',
    categories:new Set(),
    prereq:null, // null | 'none' | 'some'
    prereqQuery:'',
    abilities:new Set(), // any of: str, dex, con, int, wis, cha
    bab:false,
    skillRanks:false,
    classFeature:'', // '' = Any, else a key into CLASS_FEATURE_RX
    sort:'name',
    open:new Set()
  };

  const ABILITY_RX = {
    str: /\bstr\s+\d+/i,
    dex: /\bdex\s+\d+/i,
    con: /\bcon\s+\d+/i,
    int: /\bint\s+\d+/i,
    wis: /\bwis\s+\d+/i,
    cha: /\bcha\s+\d+/i
  };
  const BAB_RX = /\bbab\b|\bbase attack bonus\b/i;
  const SKILL_RANKS_RX = /\b\d+\s+ranks?\b/i;
  const CLASS_FEATURE_RX = {
    animalCompanion: /animal companion/i,
    arcaneSchool: /arcane school/i,
    armorTraining: /armor training/i,
    bardicPerformance: /bardic performance/i,
    channelEnergy: /channel (positive |negative )?energy/i,
    domain: /\bdomain\b/i,
    familiar: /\bfamiliar\b/i,
    flurryOfBlows: /flurry of blows/i,
    gritPanache: /\bgrit\b|\bpanache\b/i,
    judgment: /\bjudgment\b/i,
    layOnHands: /lay on hands/i,
    rage: /\brage\b/i,
    sneakAttack: /sneak attack/i,
    uncannyDodge: /uncanny dodge/i,
    weaponTraining: /weapon training/i,
    wildShape: /wild shape|wild empathy/i
  };

  document.getElementById('brandSub').textContent = `Feat Library · ${FEATS_DATA.length} Feats`;

  FEATS_DATA.forEach((f,i)=>{
    f._idx = i;
    f._prereqBlob = (f.prerequisites||'').toLowerCase();
    const p = f.prerequisites || '';
    f._abilities = new Set(Object.keys(ABILITY_RX).filter(k=>ABILITY_RX[k].test(p)));
    f._hasBab = BAB_RX.test(p);
    f._hasSkillRanks = SKILL_RANKS_RX.test(p);
    f._classFeatures = new Set(Object.keys(CLASS_FEATURE_RX).filter(k=>CLASS_FEATURE_RX[k].test(p)));
    f._blob = [
      f.name, f.category, f.prerequisites, f.benefits,
      f.normal, f.special
    ].filter(Boolean).join(' ').toLowerCase();
  });

  initThemeToggle();
  initSidebarArt();

  const categoryColorOf = buildTypeColorMap(FEATS_DATA.map(f=>f.category));
  const allCategories = Object.keys(categoryColorOf);
  FEATS_DATA.forEach(f=>{ f._cardColor = categoryColorOf[f.category]; });

  const categoryChips = document.getElementById('categoryChips');
  allCategories.forEach(cat=>{
    const color = categoryColorOf[cat];
    const chip = document.createElement('div');
    chip.className='chip';
    chip.style.setProperty('--dotc', color);
    chip.style.setProperty('--chipc', color);
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

  const abilityChips = document.getElementById('abilityChips');
  abilityChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const val = chip.dataset.ability;
      if(state.abilities.has(val)) state.abilities.delete(val);
      else state.abilities.add(val);
      chip.classList.toggle('active');
      render();
    });
  });

  const babSkillChips = document.getElementById('babSkillChips');
  babSkillChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const flag = chip.dataset.flag;
      state[flag] = !state[flag];
      chip.classList.toggle('active');
      render();
    });
  });

  const classFeatureSelectEl = document.getElementById('classFeatureSelect');
  // Capture the full option list (value + label, in HTML order) once; the
  // <select> is then rebuilt on every render() from the class features
  // present in the base-filtered set — see updateClassFeatureOptions().
  const ALL_CLASS_FEATURE_OPTIONS = Array.from(classFeatureSelectEl.options)
    .filter(o=>o.value)
    .map(o=>({ value:o.value, label:o.textContent }));
  classFeatureSelectEl.addEventListener('change', e=>{
    state.classFeature = e.target.value;
    render();
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

  wireSearchTooltip(searchInputEl, searchWrapEl, 'power attack +combat -fighter');

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
    state.abilities.clear();
    document.querySelectorAll('#abilityChips .chip').forEach(el=>el.classList.remove('active'));
    state.bab = false;
    state.skillRanks = false;
    document.querySelectorAll('#babSkillChips .chip').forEach(el=>el.classList.remove('active'));
    state.classFeature = '';
    classFeatureSelectEl.value = '';
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
    state.abilities.clear();
    document.querySelectorAll('#abilityChips .chip').forEach(el=>el.classList.remove('active'));
    state.bab = false;
    state.skillRanks = false;
    document.querySelectorAll('#babSkillChips .chip').forEach(el=>el.classList.remove('active'));
    state.classFeature = '';
    classFeatureSelectEl.value = '';
    render();
  });

  // Sort buttons in the page header.
  const sortBtns = document.querySelectorAll('#sortBar .sort-btn');
  sortBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.sort = btn.dataset.sort;
      render();
    });
  });
  function syncSortButtons(){
    sortBtns.forEach(b=>b.classList.toggle('active', b.dataset.sort === state.sort));
  }

  wireCopyableList('featList', 'feat-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(feat, query){
    return queryMatch(feat._blob, query);
  }

  const prereqQueryMatch = createQueryMatcher();
  function matchesPrereqQuery(feat, query){
    return prereqQueryMatch(feat._prereqBlob, query);
  }

  function cardHTML(f){
    const cVar = f._cardColor;
    const isOpen = state.open.has(f._idx);

    const flavorHtml = f.flavor_text ? `<p class="feat-flavor copyable" data-copy="${escapeHtml(f.flavor_text)}">${escapeHtml(f.flavor_text)}</p>` : '';

    const prereqHtml = (f.prerequisites && f.prerequisites.length>0) ? `\n        <div class="feat-section copyable" data-copy="${escapeHtml(boldLeadingLabelText(f.prerequisites))}">\n          <div class="feat-section-title">Prerequisites</div>\n          <div class="feat-desc"><div>${boldLeadingLabel(f.prerequisites)}</div></div>\n        </div>` : '';

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

  // Every filter except Class Feature — the population the Class Feature
  // dropdown's own options are computed from.
  function baseFiltered(){
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
    if(state.abilities.size){
      list = list.filter(f=>{
        for(const a of state.abilities){ if(f._abilities.has(a)) return true; }
        return false;
      });
    }
    if(state.bab){
      list = list.filter(f=>f._hasBab);
    }
    if(state.skillRanks){
      list = list.filter(f=>f._hasSkillRanks);
    }
    return list;
  }

  // Rebuilds the Class Feature <select> keeping only features that appear
  // in the prerequisites of `list`. Resets to "Any" if the selection vanished.
  function updateClassFeatureOptions(list){
    const present = new Set();
    list.forEach(f=>f._classFeatures.forEach(k=>present.add(k)));
    if(state.classFeature && !present.has(state.classFeature)) state.classFeature = '';
    classFeatureSelectEl.innerHTML = '<option value="">Any</option>' +
      ALL_CLASS_FEATURE_OPTIONS.filter(o=>present.has(o.value))
        .map(o=>`<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    classFeatureSelectEl.value = state.classFeature;
  }

  function filtered(){
    const base = baseFiltered();
    updateClassFeatureOptions(base);
    const list = state.classFeature ? base.filter(f=>f._classFeatures.has(state.classFeature)) : base;
    const sorted = list.slice();
    if(state.sort==='name'){
      sorted.sort((a,b)=>a.name.localeCompare(b.name));
    } else if(state.sort==='name_desc'){
      sorted.sort((a,b)=>b.name.localeCompare(a.name));
    } else if(state.sort==='category'){
      sorted.sort((a,b)=>(a.category||'').localeCompare(b.category||'') || a.name.localeCompare(b.name));
    } else if(state.sort==='category_desc'){
      sorted.sort((a,b)=>(b.category||'').localeCompare(a.category||'') || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Feat${results.length!==1?'s':''} Listed`;
    const listEl = document.getElementById('featList');
    if(results.length===0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No feats found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    const shown = paginate(state, results);
    listEl.innerHTML = shown.map(cardHTML).join('') + showMoreButtonHTML(results, state, 'Feats');
    wireCardToggle(listEl, state, 'feat-card', 'feat-name');
    wireShowMore(listEl, {
      onLoadMore: () => { state.visibleCount += PAGE_SIZE; render(); },
      onShowAll: () => { state.visibleCount = results.length; render(); }
    });
  }

  render();
})();

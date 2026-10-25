(function(){
  const state = {
    query:'',
    searchScope:SEARCH_SCOPE_NAMES,
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

  setBrandSub('Feat Library', FEATS_DATA.length, 'Feats');

  FEATS_DATA.forEach((f,i)=>{
    f._idx = i;
    f._prereqBlob = (f.prerequisites||'').toLowerCase();
    const p = f.prerequisites || '';
    f._abilities = new Set(Object.keys(ABILITY_RX).filter(k=>ABILITY_RX[k].test(p)));
    f._hasBab = BAB_RX.test(p);
    f._hasSkillRanks = SKILL_RANKS_RX.test(p);
    f._classFeatures = new Set(Object.keys(CLASS_FEATURE_RX).filter(k=>CLASS_FEATURE_RX[k].test(p)));
    f._nameBlob = (f.name || '').toLowerCase();
    f._blob = [
      f.name, f.category, f.prerequisites, f.benefits,
      f.normal, f.special
    ].filter(Boolean).join(' ').toLowerCase();
  });

  initPageChrome();

  const categoryColorOf = buildTypeColorMap(FEATS_DATA.map(f=>f.category));
  FEATS_DATA.forEach(f=>{ f._cardColor = categoryColorOf[f.category]; });

  const resetCategories = buildColorChips(categoryColorOf, state.categories, 'categoryChips', {
    dataAttr: 'cat', clearId: 'clearCategories', render
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

  const resetAbilities = wireChipSet({
    container: 'abilityChips', set: state.abilities, dataAttr: 'ability', render
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

  const search = initSearch({ state, render, example: 'power attack +combat -fighter' });

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

  // Resets every prerequisite-related filter WITHOUT rendering.
  function resetPrereqFilters(){
    state.prereq = null;
    prereqChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    state.prereqQuery = '';
    prereqSearchInputEl.value = '';
    syncPrereqSearchClearIcon();
    resetAbilities();
    state.bab = false;
    state.skillRanks = false;
    babSkillChips.querySelectorAll('.chip').forEach(el=>el.classList.remove('active'));
    state.classFeature = '';
    classFeatureSelectEl.value = '';
  }

  document.getElementById('clearPrereq').addEventListener('click', ()=>{
    resetPrereqFilters();
    render();
  });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    search.reset();
    resetCategories();
    resetPrereqFilters();
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('featList', 'feat-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(feat, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? feat._blob : feat._nameBlob, query);
  }

  const prereqQueryMatch = createQueryMatcher();
  function matchesPrereqQuery(feat, query){
    return prereqQueryMatch(feat._prereqBlob, query);
  }

  function cardHTML(f){
    const cVar = f._cardColor;
    const isOpen = state.open.has(f._idx);

    const flavorHtml = f.flavor_text ? `<p class="feat-flavor copyable" data-copy="${escapeHtml(f.flavor_text)}">${escapeHtml(f.flavor_text)}</p>` : '';

    const prereqHtml = (f.prerequisites && f.prerequisites.length>0) ? `
        <div class="entry-section copyable" data-copy="${escapeHtml(clipboardFormatText(f.prerequisites))}">
          <div class="entry-section-title">Prerequisites</div>
          <div class="entry-desc feat-desc"><div>${htmlFormatText(f.prerequisites)}</div></div>
        </div>` : '';

    const groupFields = [
      ['Benefits', f.benefits],
      ['Normal', f.normal],
      ['Special', f.special]
    ].filter(([label,val])=>val && val.length>0);

    const groupInnerHtml = groupFields.map(([label,val])=>{
      return `
        <div class="entry-section">
          <div class="entry-section-title">${escapeHtml(label)}</div>
          <div class="entry-desc feat-desc"><div>${htmlFormatText(val)}</div></div>
        </div>`;
    }).join('');

    const combinedCopyText = clipboardFormatText(
      groupFields.map(([label,val])=> label==='Benefits' ? val : `${label}: ${val}`).join('\n\n')
    );

    const groupHtml = groupFields.length
      ? `<div class="copyable" data-copy="${escapeHtml(combinedCopyText)}">${groupInnerHtml}
        </div>`
      : '';

    return `
    <div class="entry-card feat-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${f._idx}">
      <div class="entry-head" data-toggle="${f._idx}">
        <div class="entry-title-block">
          <span class="entry-name feat-name copyable" data-copy="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
          <span class="entry-tag">${escapeHtml(f.category)}</span>
        </div>
        <div class="entry-right">
          <span class="entry-badge entry-badge--responsive" title="${escapeHtml(f.flavor_text||'')}">${escapeHtml(f.flavor_text||'')}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body">
        ${flavorHtml}${prereqHtml}${groupHtml}
      </div>
    </div>`;
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
    sortSelectOptions(classFeatureSelectEl);
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
    setListTitle(results.length, 'Feat');
    renderList({
      state, results, listId: 'featList', cardHTML,
      cardClass: 'feat-card', nameClass: 'feat-name',
      emptyNoun: 'feats', labelPlural: 'Feats', rerender: render
    });
  }

  render();
})();

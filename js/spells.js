(function(){
  const SCHOOL_ORDER = ['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation','universal'];
  // subschool is a list, e.g. ["Figment","Glamer"] or []
  const subschoolText = s => (s.subschool || []).join(', ');
  // school + subschool, e.g. "illusion (Figment, Glamer)"; no empty "()" when the list is empty
  const schoolDisplay = s => {
    const sub = subschoolText(s);
    return sub ? `${s.school || ''} (${sub})` : (s.school || '');
  };
  // sr + sr_extra, e.g. "no (harmless)"; no trailing space when sr_extra is blank
  const srDisplay = s => {
    const extra = (s.sr_extra || '').trim();
    return extra ? `${s.sr || ''} ${extra}` : (s.sr || '');
  };
  // ritual is now numeric: 1 = ritual, 0 = not (tolerates "1" string too)
  const isRitual = s => Number(s.ritual) === 1;

  const state = {
    query:'',
    searchScope:SEARCH_SCOPE_NAMES,
    schools:new Set(),
    subschool:'',
    classes:new Set(),
    levels:new Set(),
    saves:new Set(),
    ritual:null,
    sort:'name',
    open:new Set()
  };

  setBrandSub('Spell Compendium', SPELLS_DATA.length, 'Spells');

  SPELLS_DATA.forEach((s,i)=>{
    s._idx = i;
    s._classes = s.level_entries.map(le=>le.class);
    s._nameBlob = (s.name || '').toLowerCase();
    s._blob = [
      s.name, schoolDisplay(s), s._classes.join(' '), s.casting_time,
      s.components, s.range, s.target, s.effect, s.area, s.duration, s.save, srDisplay(s),
      s.description
    ].join(' ').toLowerCase();
  });

  // Universal doesn't take a slot in the round-robin palette — it always
  // gets the neutral gray fallback instead.
  const schoolsForColor = SCHOOL_ORDER.filter(sch => sch !== 'universal' && SPELLS_DATA.some(s=>s.school===sch));
  const schoolColorOf = buildTypeColorMap(schoolsForColor, SCHOOL_ORDER);
  schoolColorOf.universal = TYPE_GRAY;
  SPELLS_DATA.forEach(s=>{ s._cardColor = schoolColorOf[s.school || 'universal'] || TYPE_GRAY; });

  initPageChrome();

  const allClasses = Array.from(new Set(SPELLS_DATA.flatMap(s=>s._classes))).sort();
  const resetClasses = buildPlainChips(allClasses, state.classes, 'classChips', {
    dataAttr: 'cls', clearId: 'clearClasses', render, labelOf: formatCapitalize
  });

  const resetLevels = buildPlainChips([0,1,2,3,4,5,6,7,8,9], state.levels, 'levelChips', {
    dataAttr: 'level', clearId: 'clearLevels', render, parse: Number
  });

  const SAVE_TYPES = ['Fortitude','Reflex','Will','None'];
  const saveChips = document.getElementById('saveChips');
  const resetSaves = buildPlainChips(SAVE_TYPES, state.saves, saveChips, {
    dataAttr: 'save', clearId: 'clearSaves', render
  });

  // Ritual Casting section — no static markup exists for this yet, so build
  // it and insert it directly after the Saves filter-group.
  const savesGroup = saveChips.closest('.filter-group');
  const ritualGroup = document.createElement('div');
  ritualGroup.className = 'filter-group';
  ritualGroup.innerHTML = `
    <div class="filter-label">Ritual Casting</div>
    <div class="chip-grid cols-2" id="ritualChips"></div>`;
  savesGroup.insertAdjacentElement('afterend', ritualGroup);

  const resetRitual = wireYesNoToggle({
    container: ritualGroup.querySelector('#ritualChips'), state, key: 'ritual', render
  });

  // Only schools present in the data get a chip (Universal keeps its gray).
  const presentSchoolColors = {};
  SCHOOL_ORDER.forEach(sch=>{
    if(SPELLS_DATA.some(s=>s.school===sch)) presentSchoolColors[sch] = schoolColorOf[sch] || TYPE_GRAY;
  });
  const resetSchools = buildColorChips(presentSchoolColors, state.schools, 'schoolChips', {
    dataAttr: 'school', clearId: 'clearSchools', render, labelOf: formatCapitalize
  });

  // Subschool select: options are rebuilt on every render() from the spells
  // left by all the OTHER filters (see updateSubschoolOptions()).
  const subschoolSelect = document.getElementById('subschoolSelect');
  subschoolSelect.addEventListener('change', ()=>{
    state.subschool = subschoolSelect.value;
    render();
  });
  document.getElementById('clearSubschool').addEventListener('click', ()=>{
    state.subschool = '';
    subschoolSelect.value = '';
    render();
  });

  const search = initSearch({ state, render, example: 'fireball +evocation -verbal' });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    search.reset();
    resetSchools();
    state.subschool = '';
    subschoolSelect.value = '';
    resetClasses();
    resetLevels();
    resetSaves();
    resetRitual();
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('spellList', 'spell-name');
  wireHoverCopyTooltip('spellList', '.class-pill-damage:not(.class-pill-split)');
  wireHoverCopyTooltip('spellList', '.pill-half');

  // Builds the Roll20 clipboard payload: every top-level spell field except
  // level_entries (and internal _-prefixed helper fields), one "Label: value"
  // per line, in the field's original JSON order. `overrides` lets callers
  // substitute already-bolded text (e.g. description/heightened) instead of
  // the raw field value.
  const ROLL20_SKIP_FIELDS = new Set(['level_entries']);
  function buildRoll20Text(s, overrides){
    overrides = overrides || {};
    const lines = [];
    Object.keys(s).forEach(key=>{
      if(key.startsWith('_') || ROLL20_SKIP_FIELDS.has(key)) return;
      let val;
      if(Object.prototype.hasOwnProperty.call(overrides, key)){
        val = overrides[key];
      } else {
        val = s[key];
        if(Array.isArray(val)) val = val.join(' | ');
        if(val === null || val === undefined) val = '';
      }
      const label = key.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      lines.push(`${label}: ${val}`);
    });
    return lines.join('\n');
  }

  const queryMatch = createQueryMatcher();
  function matchesQuery(spell, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? spell._blob : spell._nameBlob, query);
  }

  function cardHTML(s){
    const sch = s.school || 'universal';
    const cVar = s._cardColor || TYPE_GRAY;
    const isOpen = state.open.has(s._idx);
    let displayLevel = s.min_level;
    if(state.classes.size){
      const match = s.level_entries.find(le=>state.classes.has(le.class));
      if(match) displayLevel = match.level;
    }
    const levelDisp = displayLevel===0 ? 'Cantrip' : `Lvl ${displayLevel}`;

    const statFields = [
      ['School', schoolDisplay(s)],
      ['Descriptor', s.descriptor || ''],
      ['Casting Time', s.casting_time],
      ['Components', s.components],
      ['Range', s.range],
      ['Target', s.target || ''],
      ['Effect', s.effect || ''],
      ['Area', s.area || ''],
      ['Duration', s.duration],
      ['Save', s.save],
      ['SR', srDisplay(s)]
    ].filter(([label,val])=>val && val.length>0);

    const classesHTML = s.level_entries.map(le=>{
      const formula = le.damage_formula;
      if(!formula){
        return `<span class="class-pill">${escapeHtml(le.class)} ${escapeHtml(le.level)}</span>`;
      }
      if(!/c1_/.test(formula)){
        return `<span class="class-pill class-pill-damage copyable" data-copy="${escapeHtml(formula)}">${escapeHtml(le.class)} ${le.level}</span>`;
      }
      const formula1 = formula;
      const formula2 = formula.replace(/c1_/g, 'c2_');
      return `<span class="class-pill class-pill-damage class-pill-split">${escapeHtml(le.class)} ${le.level}<span class="pill-halves"><span class="pill-half pill-half-1 copyable" data-copy="${escapeHtml(formula1)}" data-tip-label="Click to copy - Caster 1">1</span><span class="pill-half pill-half-2 copyable" data-copy="${escapeHtml(formula2)}" data-tip-label="Click to copy - Caster 2">2</span></span></span>`;
    }).join('');
    const classLevelInline = s.level_entries.map(le=>`${le.class} ${le.level}`).join(', ');
    const shortDescInline = s.short_description || classLevelInline;
    const ritualTagHTML = isRitual(s) ? `<span class="ritual-tag">Ritual</span>` : '';

    const descText = clipboardFormatText((s.description || '').trim());
    const heightenedText = (s.heightened && s.heightened.length) ? s.heightened.map(h=>{
      const m = h.match(/^\s*(\([^)]*\))\s*(.*)$/s);
      return m ? `**${m[1]}** ${clipboardFormatText(m[2])}` : clipboardFormatText(h);
    }).join('\n') : '';

    const roll20Text = buildRoll20Text(s, {description: descText, heightened: heightenedText, subschool: subschoolText(s)});
    const roll20TagHTML = `<span class="ritual-tag roll20-tag copyable" data-copy="${escapeHtml(roll20Text)}">Copy</span>`;
    const badgesHTML = `<div class="spell-badges">${ritualTagHTML}</div>`;

    const descHtml = `<div class="spell-section-title-row"><div class="entry-section-title">Description</div>${badgesHTML}</div><div>${htmlFormatDescription((s.description || '').trim())}</div>`;

    const heightenedItemsHtml = (s.heightened && s.heightened.length) ? s.heightened.map(h=>{
      const m = h.match(/^\s*(\([^)]*\))\s*(.*)$/s);
      if(m) return `<div class="entry-desc heightened-item"><b>${escapeHtml(m[1].replace(/^\(\s*|\s*\)$/g, ''))}</b>: ${htmlFormatText(m[2])}</div>`;
      return `<div class="entry-desc heightened-item">${htmlFormatText(h)}</div>`;
    }).join('') : '';
    const heightenedCopyBlock = heightenedText ? `
      <div class="entry-section copyable" data-copy="${escapeHtml(heightenedText)}">
        <div class="entry-section-title">Heightened</div>
        <div >${heightenedItemsHtml}</div>
      </div>` : '';
    return `
    <div class="entry-card spell-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${s._idx}">
      <div class="entry-head" data-toggle="${s._idx}">
        <div class="entry-title-block">
          <span class="entry-name spell-name copyable" data-copy="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
          <span class="entry-meta">${levelDisp}</span>
          <span class="entry-tag">${escapeHtml(schoolDisplay(s) || sch)}</span>
        </div>
        <div class="entry-right">
          <span class="entry-badge entry-badge--responsive spell-classlevel-badge" title="${escapeHtml(shortDescInline)}">${escapeHtml(shortDescInline)}</span>
          ${roll20TagHTML}
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body">
        <div class="stat-grid">
          ${statFields.map(([l,v])=>`<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`).join('')}
        </div>
        <div class="classes-row">${classesHTML}</div>
        <div class="entry-desc desc-copy copyable" data-copy="${escapeHtml(descText)}">${descHtml}</div>${heightenedCopyBlock}
      </div>
    </div>`;
  }

  // Rebuilds the Subschool <select> from the subschools present in `list`
  // (spells passing every other filter). If the selected value is no longer
  // present, resets it to "Any".
  function updateSubschoolOptions(list){
    const set = new Set();
    list.forEach(s=>(s.subschool || []).forEach(x=>{ if(x) set.add(x); }));
    if(state.subschool && !set.has(state.subschool)) state.subschool = '';
    subschoolSelect.innerHTML = '<option value="">Any</option>' +
      Array.from(set).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    sortSelectOptions(subschoolSelect);
    subschoolSelect.value = state.subschool;
  }

  // Applies every filter except the one named in `skip` ('subschool'), so the
  // Subschool options never shrink to just the chosen value.
  function applyFilters(skip){
    let list = SPELLS_DATA;
    if(state.query){
      list = list.filter(s=>matchesQuery(s, state.query));
    }
    if(state.schools.size){
      list = list.filter(s=>state.schools.has(s.school));
    }
    if(skip !== 'subschool' && state.subschool){
      list = list.filter(s=>(s.subschool || []).includes(state.subschool));
    }
    if(state.classes.size){
      list = list.filter(s=>s._classes.some(c=>state.classes.has(c)));
    }
    if(state.levels.size){
      if(state.classes.size){
        list = list.filter(s=>s.level_entries.some(le=>state.classes.has(le.class) && state.levels.has(le.level)));
      } else {
        list = list.filter(s=>s.level_entries.some(le=>state.levels.has(le.level)));
      }
    }
    if(state.saves.size){
      list = list.filter(s=>s.save_type && state.saves.has(s.save_type));
    }
    if(state.ritual === 'yes'){
      list = list.filter(s=>isRitual(s));
    } else if(state.ritual === 'no'){
      list = list.filter(s=>!isRitual(s));
    }
    return list;
  }

  function filtered(){
    updateSubschoolOptions(applyFilters('subschool'));
    const list = applyFilters(null);
    const sorted = list.slice();
    if(state.sort==='name'){
      sorted.sort((a,b)=>naturalCompare(a.name, b.name));
    } else if(state.sort==='name_desc'){
      sorted.sort((a,b)=>naturalCompare(b.name, a.name));
    } else if(state.sort==='level_desc'){
      sorted.sort((a,b)=>(b.min_level-a.min_level) || naturalCompare(a.name, b.name));
    } else if(state.sort==='school_desc'){
      sorted.sort((a,b)=>(b.school||'').localeCompare(a.school||'') || naturalCompare(a.name, b.name));
    } else if(state.sort==='level'){
      sorted.sort((a,b)=>(a.min_level-b.min_level) || naturalCompare(a.name, b.name));
    } else if(state.sort==='school'){
      sorted.sort((a,b)=>(a.school||'').localeCompare(b.school||'') || naturalCompare(a.name, b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    setListTitle(results.length, 'Spell');
    renderList({
      state, results, listId: 'spellList', cardHTML,
      cardClass: 'spell-card', nameClass: 'spell-name',
      emptyNoun: 'spells', labelPlural: 'Spells', rerender: render
    });
  }

  render();
})();

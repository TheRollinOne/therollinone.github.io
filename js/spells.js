(function(){
  const SCHOOL_ORDER = ['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation','universal'];
  const SCHOOL_LABEL = {abjuration:'Abjuration',conjuration:'Conjuration',divination:'Divination',enchantment:'Enchantment',evocation:'Evocation',illusion:'Illusion',necromancy:'Necromancy',transmutation:'Transmutation',universal:'Universal'};

  const state = {
    query:'',
    schools:new Set(),
    classes:new Set(),
    levels:new Set(),
    saves:new Set(),
    ritual:null,
    sort:'name',
    open:new Set()
  };

  document.getElementById('brandSub').textContent = `Spell Compendium · ${SPELLS_DATA.length} Spells`;

  SPELLS_DATA.forEach((s,i)=>{
    s._idx = i;
    s._classes = s.level_entries.map(le=>le.class);
    s._blob = [
      s.name, s.school, s.level_raw, s._classes.join(' '), s.casting_time,
      s.components, s.range, s.target, s.effect, s.area, s.duration, s.save, s.sr,
      s.description, (s.heightened||[]).join(' '), s.ritual || ''
    ].join(' ').toLowerCase();
  });

  initThemeToggle();

  const allClasses = Array.from(new Set(SPELLS_DATA.flatMap(s=>s._classes))).sort();
  const classChips = document.getElementById('classChips');
  allClasses.forEach(c=>{
    const chip = document.createElement('div');
    chip.className='chip';
    chip.dataset.cls = c;
    chip.textContent = c.charAt(0).toUpperCase()+c.slice(1);
    chip.addEventListener('click', ()=>{
      if(state.classes.has(c)){
        state.classes.delete(c);
      } else {
        state.classes.add(c);
      }
      chip.classList.toggle('active');
      render();
    });
    classChips.appendChild(chip);
  });

  const allLevelValues = [0,1,2,3,4,5,6,7,8,9];
  const levelChips = document.getElementById('levelChips');
  allLevelValues.forEach(l=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.level = l;
    chip.textContent = l;
    chip.addEventListener('click', ()=>{
      if(state.levels.has(l)){
        state.levels.delete(l);
      } else {
        state.levels.add(l);
      }
      chip.classList.toggle('active');
      render();
    });
    levelChips.appendChild(chip);
  });

  const SAVE_TYPES = ['Fortitude','Reflex','Will','None'];
  const saveChips = document.getElementById('saveChips');
  SAVE_TYPES.forEach(sv=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.save = sv;
    chip.textContent = sv;
    chip.addEventListener('click', ()=>{
      if(state.saves.has(sv)){
        state.saves.delete(sv);
      } else {
        state.saves.add(sv);
      }
      chip.classList.toggle('active');
      render();
    });
    saveChips.appendChild(chip);
  });

  // Ritual Casting section — no static markup exists for this yet, so build
  // it and insert it directly after the Saves filter-group.
  const savesGroup = saveChips.closest('.filter-group');
  const ritualGroup = document.createElement('div');
  ritualGroup.className = 'filter-group';
  ritualGroup.innerHTML = `
    <div class="filter-label">Ritual Casting</div>
    <div class="chip-row ritual-chip-row" id="ritualChips"></div>`;
  savesGroup.insertAdjacentElement('afterend', ritualGroup);

  const ritualChips = ritualGroup.querySelector('#ritualChips');
  const RITUAL_OPTIONS = [{key:'yes', label:'Yes'}, {key:'no', label:'No'}];
  RITUAL_OPTIONS.forEach(opt=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.ritual = opt.key;
    chip.textContent = opt.label;
    chip.addEventListener('click', ()=>{
      if(state.ritual === opt.key){
        state.ritual = null;
      } else {
        state.ritual = opt.key;
      }
      ritualChips.querySelectorAll('.chip').forEach(c=>{
        c.classList.toggle('active', c.dataset.ritual === state.ritual);
      });
      render();
    });
    ritualChips.appendChild(chip);
  });

  const schoolChips = document.getElementById('schoolChips');
  SCHOOL_ORDER.forEach(sch=>{
    if(!SPELLS_DATA.some(s=>s.school===sch)) return;
    const chip = document.createElement('div');
    chip.className='chip';
    chip.style.setProperty('--dotc', `var(--${sch})`);
    chip.style.setProperty('--chipc', `var(--${sch})`);
    chip.dataset.school = sch;
    chip.innerHTML = `<span class="dot"></span>${SCHOOL_LABEL[sch]}`;
    chip.addEventListener('click', ()=>{
      if(state.schools.has(sch)) state.schools.delete(sch);
      else state.schools.add(sch);
      chip.classList.toggle('active');
      render();
    });
    schoolChips.appendChild(chip);
  });

  initMobileFiltersCollapse();

  document.getElementById('clearSchools').addEventListener('click', ()=>{
    state.schools.clear();
    document.querySelectorAll('#schoolChips .chip').forEach(c=>c.classList.remove('active'));
    render();
  });
  document.getElementById('clearClasses').addEventListener('click', ()=>{
    state.classes.clear();
    document.querySelectorAll('#classChips .chip').forEach(el=>el.classList.remove('active'));
    render();
  });
  document.getElementById('clearLevels').addEventListener('click', ()=>{
    state.levels.clear();
    document.querySelectorAll('#levelChips .chip').forEach(el=>el.classList.remove('active'));
    render();
  });
  document.getElementById('clearSaves').addEventListener('click', ()=>{
    state.saves.clear();
    document.querySelectorAll('#saveChips .chip').forEach(el=>el.classList.remove('active'));
    render();
  });

  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.querySelector('.search-wrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  const syncSearchClearIcon = wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q)=>{ state.query = q; },
    render: ()=>render()
  });

  document.getElementById('clearAll').addEventListener('click', (e)=>{
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    syncSearchClearIcon();
    state.schools.clear();
    document.querySelectorAll('#schoolChips .chip').forEach(el=>el.classList.remove('active'));
    state.classes.clear();
    document.querySelectorAll('#classChips .chip').forEach(el=>el.classList.remove('active'));
    state.levels.clear();
    document.querySelectorAll('#levelChips .chip').forEach(el=>el.classList.remove('active'));
    state.saves.clear();
    document.querySelectorAll('#saveChips .chip').forEach(el=>el.classList.remove('active'));
    state.ritual = null;
    document.querySelectorAll('#ritualChips .chip').forEach(el=>el.classList.remove('active'));
    render();
  });

  wireSortSelect(state, ()=>render());

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

  function matchesQuery(spell, query){
    return matchesQueryOnBlob(spell._blob, query);
  }

  function cardHTML(s){
    const sch = s.school || 'universal';
    const cVar = `var(--${sch})`;
    const isOpen = state.open.has(s._idx);
    let displayLevel = s.min_level;
    if(state.classes.size){
      const match = s.level_entries.find(le=>state.classes.has(le.class));
      if(match) displayLevel = match.level;
    }
    const levelDisp = displayLevel===0 ? 'Cantrip' : `Lvl ${displayLevel}`;

    const statFields = [
      ['School', s.school],
      ['Descriptor', s.descriptor || ''],
      ['Casting Time', s.casting_time],
      ['Components', s.components],
      ['Range', s.range],
      ['Target', s.target || ''],
      ['Effect', s.effect || ''],
      ['Area', s.area || ''],
      ['Duration', s.duration],
      ['Save', s.save],
      ['SR', s.sr]
    ].filter(([label,val])=>val && val.length>0);

    const classesHTML = s.level_entries.map(le=>{
      const formula = le.damage_formula;
      if(!formula){
        return `<span class="class-pill">${escapeHtml(le.class)} ${le.level}</span>`;
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
    const ritualTagHTML = s.ritual ? `<span class="ritual-tag">Ritual</span>` : '';

    const descText = boldLeadingLabelText((s.description || '').trim());
    const heightenedText = (s.heightened && s.heightened.length) ? s.heightened.map(h=>{
      const m = h.match(/^\s*(\([^)]*\))\s*(.*)$/s);
      return m ? `**${m[1]}** ${boldLeadingLabelText(m[2])}` : boldLeadingLabelText(h);
    }).join('\n') : '';

    const roll20Text = buildRoll20Text(s, {description: descText, heightened: heightenedText});
    const roll20TagHTML = `<span class="ritual-tag roll20-tag copyable" data-copy="${escapeHtml(roll20Text)}">Copy</span>`;
    const badgesHTML = `<div class="spell-badges">${ritualTagHTML}</div>`;

    const descHtml = `<div class="spell-section-title-row"><div class="spell-section-title">Description</div>${badgesHTML}</div><div>${boldLeadingLabel((s.description || '').trim())}</div>`;

    const heightenedItemsHtml = (s.heightened && s.heightened.length) ? s.heightened.map(h=>{
      const m = h.match(/^\s*(\([^)]*\))\s*(.*)$/s);
      if(m) return `<div class="heightened-item"><b>${escapeHtml(m[1])}</b> ${boldLeadingLabel(m[2])}</div>`;
      return `<div class="heightened-item">${boldLeadingLabel(h)}</div>`;
    }).join('') : '';
    const heightenedCopyBlock = heightenedText ? `\n      <div class="heightened-block copyable" data-copy="${escapeHtml(heightenedText)}">\n        <div class="heightened-title">Heightened</div>\n        <div class="heightened-copy">${heightenedItemsHtml}</div>\n      </div>` : '';
    return `\n    <div class="spell-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${s._idx}">\n      <div class="spell-head" data-toggle="${s._idx}">\n        <div class="spell-title-block">\n          <span class="spell-name copyable" data-copy="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>\n          <span class="spell-meta-inline">${levelDisp}</span>\n          <span class="spell-school-tag">${escapeHtml(sch)}</span>\n        </div>\n        <div class="spell-right">\n          <span class="spell-classlevel-badge" title="${escapeHtml(shortDescInline)}">${escapeHtml(shortDescInline)}</span>\n          ${roll20TagHTML}\n          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>\n        </div>\n      </div>\n      <div class="spell-body">\n        <div class="stat-grid">\n          ${statFields.map(([l,v])=>`<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`).join('')}\n        </div>\n        <div class="classes-row">${classesHTML}</div>\n        <div class="desc-copy copyable" data-copy="${escapeHtml(descText)}">${descHtml}</div>${heightenedCopyBlock}\n      </div>\n    </div>`;
  }

  function filtered(){
    let list = SPELLS_DATA;
    if(state.query){
      list = list.filter(s=>matchesQuery(s, state.query));
    }
    if(state.schools.size){
      list = list.filter(s=>state.schools.has(s.school));
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
      list = list.filter(s=>!!s.ritual);
    } else if(state.ritual === 'no'){
      list = list.filter(s=>!s.ritual);
    }
    const sorted = list.slice();
    if(state.sort==='name'){
      sorted.sort((a,b)=>a.name.localeCompare(b.name));
    } else if(state.sort==='level'){
      sorted.sort((a,b)=>(a.min_level-b.min_level) || a.name.localeCompare(b.name));
    } else if(state.sort==='school'){
      sorted.sort((a,b)=>(a.school||'').localeCompare(b.school||'') || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Spell${results.length!==1?'s':''} Listed`;
    const listEl = document.getElementById('spellList');
    if(results.length===0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No spells found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    listEl.innerHTML = results.map(cardHTML).join('');
    wireCardToggle(listEl, state, 'spell-card', 'spell-name');
  }

  render();
})();

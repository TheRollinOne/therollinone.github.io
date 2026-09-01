(function(){
  const SCHOOL_ORDER = ['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation','universal'];
  const SCHOOL_LABEL = {abjuration:'Abjuration',conjuration:'Conjuration',divination:'Divination',enchantment:'Enchantment',evocation:'Evocation',illusion:'Illusion',necromancy:'Necromancy',transmutation:'Transmutation',universal:'Universal'};

  const state = {
    query:'',
    schools:new Set(),
    classes:new Set(),
    levels:new Set(),
    saves:new Set(),
    sort:'name',
    open:new Set()
  };

  document.getElementById('brandSub').textContent = `Spell Compendium · ${SPELLS_DATA.length} Spells`;

  SPELLS_DATA.forEach((s,i)=>{
    s._idx = i;
    s._blob = [
      s.name, s.school, s.level_raw, s.classes.join(' '), s.casting_time,
      s.components, s.range, s.target_effect_area, s.duration, s.save, s.sr,
      s.description, (s.heightened||[]).join(' ')
    ].join(' ').toLowerCase();
  });

  const allClasses = Array.from(new Set(SPELLS_DATA.flatMap(s=>s.classes))).sort();
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
    render();
  });

  wireSortSelect(state, ()=>render());

  wireCopyableList('spellList', 'spell-name');

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
      [s.target_effect_area ? s.target_effect_area.split(':')[0] : 'Target', s.target_effect_area ? s.target_effect_area.split(':').slice(1).join(':').trim() : ''],
      ['Duration', s.duration],
      ['Save', s.save],
      ['SR', s.sr]
    ].filter(([label,val])=>val && val.length>0);

    const classesHTML = s.level_entries.map(le=>`<span class="class-pill">${escapeHtml(le.class)} ${le.level}</span>`).join('');
    const classLevelInline = s.level_entries.map(le=>`${le.class} ${le.level}`).join(', ');
    const shortDescInline = s.short_description || classLevelInline;
    const ritualHTML = s.ritual ? `\n      <div class="heightened-block">\n        <div class="heightened-title">${escapeHtml(s.ritual)}</div>\n      </div>` : '';

    const descText = boldLeadingLabelText((s.description || '').trim());
    const heightenedText = (s.heightened && s.heightened.length) ? s.heightened.map(h=>{
      const m = h.match(/^\s*(\([^)]*\))\s*(.*)$/s);
      return m ? `**${m[1]}** ${boldLeadingLabelText(m[2])}` : boldLeadingLabelText(h);
    }).join('\n') : '';

    const descHtml = `<div>${boldLeadingLabel(s.description || '')}</div>`;

    const heightenedItemsHtml = (s.heightened && s.heightened.length) ? s.heightened.map(h=>{
      const m = h.match(/^\s*(\([^)]*\))\s*(.*)$/s);
      if(m) return `<div class="heightened-item"><b>${escapeHtml(m[1])}</b> ${boldLeadingLabel(m[2])}</div>`;
      return `<div class="heightened-item">${boldLeadingLabel(h)}</div>`;
    }).join('') : '';
    const heightenedCopyBlock = heightenedText ? `\n      <div class="heightened-block copyable" data-copy="${escapeHtml(heightenedText)}">\n        <div class="heightened-title">Heightened</div>\n        <div class="heightened-copy">${heightenedItemsHtml}</div>\n      </div>` : '';
    return `\n    <div class="spell-card${isOpen?' open':''}" style="--cardc:${cVar}" data-idx="${s._idx}">\n      <div class="spell-head" data-toggle="${s._idx}">\n        <div class="spell-title-block">\n          <span class="spell-name copyable" data-copy="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>\n          <span class="spell-meta-inline">${levelDisp}</span>\n          <span class="spell-school-tag">${escapeHtml(sch)}</span>\n        </div>\n        <div class="spell-right">\n          <span class="spell-classlevel-badge" title="${escapeHtml(shortDescInline)}">${escapeHtml(shortDescInline)}</span>\n          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>\n        </div>\n      </div>\n      <div class="spell-body">\n        <div class="stat-grid">\n          ${statFields.map(([l,v])=>`<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`).join('')}\n        </div>\n        <div class="classes-row">${classesHTML}</div>\n        ${ritualHTML}\n        <div class="desc-copy copyable" data-copy="${escapeHtml(descText)}">${descHtml}</div>${heightenedCopyBlock}\n      </div>\n    </div>`;
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
      list = list.filter(s=>s.classes.some(c=>state.classes.has(c)));
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

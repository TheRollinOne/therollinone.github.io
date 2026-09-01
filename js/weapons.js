(function(){
  function slugify(str){
    return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  const state = {
    query: '',
    proficiencies: new Set(),
    categories: new Set(),
    damageTypes: new Set(),
    specials: new Set(),
    weaponGroups: new Set(),
    criticals: new Set(),
    sort: 'name',
    open: new Set()
  };

  document.getElementById('brandSub').textContent = `Weapon Arsenal · ${WEAPONS_DATA.length} Weapons`;

  WEAPONS_DATA.forEach((w, i) => {
    w._idx = i;
    w._blob = [
      w.name, w.category, w.proficiency, (w.damage_type||[]).join(' '),
      (w.weapon_group||[]).join(' '), (w.special||[]).join(' '), w.description
    ].filter(Boolean).join(' ').toLowerCase();
  });

  initMobileFiltersCollapse();

  const proficiencyChips = document.getElementById('proficiencyChips');
  proficiencyChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.proficiency;
      if (state.proficiencies.has(val)) state.proficiencies.delete(val);
      else state.proficiencies.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearProficiencies').addEventListener('click', () => {
    state.proficiencies.clear();
    proficiencyChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const categoryChips = document.getElementById('categoryChips');
  categoryChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.category;
      if (state.categories.has(val)) state.categories.delete(val);
      else state.categories.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearCategories').addEventListener('click', () => {
    state.categories.clear();
    categoryChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const damageTypeChips = document.getElementById('damageTypeChips');
  damageTypeChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.damageType;
      if (state.damageTypes.has(val)) state.damageTypes.delete(val);
      else state.damageTypes.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearDamageTypes').addEventListener('click', () => {
    state.damageTypes.clear();
    damageTypeChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const criticalChips = document.getElementById('criticalChips');
  criticalChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.critical;
      if (state.criticals.has(val)) state.criticals.delete(val);
      else state.criticals.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearCritical').addEventListener('click', () => {
    state.criticals.clear();
    criticalChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const weaponGroupChips = document.getElementById('weaponGroupChips');
  weaponGroupChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.weaponGroup;
      if (state.weaponGroups.has(val)) state.weaponGroups.delete(val);
      else state.weaponGroups.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearWeaponGroups').addEventListener('click', () => {
    state.weaponGroups.clear();
    weaponGroupChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const specialChips = document.getElementById('specialChips');
  specialChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.special;
      if (state.specials.has(val)) state.specials.delete(val);
      else state.specials.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearSpecial').addEventListener('click', () => {
    state.specials.clear();
    specialChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.getElementById('searchWrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q) => { state.query = q; },
    render: () => render()
  });

  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    searchWrapEl.classList.remove('has-query');
    state.proficiencies.clear();
    proficiencyChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    state.categories.clear();
    categoryChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    state.damageTypes.clear();
    damageTypeChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    state.criticals.clear();
    criticalChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    state.weaponGroups.clear();
    weaponGroupChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    state.specials.clear();
    specialChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  wireSortSelect(state, () => render());

  wireCopyableList('weaponList', 'weapon-name');

  function matchesQuery(weapon, query) {
    return matchesQueryOnBlob(weapon._blob, query);
  }

  function parseLeadingNumber(str){
    const n = parseFloat(str);
    return Number.isNaN(n) ? Infinity : n;
  }

  function rangeIncrementText(w){
    if (!w.range_increment || !w.range_increment.range) return '';
    return w.range_increment.type
      ? `${w.range_increment.range} (${w.range_increment.type})`
      : w.range_increment.range;
  }

  function buildStatFields(w){
    return [
      ['Cost', w.cost],
      ['Weight', w.weight],
      ['Damage Medium', w.damage && w.damage.medium],
      ['Damage Small', w.damage && w.damage.small],
      ['Critical', w.critical],
      ['Damage Type', (w.damage_type||[]).join(', ')],
      ['Range Increment', rangeIncrementText(w)],
      ['Category', w.category],
      ['Proficiency', w.proficiency],
      ['Weapon Groups', (w.weapon_group||[]).join(', ')],
      ['Special', (w.special||[]).join(', ')],
    ].filter(([, val]) => val && val.length > 0);
  }

  function cardHTML(w){
    const slug = slugify(w.category);
    const cardStyle = slug ? ` style="--cardc:var(--cat-${slug})"` : '';
    const isOpen = state.open.has(w._idx);

    const proficiencyTagHtml = w.proficiency ? `<span class="weapon-proficiency-tag">${escapeHtml(w.proficiency)}</span>` : '';
    const categoryTagHtml = w.category ? `<span class="weapon-category-tag">${escapeHtml(w.category)}</span>` : '';
    const weaponGroupsText = (w.weapon_group||[]).join(', ');

    const statFields = buildStatFields(w);
    const statGridHtml = statFields.map(([l,v]) =>
      `<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`
    ).join('');

    const descText = boldLeadingLabelText(w.description || '');
    const descHtml = w.description ? `
      <div class="weapon-section copyable" data-copy="${escapeHtml(descText)}">
        <div class="weapon-section-title">Description</div>
        <div class="weapon-desc"><div>${boldLeadingLabel(w.description)}</div></div>
      </div>` : '';

    return `
    <div class="weapon-card${isOpen?' open':''}"${cardStyle} data-idx="${w._idx}">
      <div class="weapon-head" data-toggle="${w._idx}">
        <div class="weapon-title-block">
          <span class="weapon-name copyable" data-copy="${escapeHtml(w.name)}">${escapeHtml(w.name)}</span>
          ${proficiencyTagHtml}
          ${categoryTagHtml}
        </div>
        <div class="weapon-right">
          <span class="weapon-badge" title="${escapeHtml(weaponGroupsText)}">${escapeHtml(weaponGroupsText)}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="weapon-body">
        <div class="stat-grid">${statGridHtml}</div>
        ${descHtml}
      </div>
    </div>`;
  }

  function filtered(){
    let list = WEAPONS_DATA;
    if (state.query) {
      list = list.filter(w => matchesQuery(w, state.query));
    }
    if (state.proficiencies.size) {
      list = list.filter(w => state.proficiencies.has(w.proficiency));
    }
    if (state.categories.size) {
      list = list.filter(w => state.categories.has(w.category));
    }
    if (state.damageTypes.size) {
      list = list.filter(w => (w.damage_type||[]).some(t => state.damageTypes.has(t)));
    }
    if (state.criticals.size) {
      list = list.filter(w => state.criticals.has(w.critical));
    }
    if (state.weaponGroups.size) {
      list = list.filter(w => (w.weapon_group||[]).some(g => state.weaponGroups.has(g)));
    }
    if (state.specials.size) {
      list = list.filter(w => (w.special||[]).some(s => state.specials.has(s)));
    }
    const sorted = list.slice();
    if (state.sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'cost') {
      sorted.sort((a, b) => parseLeadingNumber(a.cost) - parseLeadingNumber(b.cost) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight') {
      sorted.sort((a, b) => parseLeadingNumber(a.weight) - parseLeadingNumber(b.weight) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Weapon${results.length !== 1 ? 's' : ''} Listed`;
    const listEl = document.getElementById('weaponList');
    if (results.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><span class="big">No weapons found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    listEl.innerHTML = results.map(cardHTML).join('');
    wireCardToggle(listEl, state, 'weapon-card', 'weapon-name');
  }

  render();
})();

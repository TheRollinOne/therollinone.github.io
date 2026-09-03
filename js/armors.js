(function(){
  const state = {
    query: '',
    categories: new Set(),
    armorBonuses: new Set(),
    maxDexes: new Set(),
    acps: new Set(),
    spellFailures: new Set(),
    sort: 'name',
    open: new Set()
  };

  if (typeof ARMORS_DATA !== 'undefined') {
    document.getElementById('brandSub').textContent = `Armor Catalogue · ${ARMORS_DATA.length} Armors`;
    ARMORS_DATA.forEach((a, i) => {
      a._idx = i;
      a._blob = [
        a.name, a.category, a.armor_bonus, a.max_dex, a.acp, a.spell_failure, a.description
      ].filter(Boolean).join(' ').toLowerCase();
    });
  }

  initMobileFiltersCollapse();
  initThemeToggle();

  // Categories, Armor Bonus, Max Dexterity, Armor Check Penalty, and
  // Arcana Spell Failure all follow the same "toggle a chip -> toggle a
  // value in a Set" shape, each wired against its own state field/
  // container/clear-button trio.
  const chipGroups = [
    { key: 'categories', containerId: 'categoryChips', clearId: 'clearCategories', dataAttr: 'category' },
    { key: 'armorBonuses', containerId: 'armorBonusChips', clearId: 'clearArmorBonus', dataAttr: 'armorBonus' },
    { key: 'maxDexes', containerId: 'maxDexChips', clearId: 'clearMaxDex', dataAttr: 'maxDex' },
    { key: 'acps', containerId: 'acpChips', clearId: 'clearACP', dataAttr: 'acp' },
    { key: 'spellFailures', containerId: 'spellFailureChips', clearId: 'clearSpellFailure', dataAttr: 'spellFailure' }
  ];

  chipGroups.forEach(group => {
    group.containerEl = document.getElementById(group.containerId);
    group.containerEl.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset[group.dataAttr];
        const set = state[group.key];
        if (set.has(val)) set.delete(val);
        else set.add(val);
        chip.classList.toggle('active');
        render();
      });
    });
    document.getElementById(group.clearId).addEventListener('click', () => {
      state[group.key].clear();
      group.containerEl.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
      render();
    });
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
    chipGroups.forEach(group => {
      state[group.key].clear();
      group.containerEl.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    });
    render();
  });

  wireSortSelect(state, () => render());

  wireCopyableList('armorList', 'armor-name');

  function matchesQuery(armor, query) {
    return matchesQueryOnBlob(armor._blob, query);
  }

  function parseLeadingNumber(str){
    const n = parseFloat(str);
    return Number.isNaN(n) ? -1 : n;
  }

  // Maps a raw category string ("Light Armor", "Shield", ...) to the CSS
  // color-variable slug defined in armors.css (--cat-light, --cat-shield, ...).
  function categoryColorSlug(category){
    return (category || '').toLowerCase().replace(/\s*armor\s*$/, '').trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  function speedReductionText(a){
    const has30 = a.speed_30ft && a.speed_30ft.length > 0;
    const has20 = a.speed_20ft && a.speed_20ft.length > 0;
    if (has30 && has20) return `${a.speed_30ft}/${a.speed_20ft}`;
    if (has30) return a.speed_30ft;
    if (has20) return a.speed_20ft;
    return '';
  }

  function buildStatFields(a){
    return [
      ['Armor Bonus', a.armor_bonus],
      ['Max Dexterity', a.max_dex === '+0' ? '—' : a.max_dex],
      ['Armor Check Penalty', a.acp],
      ['Arcane Spell Failure', a.spell_failure],
      ['Speed Reduction 30/20', speedReductionText(a)],
      ['Cost', a.cost],
      ['Weight', a.weight],
    ].filter(([, val]) => val && val.length > 0);
  }

  // Max Dex / ACP sometimes hold non-numeric text ("See Text", "special");
  // the header quick-stats only ever show a real number there, "—" otherwise.
  function numericOrDash(val){
    return (val && /\d/.test(val)) ? val : '—';
  }

  function quickStatsHTML(a){
    const boxes = [
      ['Bonus', numericOrDash(a.armor_bonus)],
      ['Max Dex', a.max_dex === '+0' ? '—' : numericOrDash(a.max_dex)],
      ['ACP', numericOrDash(a.acp)],
      ['S.F.', a.spell_failure === '0%' ? '—' : (a.spell_failure || '—')],
      ['Cost', (a.cost || '').replace(/\s*gp?\.?/i, '') || '—'],
      ['Weight', (a.weight || '').replace(/\s*lbs?\.?/i, '') || '—'],
    ];
    return `<div class="armor-quick-stats">${boxes.map(([l, v]) =>
      `<div class="armor-quick-stat"><div class="armor-quick-stat-label">${escapeHtml(l)}</div><div class="armor-quick-stat-value">${escapeHtml(v)}</div></div>`
    ).join('')}</div>`;
  }

  function cardHTML(a){
    const slug = categoryColorSlug(a.category);
    const cardStyle = slug ? ` style="--cardc:var(--cat-${slug})"` : '';
    const isOpen = state.open.has(a._idx);

    const categoryTagHtml = a.category ? `<span class="armor-category-tag">${escapeHtml(a.category)}</span>` : '';

    const statFields = buildStatFields(a);
    const statGridHtml = statFields.map(([l,v]) =>
      `<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`
    ).join('');

    const descText = boldLeadingLabelText(a.description || '');
    const descHtml = a.description ? `
      <div class="armor-section copyable" data-copy="${escapeHtml(descText)}">
        <div class="armor-section-title">Description</div>
        <div class="armor-desc"><div>${boldLeadingLabel(a.description)}</div></div>
      </div>` : '';

    return `
    <div class="armor-card${isOpen?' open':''}"${cardStyle} data-idx="${a._idx}">
      <div class="armor-head" data-toggle="${a._idx}">
        <div class="armor-title-block">
          <span class="armor-name copyable" data-copy="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
          ${categoryTagHtml}
        </div>
        <div class="armor-right">
          ${quickStatsHTML(a)}
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="armor-body">
        <div class="stat-grid">${statGridHtml}</div>
        ${descHtml}
      </div>
    </div>`;
  }

  function filtered(){
    if (typeof ARMORS_DATA === 'undefined') return [];
    let list = ARMORS_DATA;
    if (state.query) {
      list = list.filter(a => matchesQuery(a, state.query));
    }
    if (state.categories.size) {
      list = list.filter(a => state.categories.has(a.category));
    }
    if (state.armorBonuses.size) {
      list = list.filter(a => state.armorBonuses.has(a.armor_bonus));
    }
    if (state.maxDexes.size) {
      list = list.filter(a => state.maxDexes.has(a.max_dex));
    }
    if (state.acps.size) {
      list = list.filter(a => state.acps.has(a.acp));
    }
    if (state.spellFailures.size) {
      list = list.filter(a => state.spellFailures.has(a.spell_failure));
    }
    const sorted = list.slice();
    if (state.sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'cost') {
      sorted.sort((a, b) => parseLeadingNumber(a.cost) - parseLeadingNumber(b.cost) || a.name.localeCompare(b.name));
    } else if (state.sort === 'cost_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.cost) - parseLeadingNumber(a.cost) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight') {
      sorted.sort((a, b) => parseLeadingNumber(a.weight) - parseLeadingNumber(b.weight) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.weight) - parseLeadingNumber(a.weight) || a.name.localeCompare(b.name));
    } else if (state.sort === 'armor_bonus') {
      sorted.sort((a, b) => parseLeadingNumber(a.armor_bonus) - parseLeadingNumber(b.armor_bonus) || a.name.localeCompare(b.name));
    } else if (state.sort === 'armor_bonus_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.armor_bonus) - parseLeadingNumber(a.armor_bonus) || a.name.localeCompare(b.name));
    } else if (state.sort === 'max_dex') {
      sorted.sort((a, b) => parseLeadingNumber(a.max_dex) - parseLeadingNumber(b.max_dex) || a.name.localeCompare(b.name));
    } else if (state.sort === 'max_dex_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.max_dex) - parseLeadingNumber(a.max_dex) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    if (typeof ARMORS_DATA === 'undefined') return;
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Armor${results.length !== 1 ? 's' : ''} & Shield${results.length !== 1 ? 's' : ''} Listed`;
    const listEl = document.getElementById('armorList');
    if (results.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><span class="big">No armor found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    listEl.innerHTML = results.map(cardHTML).join('');
    wireCardToggle(listEl, state, 'armor-card', 'armor-name');
  }

  render();
})();

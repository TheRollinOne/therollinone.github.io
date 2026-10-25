(function(){
  // Canonical display order for the category chips
  const CATEGORY_ORDER = ['Unarmed', 'Light', 'One-Handed', 'Two-Handed', 'Ranged', 'Ammunition'];

  const state = {
    query: '',
    searchScope: SEARCH_SCOPE_NAMES,
    proficiencies: new Set(),
    categories: new Set(),
    damageTypes: new Set(),
    specials: new Set(),
    weaponGroups: new Set(),
    criticals: new Set(),
    sort: 'name',
    open: new Set()
  };

  setBrandSub('Weapon Arsenal', WEAPONS_DATA.length, 'Weapons');

  WEAPONS_DATA.forEach((w, i) => {
    w._idx = i;
    w._category = w.category ? formatTitleCase(w.category) : '';
    w._nameBlob = (w.name || '').toLowerCase();
    w._blob = [
      w.name, w._category, w.proficiency, (w.damage_type||[]).join(' '),
      (w.weapon_group||[]).join(' '), (w.special||[]).join(' '), w.description
    ].filter(Boolean).join(' ').toLowerCase();
  });

  const categoryColorOf = buildTypeColorMap(WEAPONS_DATA.map(w => w._category).filter(Boolean), CATEGORY_ORDER);
  WEAPONS_DATA.forEach(w => { w._cardColor = categoryColorOf[w._category]; });

  initPageChrome();

  // Static chip groups: each toggles a value in its own Set.
  const chipResets = [
    wireChipSet({ container: 'proficiencyChips', set: state.proficiencies, dataAttr: 'proficiency', clearId: 'clearProficiencies', render }),
    wireChipSet({ container: 'damageTypeChips', set: state.damageTypes, dataAttr: 'damageType', clearId: 'clearDamageTypes', render }),
    wireChipSet({ container: 'criticalChips', set: state.criticals, dataAttr: 'critical', clearId: 'clearCritical', render }),
    wireChipSet({ container: 'weaponGroupChips', set: state.weaponGroups, dataAttr: 'weaponGroup', clearId: 'clearWeaponGroups', render }),
    wireChipSet({ container: 'specialChips', set: state.specials, dataAttr: 'special', clearId: 'clearSpecial', render })
  ];

  // Category chips are generated dynamically (colors depend on the data).
  chipResets.push(buildColorChips(categoryColorOf, state.categories, 'categoryChips', {
    dataAttr: 'category', clearId: 'clearCategories', render
  }));

  const search = initSearch({ state, render, example: 'longsword +slashing -reach' });

  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    search.reset();
    chipResets.forEach(reset => reset());
    render();
  });

  const syncSortButtons = wireSortBar(state, render);

  wireCopyableList('weaponList', 'weapon-name');

  const queryMatch = createQueryMatcher();
  function matchesQuery(weapon, query) {
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? weapon._blob : weapon._nameBlob, query);
  }

  // Price is an integer/number; a missing price sorts before everything else.
  function priceValue(w){
    return typeof w.price === 'number' ? w.price : -1;
  }

  function rangeIncrementText(w){
    if (!w.range_increment || !w.range_increment.range) return '';
    return w.range_increment.type
      ? `${w.range_increment.range} (${w.range_increment.type})`
      : w.range_increment.range;
  }

  function damageTypeAbbrev(types){
    const map = { bludgeoning: 'B', slashing: 'S', piercing: 'P' };
    return (types||[]).map(t => map[t] || t).join('/');
  }

  function damageQuickText(w){
    const med = w.damage && w.damage.medium;
    const small = w.damage && w.damage.small;
    if (med && small) return `${med}/${small}`;
    if (med) return med;
    if (small) return small;
    return '';
  }

  function weaponQuickStats(w){
    return quickStatsHTML([
      ['Proficiency', w.proficiency || '—', ''],
      ['Damage', damageQuickText(w) || '—', ''],
      ['Type', damageTypeAbbrev(w.damage_type) || '—', ' type'],
      ['Critical', w.critical || '—', ''],
    ]);
  }

  function buildStatFields(w){
    return [
      ['Damage Medium', w.damage && w.damage.medium],
      ['Damage Small', w.damage && w.damage.small],
      ['Critical', w.critical],
      ['Damage Type', (w.damage_type||[]).join(', ')],
      ['Proficiency', w.proficiency],
      ['Category', w._category],
      ['Weapon Groups', (w.weapon_group||[]).join(', ')],
      ['Range Increment', rangeIncrementText(w)],
      ['Special', (w.special||[]).join(', ')],
      ['Price', formatGp(w.price)],
      ['Weight', w.weight],
    ].filter(([, val]) => val && val.length > 0);
  }

  function cardHTML(w){
    const cardStyle = w._cardColor ? ` style="--cardc:${w._cardColor}"` : '';
    const isOpen = state.open.has(w._idx);

    const categoryTagHtml = w._category ? `<span class="entry-tag">${escapeHtml(w._category)}</span>` : '';
    const weaponGroupsText = (w.weapon_group||[]).join(', ');
    const weaponGroupTagHtml = weaponGroupsText ? `<span class="entry-badge weapon-group-tag">${escapeHtml(weaponGroupsText)}</span>` : '';

    const statFields = buildStatFields(w);
    const statGridHtml = statFields.map(([l,v]) =>
      `<div class="stat copyable" data-copy="${escapeHtml(v)}"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${escapeHtml(v)}</div></div>`
    ).join('');

    const descText = clipboardFormatText(w.description);
    const descHtml = w.description ? `
      <div class="entry-section copyable" data-copy="${escapeHtml(descText)}">
        <div class="entry-section-title">Description</div>
        <div class="entry-desc"><div>${htmlFormatDescription(w.description)}</div></div>
      </div>` : '';

    return `
    <div class="entry-card entry-card--stats weapon-card${isOpen?' open':''}"${cardStyle} data-idx="${w._idx}">
      <div class="entry-head" data-toggle="${w._idx}">
        <div class="entry-title-block">
          <span class="entry-name weapon-name copyable" data-copy="${escapeHtml(w.name)}">${escapeHtml(w.name)}</span>
          ${weaponGroupTagHtml}
          ${categoryTagHtml}
        </div>
        <div class="entry-right">
          ${weaponQuickStats(w)}
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body">
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
      list = list.filter(w => state.categories.has(w._category));
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
    } else if (state.sort === 'name_desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (state.sort === 'category_desc') {
      sorted.sort((a, b) => (b._category || '').localeCompare(a._category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'category') {
      sorted.sort((a, b) => (a._category || '').localeCompare(b._category || '') || a.name.localeCompare(b.name));
    } else if (state.sort === 'price') {
      sorted.sort((a, b) => priceValue(a) - priceValue(b) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight') {
      sorted.sort((a, b) => parseLeadingNumber(a.weight) - parseLeadingNumber(b.weight) || a.name.localeCompare(b.name));
    } else if (state.sort === 'price_desc') {
      sorted.sort((a, b) => priceValue(b) - priceValue(a) || a.name.localeCompare(b.name));
    } else if (state.sort === 'weight_desc') {
      sorted.sort((a, b) => parseLeadingNumber(b.weight) - parseLeadingNumber(a.weight) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function render(){
    syncSortButtons();
    const results = filtered();
    setListTitle(results.length, 'Weapon');
    renderList({
      state, results, listId: 'weaponList', cardHTML,
      cardClass: 'weapon-card', nameClass: 'weapon-name',
      emptyNoun: 'weapons', labelPlural: 'Weapons', rerender: render
    });
  }

  render();
})();

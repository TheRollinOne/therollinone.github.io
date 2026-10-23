(function(){
  // Canonical display order for the type chips (matches the old
  // --type-<name> var order in monsters.css — already alphabetical).
  // Any type present in the data that isn't listed here is appended
  // afterward, alphabetically.
  const TYPE_ORDER = ['Aberration', 'Animal', 'Construct', 'Dragon', 'Fey', 'Humanoid', 'Magical Beast', 'Monstrous Humanoid', 'Ooze', 'Outsider', 'Plant', 'Undead', 'Vermin'];

  // MONSTERS holds slim list records (see build-monsters.js). It starts with
  // the inlined (Paizo) entries; third-party entries are appended by load3pp()
  // the first time the Publishers filter needs them. The full stat blocks live
  // in chunked files (data/monsters-<N>.js) loaded the first time a card in
  // that chunk is opened; chunk order = index order (Paizo first, then 3pp).
  const MONSTERS = (typeof MONSTERS_DATA !== 'undefined') ? MONSTERS_DATA.slice() : [];
  const META = (typeof MONSTERS_DATA_META !== 'undefined') ? MONSTERS_DATA_META : null;

  // ---- Lazy-loaded full records ----
  const CH = (META && META.chunkSize) || 20;
  const chunkPromises = {};
  function loadChunk(c){
    return chunkPromises[c] || (chunkPromises[c] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = META['c' + c];
      s.onload = () => res(window['MONSTER_CHUNK_' + c]);
      s.onerror = () => { delete chunkPromises[c]; s.remove(); rej(new Error('chunk ' + c)); };
      document.head.appendChild(s);
    }));
  }
  // Full record + the fields prepare() derived on the slim record (_type, ...).
  function loadDetail(idx){
    return loadChunk(Math.floor(idx / CH)).then(arr => Object.assign({}, arr[idx % CH], MONSTERS[idx]));
  }
  function hydrate(idx, card){
    const body = card.querySelector('.entry-body');
    if(!body || body.dataset.ready) return;
    body.innerHTML = '<div class="entry-desc">Loading…</div>';
    loadDetail(idx)
      .then(full => { body.innerHTML = bodyHTML(full); body.dataset.ready = '1'; })
      .catch(() => { body.innerHTML = '<div class="entry-desc">Could not load details.</div>'; });
  }

  // Colors are computed from whatever types are actually present in the
  // (initially-loaded) data, title-cased so inconsistent source casing
  // doesn't produce duplicate entries.
  const typeColorOf = buildTypeColorMap(MONSTERS.map(m => formatTitleCase(m.type)), TYPE_ORDER);

  const state = {
    query: '',
    searchScope: SEARCH_SCOPE_NAMES,
    cr: { operator: '', v1: null, v2: null },
    hd: { operator: '', v1: null, v2: null },
    types: new Set(),
    subtype: '',
    sizes: new Set(),
    env: { group: '', option: '' },
    movements: new Set(),
    spellcasting: new Set(),
    publishers: new Set(['paizo']),
    sort: 'name',
    open: new Set()
  };

  document.getElementById('brandSub').textContent = `Monster Bestiary · ${MONSTERS.length + (META ? META.count3pp : 0)} Monsters`;

  // Indexes/search blobs are computed per monster so late-loaded entries can
  // reuse this. Indexes are stable (Paizo first, 3pp appended), so open-card
  // state survives the lazy load.
  function prepare(m, i){
    m._idx = i;
    m._type = formatTitleCase(m.type);
    m._cardColor = typeColorOf[m._type];
    m._envLC = (m.environments || []).map(e => String(e).toLowerCase());
    m._nameBlob = (m.name || '').toLowerCase();
    // The "All Fields" search blob is precomputed at build time
    // (buildBlob in build-monsters.js).
    m._blob = m.blob || '';
  }
  MONSTERS.forEach(prepare);

  initMobileFiltersCollapse();
  initThemeToggle();

  // ---- Numeric range filters (Challenge Rating, Hit Dice) ----
  // wireRangeFilter/matchesRange are shared helpers in base.js.
  const crFilter = wireRangeFilter({
    rangeState: state.cr,
    operatorId: 'crOperatorSelect',
    input1Id: 'crInput1',
    andId: 'crAndSpan',
    input2Id: 'crInput2',
    clearId: 'clearCR',
    render
  });

  const hdFilter = wireRangeFilter({
    rangeState: state.hd,
    operatorId: 'hdOperatorSelect',
    input1Id: 'hdInput1',
    andId: 'hdAndSpan',
    input2Id: 'hdInput2',
    clearId: 'clearHD',
    render
  });

  // ---- Type filter ----
  const typeChips = document.getElementById('typeChips');
  Object.keys(typeColorOf).forEach(type => {
    const color = typeColorOf[type];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.setProperty('--dotc', color);
    chip.style.setProperty('--chipc', color);
    chip.dataset.type = type;
    chip.innerHTML = `<span class="dot"></span>${escapeHtml(type)}`;
    chip.addEventListener('click', () => {
      if (state.types.has(type)) state.types.delete(type);
      else state.types.add(type);
      chip.classList.toggle('active');
      render();
    });
    typeChips.appendChild(chip);
  });
  document.getElementById('clearTypes').addEventListener('click', () => {
    state.types.clear();
    typeChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  // ---- Subtype filter (single select; options are rebuilt on every
  // render() from whatever subtypes are present in the base-filtered set —
  // see updateSubtypeOptions()) ----
  const subtypeSelect = document.getElementById('subtypeSelect');
  subtypeSelect.addEventListener('change', () => {
    state.subtype = subtypeSelect.value;
    render();
  });
  document.getElementById('clearSubtype').addEventListener('click', () => {
    state.subtype = '';
    subtypeSelect.value = '';
    render();
  });

  // ---- Size filter (multi-select, plain gold-when-active chips) ----
  const sizeChips = document.getElementById('sizeChips');
  sizeChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.size;
      if (state.sizes.has(val)) state.sizes.delete(val);
      else state.sizes.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearSize').addEventListener('click', () => {
    state.sizes.clear();
    sizeChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  // ---- Environment filter (two linked selects) ----
  // Environment strings in the data look like "any hills" / "temperate air":
  // a climate word plus a terrain word. Each option below lists the terrain
  // words ("t") it matches. A group's "Any" choice matches every terrain word
  // any of its options uses (plus "self" words and "implicit" words).
  // "implicit" words are added to every choice of the group, so a monster
  // listed as "any land" still shows up under Land > Plains, Hills, etc.
  const ENV_GROUPS = {
    'air': { options: [
      { v:'air',    l:'Air',    t:['air'] },
      { v:'vacuum', l:'Vacuum', t:['vacuum'] }
    ]},
    'land': { implicit: ['land'], options: [
      { v:'deserts',   l:'Deserts',   t:['deserts'] },
      { v:'forests',   l:'Forests',   t:['forests'] },
      { v:'hills',     l:'Hills',     t:['hills'] },
      { v:'jungles',   l:'Jungles',   t:['jungles'] },
      { v:'marshes',   l:'Marshes',   t:['marshes'] },
      { v:'mountains', l:'Mountains', t:['mountains'] },
      { v:'plains',    l:'Plains',    t:['plains'] },
      { v:'swamps',    l:'Swamps',    t:['swamps'] }
    ]},
    'man-made': { self: ['man-made'], options: [
      { v:'ruins', l:'Ruins', t:['ruins'] },
      { v:'urban', l:'Urban', t:['urban'] }
    ]},
    'underground': { self: ['underground'], options: [] },   // no secondary list
    'water': { options: [
      { v:'aquatic', l:'Aquatic', t:['aquatic'] },
      { v:'coastal', l:'Coastal', t:['coastlines','coasts','shores','islands'] },
      { v:'lakes',   l:'Lakes',   t:['lakes'] },
      { v:'oceans',  l:'Oceans',  t:['oceans'] },
      { v:'rivers',  l:'Rivers',  t:['rivers'] },
      { v:'water',   l:'Water',   t:['water'] }
    ]}
  };

  const envGroupSelect = document.getElementById('envGroupSelect');
  const envOptionSelect = document.getElementById('envOptionSelect');

  // The second select is always visible but stays disabled until a group is
  // chosen (and for groups with no secondary list, e.g. Underground) —
  // same behavior as the Classes filter on the NPC page.
  function syncEnvOptions(){
    const g = ENV_GROUPS[state.env.group];
    const opts = g ? g.options : [];
    envOptionSelect.innerHTML = '<option value="">Any</option>' +
      opts.map(o => `<option value="${escapeHtml(o.v)}">${escapeHtml(o.l)}</option>`).join('');
    sortSelectOptions(envOptionSelect);
    envOptionSelect.value = state.env.option;
    envOptionSelect.hidden = false;
    envOptionSelect.disabled = !opts.length;
  }
  syncEnvOptions();
  envGroupSelect.addEventListener('change', () => {
    state.env.group = envGroupSelect.value;
    state.env.option = '';
    syncEnvOptions();
    render();
  });
  envOptionSelect.addEventListener('change', () => {
    state.env.option = envOptionSelect.value;
    render();
  });
  function resetEnvFilter(){
    state.env.group = '';
    state.env.option = '';
    envGroupSelect.value = '';
    syncEnvOptions();
  }
  document.getElementById('clearEnvironment').addEventListener('click', () => {
    resetEnvFilter();
    render();
  });

  // Compiled whole-word regex for the current environment choice (cached).
  let envRxKey = null, envRx = null;
  function currentEnvRegex(){
    const key = state.env.group + '|' + state.env.option;
    if(key === envRxKey) return envRx;
    envRxKey = key;
    const g = ENV_GROUPS[state.env.group];
    let terms = [];
    if(g){
      if(state.env.option){
        const o = g.options.find(x => x.v === state.env.option);
        if(o) terms = terms.concat(o.t);
      } else {
        g.options.forEach(o => { terms = terms.concat(o.t); });
        terms = terms.concat(g.self || []);
      }
      terms = terms.concat(g.implicit || []);
    }
    envRx = terms.length
      ? new RegExp('\\b(?:' + terms.map(escapeRegExp).join('|') + ')\\b')
      : null;
    return envRx;
  }
  function matchesEnvironment(monster){
    if(!state.env.group) return true;
    const rx = currentEnvRegex();
    if(!rx) return true;
    return monster._envLC.some(e => rx.test(e));
  }

  // ---- Movement filter (multi-select, plain gold-when-active chips) ----
  const movementChips = document.getElementById('movementChips');
  movementChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.movement;
      if (state.movements.has(val)) state.movements.delete(val);
      else state.movements.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearMovement').addEventListener('click', () => {
    state.movements.clear();
    movementChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  // ---- Spellcasting filter (multi-select, plain gold-when-active chips) ----
  const spellcastingChips = document.getElementById('spellcastingChips');
  spellcastingChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.spellcasting;
      if (state.spellcasting.has(val)) state.spellcasting.delete(val);
      else state.spellcasting.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearSpellcasting').addEventListener('click', () => {
    state.spellcasting.clear();
    spellcastingChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  // ---- Publishers filter (multi-select, plain gold-when-active chips;
  // Paizo is active by default so 3pp sources are hidden until opted in) ----
  const publisherChips = document.getElementById('publisherChips');
  publisherChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.publisher;
      if (state.publishers.has(val)) state.publishers.delete(val);
      else state.publishers.add(val);
      chip.classList.toggle('active');
      render();
    });
  });
  document.getElementById('clearPublishers').addEventListener('click', () => {
    state.publishers.clear();
    publisherChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
    render();
  });

  // ---- Search ----
  const searchInputEl = document.getElementById('searchInput');
  const searchWrapEl = document.getElementById('searchWrap');
  const searchClearIcon = document.getElementById('searchClearIcon');
  wireSearchInput({
    inputEl: searchInputEl,
    wrapEl: searchWrapEl,
    clearIconEl: searchClearIcon,
    onQuery: (q) => { state.query = q; },
    render: () => render(),
    debounceMs: 250 // short pause after typing stops, so fast typing doesn't lag
  });

  // ---- Search help tooltip (hover; hidden while the box has focus) ----
  wireSearchTooltip(searchInputEl, searchWrapEl, 'demon +regeneration -grab +aquan', { prefix: true });
  initSearchScope(searchWrapEl, (scope) => { state.searchScope = scope; render(); });

  // ---- Clear all ----
  document.getElementById('clearAll').addEventListener('click', (e) => {
    e.stopPropagation();
    state.query = '';
    searchInputEl.value = '';
    searchWrapEl.classList.remove('has-query');

    state.cr.operator = ''; state.cr.v1 = null; state.cr.v2 = null;
    crFilter.operatorSelect.value = ''; crFilter.input1.value = ''; crFilter.input2.value = '';
    crFilter.syncVisibility();

    state.hd.operator = ''; state.hd.v1 = null; state.hd.v2 = null;
    hdFilter.operatorSelect.value = ''; hdFilter.input1.value = ''; hdFilter.input2.value = '';
    hdFilter.syncVisibility();

    state.types.clear();
    typeChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));

    state.subtype = '';
    subtypeSelect.value = '';

    state.sizes.clear();
    sizeChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));

    resetEnvFilter();

    state.movements.clear();
    movementChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));

    state.spellcasting.clear();
    spellcastingChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));

    // Publishers are intentionally left untouched by "clear all";
    // they only reset via their own "clear" button.

    render();
  });

// ---- Sort (header buttons) ----
  document.querySelectorAll('#sortBar .sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      render();
    });
  });
  function syncSortButtons(){
    document.querySelectorAll('#sortBar .sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === state.sort));
  }

  wireCopyableList('monsterList', 'monster-name');

  const queryMatch = createQueryMatcher({ prefix: true });
  function matchesQuery(monster, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? monster._blob : monster._nameBlob, query);
  }

  function matchesSpellcasting(monster){
    if(!state.spellcasting.size) return true;
    // `sc` = precomputed flags (none / spell_like / prepared / spontaneous),
    // see scFlags() in build-monsters.js.
    return (monster.sc || []).some(f => state.spellcasting.has(f));
  }

  function matchesPublisher(monster){
    if(!state.publishers.size) return true;
    const source = (monster.source || '').toLowerCase();
    const is3pp = source.includes('3pp');
    if(state.publishers.has('paizo') && !is3pp) return true;
    if(state.publishers.has('3pp') && is3pp) return true;
    return false;
  }

  // Every filter except Subtype — this is the population the Subtype
  // dropdown's own options are computed from, so picking a subtype never
  // shrinks its own list down to just the one chosen value.
  function baseFiltered(){
    let list = MONSTERS;
    if(state.query) list = list.filter(m => matchesQuery(m, state.query));
    if(state.cr.operator) list = list.filter(m => matchesRange(m.cr, state.cr));
    if(state.hd.operator) list = list.filter(m => matchesRange(m.hdvalue, state.hd));
    if(state.types.size) list = list.filter(m => state.types.has(m._type));
    if(state.sizes.size) list = list.filter(m => state.sizes.has(m.size));
    if(state.env.group) list = list.filter(matchesEnvironment);
    if(state.movements.size) list = list.filter(m => (m.moves || []).some(t => state.movements.has(t)));
    if(state.spellcasting.size) list = list.filter(matchesSpellcasting);
    if(state.publishers.size) list = list.filter(matchesPublisher);
    return list;
  }

  // Rebuilds the Subtype <select>'s options from whatever subtypes are
  // actually present in `list` (the base-filtered set). If the previously
  // selected value no longer appears, resets the select — and the filter
  // state — back to "Any".
  function updateSubtypeOptions(list){
    const subtypeSet = new Set();
    list.forEach(m => (m.subtypes || []).forEach(st => { if(st) subtypeSet.add(st); }));

    if(state.subtype && !subtypeSet.has(state.subtype)){
      state.subtype = '';
    }

    const current = state.subtype;
    subtypeSelect.innerHTML = '<option value="">Any</option>' +
      Array.from(subtypeSet).map(st => `<option value="${escapeHtml(st)}">${escapeHtml(formatTitleCase(st))}</option>`).join('');
    sortSelectOptions(subtypeSelect);
    subtypeSelect.value = current;
  }

  function filtered(){
    const base = baseFiltered();
    updateSubtypeOptions(base);

    let list = state.subtype
      ? base.filter(m => (m.subtypes || []).includes(state.subtype))
      : base;

    const sorted = list.slice();
    if(state.sort === 'name'){
      sorted.sort((a,b) => a.name.localeCompare(b.name));
    } else if(state.sort === 'name_desc'){
      sorted.sort((a,b) => b.name.localeCompare(a.name));
    } else if(state.sort === 'cr_asc'){
      sorted.sort((a,b) => (a.cr ?? -1) - (b.cr ?? -1) || a.name.localeCompare(b.name));
    } else if(state.sort === 'cr_desc'){
      sorted.sort((a,b) => (b.cr ?? -1) - (a.cr ?? -1) || a.name.localeCompare(b.name));
    } else if(state.sort === 'hd_asc'){
      sorted.sort((a,b) => (a.hdvalue ?? -1) - (b.hdvalue ?? -1) || a.name.localeCompare(b.name));
    } else if(state.sort === 'hd_desc'){
      sorted.sort((a,b) => (b.hdvalue ?? -1) - (a.hdvalue ?? -1) || a.name.localeCompare(b.name));
    } else if(state.sort === 'type'){
      sorted.sort((a,b) => (a._type||'').localeCompare(b._type||'') || a.name.localeCompare(b.name));
    } else if(state.sort === 'type_desc'){
      sorted.sort((a,b) => (b._type||'').localeCompare(a._type||'') || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function quickStatsHTML(m){
    const hdText = (typeof m.hdvalue === 'number') ? String(m.hdvalue) : '';
    const boxes = [
      ['CR', formatChallengeRating(m.cr)],
      ['HD', hdText || '—'],
      ['Size', m.size || '—'],
    ];
    return `<div class="entry-qstats">${boxes.map(([l, v]) =>
      `<div class="entry-qstat"><div class="entry-qstat-label">${escapeHtml(l)}</div><div class="entry-qstat-value">${escapeHtml(v)}</div></div>`
    ).join('')}</div>`;
  }

  // ---------- Stat block helpers ----------
  // A "line" is an array of parts: plain strings, {b:'bold'}, {i:'italic'},
  // {sup:'D'}. The same parts render to HTML (display) and Markdown-ish text
  // (clipboard), so the two can never drift apart.
  function partsHtml(parts){
    return parts.map(p => {
      if(typeof p === 'string') return escapeHtml(p);
      if(p.b !== undefined) return `<b>${escapeHtml(p.b)}</b>`;
      if(p.i !== undefined) return `<i>${escapeHtml(p.i)}</i>`;
      if(p.sup !== undefined) return `<sup>${escapeHtml(p.sup)}</sup>`;
      return '';
    }).join('');
  }
  function partsText(parts){
    return parts.map(p => {
      if(typeof p === 'string') return p;
      if(p.b !== undefined) return `**${p.b}**`;
      if(p.i !== undefined) return `*${p.i}*`;
      if(p.sup !== undefined) return p.sup;
      return '';
    }).join('');
  }
  const gap = parts => { parts.gap = true; return parts; };   // adds space above the line
  const has = v => Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== '');

  // "type (details)" / "type value" style entries used by senses, special
  // attacks, SQ, weaknesses, etc. Plain strings pass through.
  function fmtEntry(x){
    if(typeof x === 'string') return x;
    const base = x.type ?? x.name ?? x.spell ?? '';
    if(has(x.details)) return `${base} (${x.details})`;
    if(has(x.modifier)) return `${base} ${x.modifier}`;
    if(has(x.value)) return `${base} ${x.value}`;
    return base;
  }
  // Joins arrays of parts-arrays with a separator, e.g. ['a','b'] -> a, b
  function joinParts(items, sep){
    const out = [];
    items.forEach((it, i) => {
      if(i) out.push(sep);
      out.push(...(Array.isArray(it) ? it : [it]));
    });
    return out;
  }
  function labeled(label, value){ return [{b: label}, ' ', ...(Array.isArray(value) ? value : [value])]; }

  function spellListParts(spells){
    return joinParts((spells || []).map(s => {
      const parts = [s.spell + (s.count > 1 ? ` (x${s.count})` : '')];
      if(s.type === 'domain') parts.push({sup: 'D'});
      if(has(s.details)) parts.push(` (${s.details})`);
      return parts;
    }), ', ');
  }

  function casterHeading(prefix, caster, level, conc){
    const inner = [];
    if(level !== null && level !== undefined) inner.push(`CL ${formatOrdinal(level)}`);
    if(conc !== null && conc !== undefined && conc !== '') inner.push(`concentration ${typeof conc === 'number' ? formatSigned(conc) : conc}`);
    const lead = [caster ? formatCapitalize(caster) : '', prefix].filter(Boolean).join(' ');
    return gap([{b: `${lead} (${inner.join('; ')})`}]);
  }

  function raceClassLine(m){
    if(!has(m.classes)) return null;
    const cls = m.classes.map(c => typeof c === 'string' ? c
      : [c.class ?? c.name ?? '', c.level ?? ''].join(' ').trim()).join('/');
    return [[m.race ? formatCapitalize(m.race) + ' ' : '', cls].join('')];
  }

  function headerLines(m){
    const lines = [];
    if(m.xp !== null && m.xp !== undefined) lines.push(labeled('XP', Number(m.xp).toLocaleString('en-US')));
    const rc = raceClassLine(m); if(rc) lines.push(rc);
    const subs = (m.subtypes || []).length ? ` (${m.subtypes.map(formatTitleCase).join(', ')})` : '';
    lines.push([[m.alignment, m.size, m._type].filter(Boolean).join(' ') + subs]);

    const initParts = [{b:'Init'}, ' ' + formatSigned(m.init) + (has(m.init_special) ? ` (${m.init_special})` : '')];
    if(has(m.senses)) initParts.push('; ', {b:'Senses'}, ' ' + m.senses.map(fmtEntry).join(', '));
    lines.push(initParts);
    if(has(m.auras)) lines.push(labeled('Aura', m.auras.join(', ')));
    return lines;
  }

  function defenseLines(m){
    const lines = [];
    if(m.ac !== null && m.ac !== undefined){
      lines.push([{b:'AC'}, ` ${m.ac}, touch ${m.ac_touch ?? '–'}, flat-footed ${m.ac_flat_footed ?? '–'}` + (has(m.ac_mods) ? ` (${m.ac_mods})` : '')]);
    }
    if(m.hp !== null && m.hp !== undefined){
      let t = ` ${m.hp}` + (has(m.hd) ? ` (${m.hd})` : '');
      if(has(m.hp_mods)) t += '; ' + m.hp_mods.join(', ');
      lines.push([{b:'hp'}, t]);
    }
    // Saves. save_mods may be an object keyed fort/ref/will (attached to that
    // save) or a general string/array (appended after Will).
    const sm = m.save_mods;
    const perSave = (sm && typeof sm === 'object' && !Array.isArray(sm)) ? sm : {};
    const general = (sm && !Object.keys(perSave).length) ? (Array.isArray(sm) ? sm.join(', ') : String(sm)) : '';
    const save = (label, key) => {
      const extra = perSave[key];
      return [{b: label}, ` ${formatSigned(m[key])}` + (has(extra) ? `(${Array.isArray(extra) ? extra.join(', ') : extra})` : '')];
    };
    if(m.fort != null || m.ref != null || m.will != null){
      const parts = joinParts([save('Fort','fort'), save('Ref','ref'), save('Will','will')], ', ');
      if(general) parts.push('; ' + general);
      lines.push(parts);
    }

    const groups = [];
    if(has(m.defensive_abilities)) groups.push(labeled('Defensive Abilities', m.defensive_abilities.map(fmtEntry).join(', ')));
    if(has(m.dr)) groups.push(labeled('DR', m.dr));
    if(has(m.immunities)) groups.push(labeled('Immune', m.immunities.map(fmtEntry).join(', ')));
    if(has(m.resists)) groups.push(labeled('Resist', m.resists.map(fmtEntry).join(', ')));
    if(m.sr !== null && m.sr !== undefined) groups.push(labeled('SR', String(m.sr) + (has(m.sr_mods) ? ` (${m.sr_mods})` : '')));
    if(groups.length) lines.push(joinParts(groups, '; '));

    if(has(m.weaknesses)) lines.push(labeled('Weaknesses', m.weaknesses.map(fmtEntry).join(', ')));
    return lines;
  }

  function offenseLines(m){
    const lines = [];
    if(has(m.speed)){
      const sp = m.speed.map(s => {
        const ft = `${s.speed} ft.`;
        const man = has(s.maneuverability) ? ` (${s.maneuverability})` : '';
        return (s.type === 'base' || s.type === 'land') ? ft : `${s.type} ${ft}${man}`;
      }).join(', ');
      const mod = has(m.speed_mod) ? '; ' + (Array.isArray(m.speed_mod) ? m.speed_mod.join(', ') : m.speed_mod) : '';
      lines.push(labeled('Speed', sp + mod));
    }
    if(has(m.melee)) lines.push(labeled('Melee', m.melee));
    if(has(m.ranged)) lines.push(labeled('Ranged', m.ranged));
    if(has(m.space) || has(m.reach)){
      const parts = [];
      if(has(m.space)) parts.push(labeled('Space', m.space));
      if(has(m.reach)) parts.push(labeled('Reach', m.reach));
      lines.push(joinParts(parts, '; '));
    }
    if(has(m.special_attacks)) lines.push(labeled('Special Attacks', m.special_attacks.map(fmtEntry).join(', ')));

    // Spell-like abilities
    if(has(m.spell_like_abilities)){
      lines.push(casterHeading('Spell-Like Abilities', null, m.spell_like_abilities_caster_level, m.spell_like_abilities_concentration));
      m.spell_like_abilities.forEach(g => {
        const f = String(g.frequency || '');
        const label = /^at[- ]will$/i.test(f) ? 'At will' : formatCapitalize(f);
        lines.push([{b: label}, '—', ...spellListParts(g.spells)]);
      });
    }
    // Spells known / prepared share the same per-level layout.
    const levelLabel = (g, withSlots) => {
      const name = g.spell_level === 0 ? 'Cantrips' : formatOrdinal(g.spell_level);
      if(!withSlots && g.spell_level !== 0) return name;
      const atWill = g.spell_level === 0 || g.spell_slots >= 99;
      if(atWill) return `${name} (at will)`;
      return has(g.spell_slots) && withSlots ? `${name} (${g.spell_slots}/day)` : name;
    };
    if(has(m.spellsknown)){
      lines.push(casterHeading('Spells Known', m.spellsknown_caster, m.spellsknown_caster_level, m.spellsknown_concentration));
      m.spellsknown.forEach(g => lines.push([{b: levelLabel(g, true)}, '—', ...spellListParts(g.spells)]));
    }
    if(has(m.spellsprepared)){
      lines.push(casterHeading('Spells Prepared', m.spellsprepared_caster, m.spellsprepared_caster_level, m.spellsprepared_concentration));
      m.spellsprepared.forEach(g => lines.push([{b: levelLabel(g, false)}, '—', ...spellListParts(g.spells)]));
      const anyDomain = m.spellsprepared.some(g => (g.spells || []).some(s => s.type === 'domain'));
      const dom = [];
      if(anyDomain) dom.push([{b:'D'}, ' domain spell']);
      if(has(m.spelldomains)) dom.push(labeled('Domains', Array.isArray(m.spelldomains) ? m.spelldomains.join(', ') : m.spelldomains));
      if(dom.length) lines.push(joinParts(dom, '; '));
    }
    return lines;
  }

  function statisticsLines(m){
    const lines = [];
    const ab = [['Str','strength'],['Dex','dexterity'],['Con','constitution'],['Int','intelligence'],['Wis','wisdom'],['Cha','charisma']];
    lines.push(joinParts(ab.map(([l,k]) => [{b:l}, ' ' + (m[k] ?? '–')]), ', '));

    const combat = [labeled('Base Atk', formatSigned(m.baseatk))];
    combat.push(labeled('CMB', formatSigned(m.cmb) + (has(m.cmb_special) ? ` (${m.cmb_special})` : '')));
    combat.push(labeled('CMD', (m.cmd ?? '–') + (has(m.cmd_special) ? ` (${m.cmd_special})` : '')));
    lines.push(joinParts(combat, '; '));

    if(has(m.feats)){
      const feats = m.feats.map(f => f.type === 'bonus' ? [f.feat, {sup:'B'}] : [f.feat]);
      lines.push(labeled('Feats', joinParts(feats, ', ')));
    }
    if(has(m.skills)) lines.push(labeled('Skills', m.skills.map(s => `${s.skill} ${formatSigned(s.value)}`).join(', ')));
    if(has(m.languages)) lines.push(labeled('Languages', m.languages.join(', ')));
    if(has(m.sq)) lines.push(labeled('SQ', m.sq.map(fmtEntry).join(', ')));
    if(has(m.gear)) lines.push([{b:'Gear'}, ' ', {i: m.gear}]);
    return lines;
  }

  function abilityLines(m){
    return (m.special_abilities || []).map(a =>
      gap([{b: `${a.type}${has(a.kind) ? ` (${a.kind})` : ''}`}, ' ' + (a.details || '')]));
  }

  function ecologyLines(m){
    const lines = [];
    if(has(m.environments)) lines.push(labeled('Environment', m.environments.join(', ')));
    if(has(m.organizations)) lines.push(labeled('Organization', m.organizations.join(', ')));
    if(has(m.treasure)) lines.push(labeled('Treasure', m.treasure));
    return lines;
  }

  function linesHtml(lines){
    return lines.map(l => `<div class="statblock-line${l.gap ? ' gap' : ''}${l.pre ? ' pre' : ''}">${partsHtml(l)}</div>`).join('');
  }
  // Returns {html, text} so cardHTML can assemble one combined copy string.
  function sectionPart(title, lines){
    if(!lines.length) return null;
    return {
      text: [`**${title}**`, ...lines.map(partsText)].join('\n'),
      html: `
      <div class="entry-section">
        <div class="entry-section-title">${escapeHtml(title)}</div>
        ${linesHtml(lines)}
      </div>`
    };
  }

  // Description section: the plain description text, followed by "Ecology" and
  // "Habitat & Society" as bold-label lines (same look as Skills / Languages).
  // Those two sections are stored in m.ecology / m.habitat_society, so the
  // description is cut at its first "Ecology" / "Habitat & Society" header to
  // avoid showing them twice. A monster with neither field populated keeps
  // its full description untouched. A header is a standalone word (whitespace
  // or string edge on both sides), so prose like "the local Ecology." is kept.
  const SECTION_HDR_RE = /(?:^|\s)(?:Ecology|Habitat & Society)(?=\s|$)/;
  function descriptionIntro(m){
    const d = m.description || '';
    if(!has(m.ecology) && !has(m.habitat_society)) return d;
    const hit = SECTION_HDR_RE.exec(d);
    return (hit ? d.slice(0, hit.index) : d).trim();
  }
  function descriptionSectionLines(m, hasIntro){
    const lines = [];
    if(has(m.ecology)) lines.push(labeled('Ecology', m.ecology));
    if(has(m.habitat_society)) lines.push(labeled('Habitat & Society', m.habitat_society));
    lines.forEach((l, i) => { l.pre = true; if(i || hasIntro) l.gap = true; });
    return lines;
  }

  // "[Name] AS CHARACTER" section: for each as_character entry, its
  // description text followed by one bold-label line per racial trait
  // ("**Type** value", same look as Environment / Ecology).
  function asCharacterLines(m){
    const lines = [];
    (m.as_character || []).forEach((e, ei) => {
      const start = lines.length;
      if(has(e.description)){
        const l = [e.description];
        l.pre = true;
        lines.push(l);
      }
      (e.racial_traits || []).forEach(t => {
        if(t && has(t.type)) lines.push(labeled(t.type, has(t.value) ? String(t.value) : ''));
      });
      // Extra breathing room before a 2nd+ entry and before the trait list.
      if(ei && lines.length > start) lines[start].gap = true;
    });
    return lines;
  }

  // Builds the full stat block (HTML + click-to-copy text) for one monster.
  // Only called when a card is open, never for closed cards.
  function bodyHTML(m){
    const parts = [];   // each: {html, text}; joined into ONE copyable region
    if(m.description_visual){
      parts.push({
        text: '*' + m.description_visual + '*',
        html: `<p class="statblock-visual">${escapeHtml(m.description_visual)}</p>`
      });
    }

    const crText = (m.cr !== null && m.cr !== undefined) ? `CR ${formatChallengeRating(m.cr)}` : '';
    const hLines = headerLines(m);
    parts.push({
      text: [`**${m.name}${crText ? ' ' + crText : ''}**`, ...hLines.map(partsText)].join('\n'),
      html: `
      <div class="statblock-head">
        <div class="statblock-titlerow">
          <span class="statblock-name">${escapeHtml(m.name)}</span>
          <span class="statblock-cr">${escapeHtml(crText)}</span>
        </div>
        ${linesHtml(hLines)}
      </div>`
    });

    parts.push(sectionPart('Defense', defenseLines(m)));
    parts.push(sectionPart('Offense', offenseLines(m)));
    parts.push(sectionPart('Statistics', statisticsLines(m)));
    parts.push(sectionPart('Special Abilities', abilityLines(m)));
    parts.push(sectionPart('Ecology', ecologyLines(m)));
    const intro = descriptionIntro(m);
    const descLines = descriptionSectionLines(m, !!intro);
    if(intro || descLines.length){
      parts.push({
        text: ['**Description**', ...(intro ? [clipboardFormatText(intro)] : []), ...descLines.map(partsText)].join('\n'),
        html: `
      <div class="entry-section">
        <div class="entry-section-title">Description</div>
        ${intro ? `<div class="entry-desc"><div>${htmlFormatDescription(intro)}</div></div>` : ''}
        ${linesHtml(descLines)}
      </div>`
      });
    }
    const asChar = asCharacterLines(m);
    parts.push(sectionPart(`${m.name} as character`, asChar));
    const live = parts.filter(Boolean);
    const copyText = live.map(p => p.text).join('\n\n');
    return `<div class="statblock-copy copyable" data-copy="${escapeHtml(copyText)}">${live.map(p => p.html).join('')}</div>`;
  }

  function cardHTML(m){
    const cardStyle = m._cardColor ? ` style="--cardc:${m._cardColor}"` : '';
    const isOpen = state.open.has(m._idx);

    const subtypesText = (m.subtypes || []).map(formatTitleCase).join(', ');
    const typeTagHtml = m._type ? `<span class="entry-tag entry-tag--lg">${escapeHtml(m._type)}</span>` : '';
    const subtypeTagHtml = subtypesText ? `<span class="entry-tag">(${escapeHtml(subtypesText)})</span>` : '';

    return `
    <div class="entry-card entry-card--stats entry-card--tight entry-card--statblock monster-card${isOpen?' open':''}"${cardStyle} data-idx="${m._idx}">
      <div class="entry-head" data-toggle="${m._idx}">
        <div class="entry-title-block">
          <span class="entry-name monster-name copyable" data-copy="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
          ${typeTagHtml}
          ${subtypeTagHtml}
        </div>
        <div class="entry-right">
          ${quickStatsHTML(m)}
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="entry-body"></div>
    </div>`;
  }

  // ---- Lazy loading of third-party monsters ----
  // 'idle' | 'loading' | 'loaded' | 'error'. With no META (everything inlined
  // by an older build) or no 3pp entries there is nothing to load.
  let threeppStatus = (META && META.count3pp && META.file) ? 'idle' : 'loaded';

  // Publishers with none selected means "show everything", so that needs 3pp too.
  function needs3pp(){
    return !state.publishers.size || state.publishers.has('3pp');
  }

  function load3pp(){
    threeppStatus = 'loading';
    const s = document.createElement('script');
    s.src = META.file;
    s.onload = () => {
      const data = window[META.varName] || [];
      const start = MONSTERS.length;
      data.forEach((m, k) => { prepare(m, start + k); MONSTERS.push(m); });
      window[META.varName] = null;
      threeppStatus = 'loaded';
      render();
    };
    s.onerror = () => {
      threeppStatus = 'error';
      s.remove();
      render();
    };
    document.head.appendChild(s);
  }

  function showStatus(title, msg){
    document.getElementById('listTitle').textContent = title;
    document.getElementById('monsterList').innerHTML =
      `<div class="empty-state"><span class="big">${escapeHtml(title)}</span>${escapeHtml(msg)}</div>`;
  }

  function render(){
    syncSortButtons();
    if(threeppStatus !== 'loaded' && needs3pp()){
      if(threeppStatus === 'error'){
        showStatus('Could not load third-party monsters', 'Check your connection, then toggle the Publishers filter to retry.');
        threeppStatus = 'idle';   // next render retries
        return;
      }
      if(threeppStatus === 'idle') load3pp();
      showStatus('Loading…', 'Fetching third-party monsters.');
      return;
    }
    renderNow();
  }

  function renderNow(){
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} Monster${results.length !== 1 ? 's' : ''} Listed`;
    const listEl = document.getElementById('monsterList');
    if(results.length === 0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No monsters found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    const shown = paginate(state, results);
    listEl.innerHTML = shown.map(cardHTML).join('') + showMoreButtonHTML(results, state, 'Monsters');
    // The full record is fetched (chunked, cached) and the stat block built
    // when a card is opened; cards still open (state.open) after a re-render
    // are hydrated here too.
    wireCardToggle(listEl, state, 'monster-card', 'monster-name', (idx, card) => hydrate(idx, card));
    listEl.querySelectorAll('.monster-card.open').forEach(card => hydrate(+card.dataset.idx, card));
    wireShowMore(listEl, {
      onLoadMore: () => { state.visibleCount += PAGE_SIZE; renderNow(); },
      onShowAll: () => { state.visibleCount = results.length; renderNow(); }
    });
  }

  render();
})();

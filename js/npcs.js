(function(){
  // Canonical display order for the type chips (matches the old
  // --type-<name> var order in npcs.css — already alphabetical).
  // Any type present in the data that isn't listed here is appended
  // afterward, alphabetically.
  const TYPE_ORDER = ['Aberration', 'Animal', 'Construct', 'Dragon', 'Fey', 'Humanoid', 'Magical Beast', 'Monstrous Humanoid', 'Ooze', 'Outsider', 'Plant', 'Undead', 'Vermin'];

  // NPCS_DATA holds only slim list records (see build-npcs.js). The full
  // stat blocks live in chunked files (data/npcs-<N>.js) that are loaded
  // the first time a card in that chunk is opened.
  const NPCS = (typeof NPCS_DATA !== 'undefined') ? NPCS_DATA.slice() : [];

  // ---- Lazy-loaded full records ----
  const META = (typeof NPCS_DATA_META !== 'undefined') ? NPCS_DATA_META : { chunkSize: 20 };
  const CH = META.chunkSize;
  const chunkPromises = {};
  function loadChunk(c){
    return chunkPromises[c] || (chunkPromises[c] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = META['c' + c];
      s.onload = () => res(window['NPC_CHUNK_' + c]);
      s.onerror = () => { delete chunkPromises[c]; s.remove(); rej(new Error('chunk ' + c)); };
      document.head.appendChild(s);
    }));
  }
  function loadDetail(idx){
    return loadChunk(Math.floor(idx / CH)).then(arr => {
      const full = arr[idx % CH];
      full._type = NPCS[idx]._type;   // bodyHTML() uses m._type
      return full;
    });
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
  // data, title-cased so inconsistent source casing doesn't produce
  // duplicate entries.
  const typeColorOf = buildTypeColorMap(NPCS.map(m => formatTitleCase(m.type)), TYPE_ORDER);

  // ---- Class categories ----
  // `exact`    : the class string must equal the entry.
  // `contains` : any class string containing the entry matches; `except`
  //              lists substrings that veto the match (so "cleric" doesn't
  //              swallow "ex-cleric", "paladin" doesn't swallow "ex-paladin"
  //              or "antipaladin", etc.).
  // An NPC class string can land in several categories (e.g. "demoniac" is
  // both Martial and Prestige).
  const CLASS_CATEGORIES = [
    { key: 'caster', label: 'Caster',
      exact: ['alchemist','arcanist','bard','bloodrager','dominant','investigator','magus','medium','mesmerist','occultist','psychic','ranger','shaman','skald','sorcerer','spiritualist'],
      contains: [
        { label: 'antipaladin', match: 'antipaladin' },
        { label: 'cleric', match: 'cleric', except: ['ex-cleric'] },
        { label: 'druid', match: 'druid', except: ['ex-druid'] },
        { label: 'hunter', match: 'hunter' },
        { label: 'inquisitor', match: 'inquisitor' },
        { label: 'oracle', match: 'oracle' },
        { label: 'paladin', match: 'paladin', except: ['ex-paladin', 'antipaladin'] },
        { label: 'pathfinder', match: 'pathfinder' },
        { label: 'summoner', match: 'summoner' },
        { label: 'warpriest', match: 'warpriest' },
        { label: 'witch', match: 'witch' },
        { label: 'wizard', match: 'wizard', except: ['archwizard'] }
      ],
      groups: [
        { label: 'wizard - specialists', members: ['abjurer','conjurer','diviner','enchanter','evoker','illusionist','necromancer','transmuter','universalist','thassilonian conjurer'] }
      ] },
    { key: 'martial', label: 'Martial',
      exact: ['barbarian','brawler','cavalier','ex-monk','fighter','guardian','gunslinger','marshal','monk','ninja','ranger','rogue','samurai','slayer','swashbuckler','trickster','vigilante'],
      contains: [
        { label: 'demoniac', match: 'demoniac' },
        { label: 'ex-cleric', match: 'ex-cleric' },
        { label: 'ex-druid', match: 'ex-druid' },
        { label: 'ex-paladin', match: 'ex-paladin' },
        { label: 'paladin', match: 'paladin', except: ['ex-paladin', 'antipaladin'] }
      ] },
    { key: 'npc', label: 'NPC',
      exact: ['adept','aristocrat','commoner','expert','warrior'] },
    { key: 'prestige', label: 'Prestige',
      exact: ['adept of zarongel','agent of the grave','aldori swordlord','arcane archer','arcane trickster','archmage','archwizard','arclord of nex','aspis agent','assassin','battle herald','bellflower tiller','blackfire adept','bloatmage','champion','cyphermage','daggermark poisoner','demoniac','diabolist','dragon disciple','duelist','eldritch knight','ex-brother of the seal','exalted','gray gardener','harrower','hellknight','hierophant','holy vindicator','horizon walker','inner sea pirate','knight of ozem','lion blade','living monolith','loremaster','low templar','magaambyan arcanist','mammoth rider','master spy','mystic theurge','pyrokineticist','rage prophet','razmiran priest','red mantis assassin','riftwarden','shadowdancer','shieldmarshal','sleepless detective','stalwart defender','storm kindler','student of war','technomancer','umbral court agent','zealot of orcus'] },
    { key: 'others', label: 'Others',
      exact: ['animal companion','eidolon'] }
  ];

  // Returns [[categoryKey, classLabel], ...] for one raw class string.
  function classifyClass(raw){
    const s = String(raw || '').toLowerCase().trim();
    const out = [];
    if(!s) return out;
    CLASS_CATEGORIES.forEach(cat => {
      (cat.exact || []).forEach(e => { if(s === e) out.push([cat.key, e]); });
      (cat.contains || []).forEach(r => {
        if(s.includes(r.match) && !(r.except || []).some(x => s.includes(x))) out.push([cat.key, r.label]);
      });
      (cat.groups || []).forEach(g => { if(g.members.includes(s)) out.push([cat.key, g.label]); });
    });
    return out;
  }

  const state = {
    query: '',
    searchScope: SEARCH_SCOPE_NAMES,
    cr: { operator: '', v1: null, v2: null },
    hd: { operator: '', v1: null, v2: null },
    types: new Set(),
    subtype: '',
    classCat: '',
    cls: '',
    spellcasting: new Set(),
    sort: 'name',
    open: new Set()
  };

  document.getElementById('brandSub').textContent = `NPC Registry · ${NPCS.length} NPCs`;

  function prepare(m, i){
    m._idx = i;
    m._type = formatTitleCase(m.type);
    m._cardColor = typeColorOf[m._type];
    // { categoryKey: Set(classLabel) } for the Classes filter
    m._classes = {};
    (m.classes || []).forEach(c => {
      classifyClass(typeof c === 'string' ? c : (c.class || c.name)).forEach(([cat, label]) => {
        (m._classes[cat] = m._classes[cat] || new Set()).add(label);
      });
    });
    // The "All Fields" search blob is precomputed at build time
    // (buildBlob in build-npcs.js).
    m._nameBlob = (m.name || '').toLowerCase();
    m._blob = m.blob || '';
  }
  NPCS.forEach(prepare);

  // Real data-driven bounds for the CR / HD range inputs, so "min"/"max"
  // reflect what's actually in npcs.json instead of a guessed constant.
  const CR_VALUES = NPCS.map(m => m.cr).filter(v => typeof v === 'number');
  const CR_MIN = CR_VALUES.length ? Math.min(...CR_VALUES) : 0;
  const CR_MAX = CR_VALUES.length ? Math.max(...CR_VALUES) : 30;
  const HD_VALUES = NPCS.map(m => m.hd_value).filter(v => typeof v === 'number');
  const HD_MIN = HD_VALUES.length ? Math.min(...HD_VALUES) : 0;
  const HD_MAX = HD_VALUES.length ? Math.max(...HD_VALUES) : 30;

  initMobileFiltersCollapse();
  initThemeToggle();

  // ---- Numeric range filters (Challenge Rating, Hit Dice) ----
  // wireRangeFilter/matchesRange are shared helpers in base.js. Bounds and
  // placeholders come from the real data range (CR_MIN/MAX, HD_MIN/MAX).
  const crFilter = wireRangeFilter({
    rangeState: state.cr,
    operatorId: 'crOperatorSelect',
    input1Id: 'crInput1',
    andId: 'crAndSpan',
    input2Id: 'crInput2',
    clearId: 'clearCR',
    render,
    min: CR_MIN,
    max: CR_MAX,
    applyBounds: true
  });

  const hdFilter = wireRangeFilter({
    rangeState: state.hd,
    operatorId: 'hdOperatorSelect',
    input1Id: 'hdInput1',
    andId: 'hdAndSpan',
    input2Id: 'hdInput2',
    clearId: 'clearHD',
    render,
    min: HD_MIN,
    max: HD_MAX,
    applyBounds: true
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

  // ---- Classes filter (two linked selects: category -> class). Both
  // option lists are rebuilt on every render() from the NPCs that survive
  // all the other filters — see updateClassOptions(). ----
  const classCategorySelect = document.getElementById('classCategorySelect');
  const classSelect = document.getElementById('classSelect');
  classCategorySelect.addEventListener('change', () => {
    state.classCat = classCategorySelect.value;
    state.cls = '';
    render();
  });
  classSelect.addEventListener('change', () => {
    state.cls = classSelect.value;
    render();
  });
  document.getElementById('clearClasses').addEventListener('click', () => {
    state.classCat = '';
    state.cls = '';
    classCategorySelect.value = '';
    classSelect.value = '';
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
  wireSearchTooltip(searchInputEl, searchWrapEl, 'bandit +stealth -evil +shortbow', { prefix: true });
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

    state.classCat = ''; state.cls = '';
    classCategorySelect.value = ''; classSelect.value = '';

    state.spellcasting.clear();
    spellcastingChips.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));

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

  wireCopyableList('npcList', 'npc-name');

  const queryMatch = createQueryMatcher({ prefix: true });
  function matchesQuery(npc, query){
    return queryMatch(state.searchScope === SEARCH_SCOPE_ALL ? npc._blob : npc._nameBlob, query);
  }

  // `sc` is a precomputed array of spellcasting flags (none / extracts /
  // prepared / psychic / spell_like / spontaneous), see scFlags() in
  // build-npcs.js.
  function matchesSpellcasting(npc){
    if(!state.spellcasting.size) return true;
    return (npc.sc || []).some(f => state.spellcasting.has(f));
  }

  function matchesClass(m){
    if(!state.classCat) return true;
    const set = m._classes[state.classCat];
    if(!set) return false;
    return state.cls ? set.has(state.cls) : true;
  }

  // Applies every filter except the one named in `skip` ('subtype' or
  // 'class'). Subtype and Classes each compute their own option lists from
  // the population the OTHER filters leave behind, so picking a value never
  // shrinks its own list down to just the chosen value.
  function applyFilters(skip){
    let list = NPCS;
    if(state.query) list = list.filter(m => matchesQuery(m, state.query));
    if(state.cr.operator) list = list.filter(m => matchesRange(m.cr, state.cr));
    if(state.hd.operator) list = list.filter(m => matchesRange(m.hd_value, state.hd));
    if(state.types.size) list = list.filter(m => state.types.has(m._type));
    if(state.spellcasting.size) list = list.filter(matchesSpellcasting);
    if(skip !== 'subtype' && state.subtype) list = list.filter(m => (m.sub_types || []).includes(state.subtype));
    if(skip !== 'class') list = list.filter(matchesClass);
    return list;
  }

  const prettyName = st => st.replace(/(^|[\s\-(\/])([a-z])/g, (m, p, c) => p + c.toUpperCase());

  // Rebuilds the Subtype <select>'s options from whatever subtypes are
  // actually present in `list`. If the previously selected value no longer
  // appears, resets the select — and the filter state — to "Any".
  function updateSubtypeOptions(list){
    const subtypeSet = new Set();
    list.forEach(m => (m.sub_types || []).forEach(st => { if(st) subtypeSet.add(st); }));

    if(state.subtype && !subtypeSet.has(state.subtype)){
      state.subtype = '';
    }

    const current = state.subtype;
    subtypeSelect.innerHTML = '<option value="">Any</option>' +
      Array.from(subtypeSet).map(st => `<option value="${escapeHtml(st)}">${escapeHtml(prettyName(st))}</option>`).join('');
    sortSelectOptions(subtypeSelect);
    subtypeSelect.value = current;
  }

  // Category select lists only categories with at least one NPC in `list`;
  // the class select lists only the classes of the chosen category found in
  // `list`, and stays disabled until a category is picked.
  function updateClassOptions(list){
    const present = {};
    list.forEach(m => Object.keys(m._classes).forEach(cat => {
      const bucket = present[cat] = present[cat] || new Set();
      m._classes[cat].forEach(c => bucket.add(c));
    }));

    if(state.classCat && !present[state.classCat]){ state.classCat = ''; state.cls = ''; }
    if(state.cls && !present[state.classCat].has(state.cls)) state.cls = '';

    classCategorySelect.innerHTML = '<option value="">Any</option>' +
      CLASS_CATEGORIES.filter(c => present[c.key])
        .map(c => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
    sortSelectOptions(classCategorySelect);
    classCategorySelect.value = state.classCat;

    const classes = state.classCat ? Array.from(present[state.classCat]) : [];
    classSelect.innerHTML = '<option value="">Any</option>' +
      classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(prettyName(c))}</option>`).join('');
    sortSelectOptions(classSelect);
    classSelect.value = state.cls;
    classSelect.disabled = !state.classCat;
  }

  function filtered(){
    // Class options first, then subtype, then class again in case the
    // subtype reset changed what the class lists should contain.
    updateClassOptions(applyFilters('class'));
    updateSubtypeOptions(applyFilters('subtype'));
    updateClassOptions(applyFilters('class'));
    const list = applyFilters(null);

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
      sorted.sort((a,b) => (a.hd_value ?? -1) - (b.hd_value ?? -1) || a.name.localeCompare(b.name));
    } else if(state.sort === 'hd_desc'){
      sorted.sort((a,b) => (b.hd_value ?? -1) - (a.hd_value ?? -1) || a.name.localeCompare(b.name));
    } else if(state.sort === 'type'){
      sorted.sort((a,b) => (a._type||'').localeCompare(b._type||'') || a.name.localeCompare(b.name));
    } else if(state.sort === 'type_desc'){
      sorted.sort((a,b) => (b._type||'').localeCompare(a._type||'') || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  function quickStatsHTML(m){
    const hdText = (typeof m.hd_value === 'number') ? String(m.hd_value) : '';
    const boxes = [
      ['CR', formatChallengeRating(m.cr, '-')],
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

  // Spell markers: type "bonus" -> B, "domain" -> D, "mythic" -> M. `type` may be
  // a string or an array; several markers are shown alphabetically (e.g. "BDM").
  const MARKER_OF = { bonus: 'B', domain: 'D', mythic: 'M' };
  const markersOf = s => Array.from(new Set(
    [].concat(s.type ?? []).map(t => MARKER_OF[String(t).toLowerCase()]).filter(Boolean)
  )).sort().join('');

  function spellListParts(spells){
    return joinParts((spells || []).map(s => {
      const parts = [s.spell + (s.count > 1 ? ` (x${s.count})` : '')];
      const mk = markersOf(s);
      if(mk) parts.push({sup: mk});
      if(has(s.details)) parts.push(` (${s.details})`);
      if(has(s.note)) parts.push(` (${s.note})`);
      if(s.used) parts.push(' (used)');
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
      : [c.class ?? c.name ?? '',
         has(c.archetype) ? `(${Array.isArray(c.archetype) ? c.archetype.join(', ') : c.archetype})` : '',
         c.level ?? ''].filter(x => x !== '').join(' ')).join('/');
    return [[m.gender ? formatCapitalize(m.gender) + ' ' : '', m.race ? formatCapitalize(m.race) + ' ' : '', cls].join('')];
  }

  function headerLines(m){
    const lines = [];
    lines.push(labeled('XP', (m.xp !== null && m.xp !== undefined) ? Number(m.xp).toLocaleString('en-US') : '-'));
    const rc = raceClassLine(m); if(rc) lines.push(rc);
    const subs = (m.sub_types || []).length ? ` (${m.sub_types.join(', ')})` : '';
    const typeLine = [[m.alignment, m.size, m._type].filter(Boolean).join(' ') + subs];
    if(has(m.templates_applied)){
      typeLine.push('; ', {b: 'Template'}, ' ' + (Array.isArray(m.templates_applied) ? m.templates_applied.join(', ') : m.templates_applied));
    }
    if(Number(m.unique_monster) === 1) typeLine.push('; ', {b: 'Unique'});
    lines.push(typeLine);

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
      if(has(m.hp_mods)) t += '; ' + (Array.isArray(m.hp_mods) ? m.hp_mods.join(', ') : String(m.hp_mods));
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
    if(m.sr !== null && m.sr !== undefined) groups.push(labeled('SR', String(m.sr)));
    if(groups.length) lines.push(joinParts(groups, '; '));

    if(has(m.weaknesses)) lines.push(labeled('Weaknesses', m.weaknesses.map(fmtEntry).join(', ')));
    return lines;
  }

  function offenseLines(m){
    const lines = [];
    if(has(m.speed)){
      const sp = m.speed.map(s => {
        const ft = `${s.speed} ft.`;
        const isLand = s.type === 'base' || s.type === 'land';
        const notes = (isLand ? [s.special] : [s.maneuverability, s.special]).filter(has);
        const paren = notes.length ? ` (${notes.join('; ')})` : '';
        return isLand ? ft + paren : `${s.type} ${ft}${paren}`;
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
    if(has(m.bloodline)) lines.push(labeled('Bloodline:', m.bloodline));
    if(has(m.spellsprepared)){
      lines.push(casterHeading('Spells Prepared', m.spellsprepared_caster, m.spellsprepared_caster_level, m.spellsprepared_concentration));
      m.spellsprepared.forEach(g => lines.push([{b: levelLabel(g, false)}, '—', ...spellListParts(g.spells)]));
    }
    // Several "Label: value" pairs on ONE line, "; "-separated, skipping empties.
    const pairLine = pairs => {
      const g = pairs.filter(([, v]) => has(v))
        .map(([l, v]) => labeled(l, Array.isArray(v) ? v.join(', ') : String(v)));
      if(g.length) lines.push(joinParts(g, '; '));
    };
    pairLine([
      ['Focused School:', m.focused_school],
      ['Thassilonian Specialization:', m.thassilonian_specialization],
      ['Prohibited Schools:', m.prohibited_schools]
    ]);
    pairLine([
      ['Mystery:', m.mystery],
      ['Patron:', m.patron],
      ['Spirit:', m.spirit]
    ]);

    // Extracts prepared — same per-level layout as Spells Prepared.
    if(has(m.extractsprepared)){
      lines.push(casterHeading('Extracts Prepared', m.extractsprepared_caster, m.extractsprepared_caster_level, m.extractsprepared_concentration));
      m.extractsprepared.forEach(g => lines.push([{b: levelLabel(g, false)}, '—', ...spellListParts(g.spells)]));
    }

    // Marker legend + domains, e.g. "B bonus; M mythic; D domain spell; Domains Fire, Law"
    {
      const present = new Set();
      [m.spell_like_abilities, m.spellsknown, m.spellsprepared, m.extractsprepared].forEach(groups =>
        (groups || []).forEach(g => (g.spells || []).forEach(s => markersOf(s).split('').forEach(c => present.add(c)))));
      const legend = [];
      if(present.has('B')) legend.push([{b:'B'}, ' bonus']);
      if(present.has('M')) legend.push([{b:'M'}, ' mythic']);
      if(present.has('D')) legend.push([{b:'D'}, ' domain spell']);
      if(has(m.spelldomains)) legend.push(labeled('Domains', Array.isArray(m.spelldomains) ? m.spelldomains.join(', ') : m.spelldomains));
      if(legend.length) lines.push(joinParts(legend, '; '));
    }

    // Psychic magic — heading + one "N PE—spell (cost PE), ..." line.
    if(has(m.psychicmagic_spellsknown)){
      lines.push(casterHeading('Psychic Magic', null, m.psychicmagic_caster_level, m.psychicmagic_concentration));
      const pe = has(m.psychicmagic_psychic_energy) ? `${m.psychicmagic_psychic_energy} PE` : 'PE';
      const psySpells = joinParts(m.psychicmagic_spellsknown.map(s =>
        [s.spell + (has(s.cost) ? ` (${s.cost} PE)` : '')]), ', ');
      lines.push([{b: pe}, '—', ...psySpells]);
    }
    if(has(m.psychic_discipline)) lines.push(labeled('Psychic Discipline:', m.psychic_discipline));

    // Kineticist wild talents: heading + one line per key (Infusions, Kinetic Blasts, ...)
    const kin = m.kineticist_wild_talents_known;
    if(kin && typeof kin === 'object' && Object.keys(kin).length){
      lines.push(gap([{b: 'Kineticist Wild Talents Known'}]));
      Object.entries(kin).forEach(([k, v]) => {
        if(!has(v)) return;
        lines.push(labeled(prettyName(k), Array.isArray(v) ? v.join(', ') : String(v)));
      });
    }

    // Occultist implements: heading + one line per school
    if(has(m.implements_schools)){
      lines.push(gap([{b: 'Implements'}]));
      m.implements_schools.forEach(x => {
        const bits = [];
        if(has(x.implements)) bits.push(String(x.implements));
        if(has(x.resonant)) bits.push('resonant power: ' + x.resonant);
        if(has(x.focus)) bits.push('focus powers: ' + x.focus);
        lines.push([{b: x.school || '—'}, '—' + bits.join('; ')]);
      });
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

    if(has(m.traits)) lines.push(labeled('Traits', Array.isArray(m.traits) ? m.traits.join(', ') : String(m.traits)));
    if(has(m.feats)){
      const feats = m.feats.map(f => f.type === 'bonus' ? [f.feat, {sup:'B'}] : [f.feat]);
      lines.push(labeled('Feats', joinParts(feats, ', ')));
    }
    if(has(m.skills)) lines.push(labeled('Skills', m.skills.map(s => `${s.skill} ${formatSigned(s.value)}` + (has(s.special) ? ` (${s.special})` : '')).join(', ')));
    if(has(m.languages)) lines.push(labeled('Languages', m.languages.join(', ')));
    if(has(m.sq)) lines.push(labeled('SQ', m.sq.map(fmtEntry).join(', ')));
    if(has(m.gear)) lines.push([{b:'Gear'}, ' ', {i: m.gear}]);
    return lines;
  }

  function tacticsLines(m){
    const lines = [];
    if(has(m.before_combat)) lines.push(labeled('Before Combat', m.before_combat));
    if(has(m.during_combat)) lines.push(labeled('During Combat', m.during_combat));
    if(has(m.morale)) lines.push(labeled('Morale', m.morale));
    if(has(m.base_statistics)){
      // some records already start with the "Base Statistics" label — don't double it
      const bs = String(m.base_statistics).replace(/^\s*Base Statistics\s*/i, '');
      lines.push(labeled('Base Statistics', bs));
    }
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
    return lines.map(l => `<div class="statblock-line${l.gap ? ' gap' : ''}">${partsHtml(l)}</div>`).join('');
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

  // Builds the full stat block (HTML + click-to-copy text) for one npc.
  // Only called when a card is open, never for closed cards.
  function bodyHTML(m){
    const parts = [];   // each: {html, text}; joined into ONE copyable region
    if(m.description_visual){
      parts.push({
        text: '*' + m.description_visual + '*',
        html: `<p class="statblock-visual">${escapeHtml(m.description_visual)}</p>`
      });
    }

    const crText = `CR ${formatChallengeRating(m.cr, '-')}`;
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
    parts.push(sectionPart('Tactics', tacticsLines(m)));
    parts.push(sectionPart('Statistics', statisticsLines(m)));
    parts.push(sectionPart('Special Abilities', abilityLines(m)));
    parts.push(sectionPart('Ecology', ecologyLines(m)));
    if(m.description){
      parts.push({
        text: `**Description**\n${clipboardFormatText(m.description)}`,
        html: `
      <div class="entry-section">
        <div class="entry-section-title">Description</div>
        <div class="entry-desc"><div>${htmlFormatDescription(m.description)}</div></div>
      </div>`
      });
    }
    const live = parts.filter(Boolean);
    const copyText = live.map(p => p.text).join('\n\n');
    return `<div class="statblock-copy copyable" data-copy="${escapeHtml(copyText)}">${live.map(p => p.html).join('')}</div>`;
  }

  function cardHTML(m){
    const cardStyle = m._cardColor ? ` style="--cardc:${m._cardColor}"` : '';
    const isOpen = state.open.has(m._idx);

    const subtypesText = (m.sub_types || []).join(', ');
    const typeTagHtml = m._type ? `<span class="entry-tag entry-tag--lg">${escapeHtml(m._type)}</span>` : '';
    const subtypeTagHtml = subtypesText ? `<span class="entry-tag">(${escapeHtml(subtypesText)})</span>` : '';

    return `
    <div class="entry-card entry-card--stats entry-card--tight entry-card--statblock npc-card${isOpen?' open':''}"${cardStyle} data-idx="${m._idx}">
      <div class="entry-head" data-toggle="${m._idx}">
        <div class="entry-title-block">
          <span class="entry-name npc-name copyable" data-copy="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
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

  function render(){
    syncSortButtons();
    const results = filtered();
    document.getElementById('listTitle').textContent = `${results.length} NPC${results.length !== 1 ? 's' : ''} Listed`;
    const listEl = document.getElementById('npcList');
    if(results.length === 0){
      listEl.innerHTML = `<div class="empty-state"><span class="big">No npcs found</span>Try a different search term or clear a filter.</div>`;
      return;
    }
    const shown = paginate(state, results);
    listEl.innerHTML = shown.map(cardHTML).join('') + showMoreButtonHTML(results, state, 'NPCs');
    // The full record is fetched (chunked, cached) and the stat block built
    // when a card is opened; cards that are already open (state.open) after a
    // re-render are hydrated here too.
    wireCardToggle(listEl, state, 'npc-card', 'npc-name', (idx, card) => hydrate(idx, card));
    listEl.querySelectorAll('.npc-card.open').forEach(card => hydrate(+card.dataset.idx, card));
    wireShowMore(listEl, {
      onLoadMore: () => { state.visibleCount += PAGE_SIZE; render(); },
      onShowAll: () => { state.visibleCount = results.length; render(); }
    });
  }

  render();
})();

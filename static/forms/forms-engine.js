/*!
 * CFA Buda Ops Hub - Forms Engine v1.0
 * One renderer for every form. Forms themselves live in form-definitions.js.
 *
 *   <div id="opsForms"></div>
 *   <script src="/static/forms/form-definitions.js"><\/script>
 *   <script src="/static/forms/forms-engine.js"><\/script>
 *   <script>
 *     OpsForms.mount(document.getElementById('opsForms'), { endpoint: '/api/forms', isLeader: false });
 *   <\/script>
 *
 * Manager inbox (put this inside the Manage tab):
 *   OpsForms.mountInbox(document.getElementById('formsInbox'), { endpoint: '/api/forms' });
 *
 * mount() options: endpoint, api (custom adapter), lang ('en'|'es'), isLeader (show leader-only forms),
 *   roster (array of names for autocomplete), stores, onSubmitted(info).
 *   Returns { open(formId), setRoster(list), setLang(l), setLeader(bool), home() }.
 */
(function (global) {
  'use strict';

  /* ---------- safe browser storage (drafts, remembered name/store, language) ---------- */
  var NS = 'opsforms:';
  function lsGet(k, d) { try { var v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  function lsDel(k) { try { localStorage.removeItem(NS + k); } catch (e) { /* ignore */ } }

  /* ---------- UI strings ---------- */
  var UI = {
    en: {
      forms: 'Forms', search: 'Search forms', noMatch: 'No forms match that search.', draft: 'Draft',
      back: 'All forms', optional: 'optional', required: 'Required', submit: 'Submit', submitting: 'Submitting…',
      reset: 'Clear', tapAgain: 'Tap again to clear', addPhoto: 'Add photo', addFile: 'Add file', remove: 'Remove',
      badImage: "Couldn't read that file", tooBig: 'That file is too large (4 MB max)', signHere: 'Sign here', clear: 'Clear signature', yes: 'Yes', no: 'No',
      fixErrors: 'A few things need attention', mustAck: 'Please confirm to continue', needPhoto: 'Add at least one photo',
      badEmail: 'Enter a valid email', badPhone: 'Enter a 10-digit phone number', min: 'Must be at least', max: 'Must be at most',
      success: 'Submitted', successSub: "Thanks, it's in.", another: 'Submit another', done: 'Back to forms',
      onSite: 'On site now', noneOnSite: 'No vendors checked in right now.', loading: 'Loading…',
      loadFailed: "Couldn't load the list.", since: 'since', checkedIn: 'Checked in',
      checkedInSub: 'When they leave, open this form and tap Check out next to their name.', checkedOut: 'Checked out',
      backToLog: 'Back to vendor log', total: 'Total', each: 'each', itemName: 'Item name', addRow: 'Add another',
      failed: "Couldn't submit. Check your connection and try again. Your answers are still here.",
      draftRestored: 'Picked up where you left off', needRow: 'Add at least one', leaders: 'Leaders only', lock: 'Leaders'
    },
    es: {
      forms: 'Formularios', search: 'Buscar formularios', noMatch: 'Ningún formulario coincide.', draft: 'Borrador',
      back: 'Formularios', optional: 'opcional', required: 'Obligatorio', submit: 'Enviar', submitting: 'Enviando…',
      reset: 'Borrar', tapAgain: 'Toca otra vez para borrar', addPhoto: 'Agregar foto', addFile: 'Agregar archivo', remove: 'Quitar',
      badImage: 'No se pudo leer ese archivo', tooBig: 'El archivo es muy grande (máx. 4 MB)', signHere: 'Firma aquí', clear: 'Borrar firma', yes: 'Sí', no: 'No',
      fixErrors: 'Revisa los campos marcados', mustAck: 'Confirma para continuar', needPhoto: 'Agrega al menos una foto',
      badEmail: 'Escribe un correo válido', badPhone: 'Escribe un número de 10 dígitos', min: 'Debe ser al menos', max: 'Debe ser como máximo',
      success: 'Enviado', successSub: 'Gracias, ya lo recibimos.', another: 'Enviar otro', done: 'Volver a formularios',
      onSite: 'En el restaurante ahora', noneOnSite: 'No hay proveedores registrados ahora.', loading: 'Cargando…',
      loadFailed: 'No se pudo cargar la lista.', since: 'desde', checkedIn: 'Entrada registrada',
      checkedInSub: 'Cuando se vayan, abre este formulario y toca Registrar salida junto a su nombre.', checkedOut: 'Salida registrada',
      backToLog: 'Volver al registro', total: 'Total', each: 'c/u', itemName: 'Nombre del artículo', addRow: 'Agregar otro',
      failed: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo. Tus respuestas siguen aquí.',
      draftRestored: 'Seguimos donde lo dejaste', needRow: 'Agrega al menos uno', leaders: 'Solo líderes', lock: 'Líderes'
    }
  };

  /* ---------- icons ---------- */
  var ICONS = {
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    truck: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    dollar: '<path d="M12 3v18M16.5 7c-.9-1.2-2.6-1.8-4.5-1.8-2.4 0-4.2 1.1-4.2 3 0 4.4 9 2.2 9 6.6 0 2-1.9 3.2-4.6 3.2-2 0-3.9-.7-4.9-2"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3z"/><circle cx="7.5" cy="13" r=".8"/><circle cx="16.5" cy="13" r=".8"/>',
    bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.2.7 3.5 2.8 3.5 5.8"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    door: '<path d="M6 21V4h9v17M15 6h3v15M11 12h.01"/>',
    bandage: '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M10 10l4 4"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    back: '<path d="M15 5l-7 7 7 7"/>', chev: '<path d="M9 5l7 7-7 7"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>'
  };
  function icon(name, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 20); s.setAttribute('height', size || 20);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || ICONS.file;
    return s;
  }

  /* ---------- DOM helper (all user text goes in as text nodes, never HTML) ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }

  function flat(fields, out) {
    out = out || [];
    (fields || []).forEach(function (f) { out.push(f); if (f.fields) flat(f.fields, out); });
    return out;
  }
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowLocal() { var d = new Date(); return today() + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function money(n) { var x = Number(n) || 0; return (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(2); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function fmtPhone(v) {
    var d = String(v).replace(/\D/g, '').slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function fmtDate(v) {
    if (!v) return '';
    var d = new Date(String(v).length === 10 ? v + 'T12:00' : v);
    if (isNaN(d)) return String(v);
    var o = { month: 'short', day: 'numeric', year: 'numeric' };
    if (String(v).length > 10) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return d.toLocaleString([], o);
  }
  function ago(ms) {
    var s = (Date.now() - ms) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
    return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function compressImage(file, maxDim, q) {
    maxDim = maxDim || 1280; q = q || 0.72;
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, maxDim / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }
  function readRaw(file) {
    return new Promise(function (res, rej) {
      if (file.size > 4 * 1024 * 1024) return rej(new Error('too big'));
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file);
    });
  }

  /* ---------- default HTTP adapter (talks to forms_api.py) ---------- */
  function httpApi(base) {
    var enc = encodeURIComponent;
    function req(method, path, body) {
      return fetch(base + path, {
        method: method, credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          return j;
        });
      });
    }
    function qs(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return k + '=' + enc(o[k]); }).join('&'); }
    return {
      submit: function (p) { return req('POST', '/submit', p); },
      listOpen: function (formId) { return req('GET', '/open/' + enc(formId)).then(function (j) { return j.items || []; }); },
      completeStage: function (formId, id, stage, p) { return req('POST', '/' + enc(formId) + '/' + enc(id) + '/stage/' + enc(stage), p); },
      listSubmissions: function (f) { return req('GET', '/submissions?' + qs(f || {})).then(function (j) { return j.items || []; }); },
      getSubmission: function (formId, id) { return req('GET', '/submission/' + enc(formId) + '/' + enc(id)); },
      setStatus: function (formId, id, status, note, by) { return req('POST', '/submission/' + enc(formId) + '/' + enc(id) + '/status', { status: status, note: note, by: by }); },
      fileUrl: function (formId, id, field, i) { return base + '/file/' + enc(formId) + '/' + enc(id) + '/' + enc(field) + '/' + i; }
    };
  }

  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) { toastEl = h('div', { class: 'of-toast', role: 'status' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function config(opts) {
    return {
      defs: opts.definitions || global.OPS_FORM_DEFINITIONS || [],
      cats: opts.categories || global.OPS_FORM_CATEGORIES || [],
      api: opts.api || httpApi(opts.endpoint || '/api/forms'),
      stores: opts.stores || [{ v: 'buda', l: 'Buda' }, { v: 'west_buda', l: 'West Buda' }]
    };
  }

  /* ======================================================================= */
  function mount(root, opts) {
    opts = opts || {};
    injectCss();
    var C = config(opts), defs = C.defs, cats = C.cats, api = C.api, stores = C.stores;
    var lang = opts.lang || lsGet('lang', 'en');
    var roster = opts.roster || null;
    var isLeader = !!opts.isLeader;
    var query = '';
    var ctx = null;
    root.classList.add('of-root');

    function t(k) { return (UI[lang] && UI[lang][k]) || UI.en[k] || k; }
    function L(o, k) { if (!o) return ''; var es = o[k + '_es']; return (lang === 'es' && es != null) ? es : o[k]; }
    function msg(m) { return typeof m === 'string' ? t(m) : (m[lang] || m.en); }
    function visibleDefs() { return defs.filter(function (d) { return isLeader || d.audience !== 'leaders'; }); }

    function langBtn() {
      return h('button', { type: 'button', class: 'of-lang', onclick: function () {
        lang = lang === 'en' ? 'es' : 'en'; lsSet('lang', lang);
        if (ctx && ctx.view === 'form') renderForm(); else renderLibrary();
      } }, lang === 'en' ? 'Español' : 'English');
    }

    /* ---------------- library ---------------- */
    function draftKey(def, stageId, recId) { return 'draft:' + def.id + ':' + (stageId || 'main') + (recId ? ':' + recId : ''); }
    function hasDraft(d) { return !d.noDraft && lsGet(draftKey(d, d.stages ? d.stages[0].id : null), null) != null; }

    function renderLibrary() {
      ctx = null;
      root.innerHTML = '';
      var list = h('div', { class: 'of-lib' });
      var input = h('input', { id: 'of-search', class: 'of-search-input', type: 'search', placeholder: t('search'), 'aria-label': t('search') });
      input.value = query;
      input.addEventListener('input', function () { query = input.value; draw(); });
      root.append(
        h('div', { class: 'of-top' }, h('h2', { class: 'of-h1' }, t('forms')), langBtn()),
        h('label', { class: 'of-search' }, icon('search', 18), input),
        list);
      function draw() {
        list.innerHTML = '';
        var q = query.trim().toLowerCase(), any = false, vis = visibleDefs();
        var match = function (d) {
          return !q || [d.title, d.title_es, d.blurb, d.blurb_es, (d.keywords || []).join(' ')].join(' ').toLowerCase().indexOf(q) > -1;
        };
        var order = cats.length ? cats : vis.map(function (d) { return d.category; })
          .filter(function (c, i, a) { return a.indexOf(c) === i; }).map(function (c) { return { id: c, l: c }; });
        order.forEach(function (c) {
          var items = vis.filter(function (d) { return d.category === c.id && match(d); });
          if (!items.length) return;
          any = true;
          list.append(h('div', { class: 'of-cat' }, L(c, 'l')));
          items.forEach(function (d) {
            list.append(h('button', { type: 'button', class: 'of-card', onclick: function () { openForm(d); } },
              h('span', { class: 'of-card-ic' }, icon(d.icon, 22)),
              h('span', { class: 'of-card-tx' }, h('span', { class: 'of-card-t' }, L(d, 'title')), h('span', { class: 'of-card-b' }, L(d, 'blurb') || '')),
              hasDraft(d) ? h('span', { class: 'of-pill' }, t('draft')) : null,
              d.audience === 'leaders' ? h('span', { class: 'of-pill lead', title: t('leaders') }, icon('lock', 12), t('lock')) : null,
              h('span', { class: 'of-chev' }, icon('chev', 18))));
          });
        });
        if (!any) list.append(h('div', { class: 'of-empty' }, t('noMatch')));
      }
      draw();
    }

    /* ---------------- open a form ---------------- */
    function openForm(def, stageId, record) {
      var stages = def.stages || [{ id: null, fields: def.fields }];
      var stage = stageId ? stages.filter(function (s) { return s.id === stageId; })[0] : stages[0];
      var fields = stage.fields;
      var key = draftKey(def, stage.id, record && record.id);
      var values = initialValues(def, fields);
      var draft = def.noDraft ? null : lsGet(key, null);
      if (draft) Object.keys(draft).forEach(function (k) { values[k] = draft[k]; });
      var parent = {};
      (function walk(fs, p) { fs.forEach(function (f) { if (p && f.id) parent[f.id] = p; if (f.fields) walk(f.fields, f); }); })(fields, null);
      ctx = { view: 'form', def: def, stage: stage, stages: stages, record: record || null, fields: fields,
              values: values, draftKey: key, errors: {}, parent: parent, els: {}, calcEls: {} };
      renderForm();
      if (draft) toast(t('draftRestored'));
      try { root.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ }
    }

    function initialValues(def, fields) {
      var v = {};
      flat(fields).forEach(function (f) {
        if (!f.id) return;
        if (f.type === 'store') { var s = stores.length === 1 ? stores[0].v : lsGet('store', null); if (s && stores.some(function (x) { return x.v === s; })) v[f.id] = s; }
        if (f.remember && !def.noRemember) { var r = lsGet('remember:' + f.remember, ''); if (r) v[f.id] = r; }
        if (f.default === 'today') v[f.id] = today();
        else if (f.default === 'now') v[f.id] = nowLocal();
        else if (f.default != null && v[f.id] == null) v[f.id] = f.default;
        if (f.type === 'items') v[f.id] = { qty: {}, custom: {}, total: 0 };
        if (f.type === 'repeat') v[f.id] = [{}];
        if ((f.type === 'multi' || f.type === 'photo' || f.type === 'file') && !v[f.id]) v[f.id] = [];
      });
      return v;
    }

    function isVisible(f) {
      var p = ctx.parent[f.id];
      if (p && !isVisible(p)) return false;
      var c = f.showIf;
      if (!c) return true;
      if (typeof c === 'function') { try { return !!c(ctx.values); } catch (e) { return false; } }
      var v = ctx.values[c.field];
      if ('eq' in c) return v === c.eq;
      if (c['in']) return c['in'].indexOf(v) > -1;
      if (c.truthy) return !!v;
      return true;
    }

    var saveTimer;
    function saveDraft() {
      if (ctx.def.noDraft) return;
      clearTimeout(saveTimer);
      var c = ctx;
      saveTimer = setTimeout(function () {
        var out = {};
        flat(c.fields).forEach(function (f) {
          if (!f.id || ['photo', 'file', 'signature', 'calc', 'group', 'info'].indexOf(f.type) > -1) return;
          if (c.values[f.id] != null) out[f.id] = c.values[f.id];
        });
        lsSet(c.draftKey, out);
      }, 400);
    }

    function setVal(id, v) {
      ctx.values[id] = v;
      if (ctx.errors[id]) { delete ctx.errors[id]; paintError(id); }
      saveDraft();
      refresh();
    }

    function calcText(f, val) {
      if (val == null || (typeof val === 'number' && isNaN(val))) return '—';
      if (f.format === 'money') return money(val);
      if (f.format === 'days') return val + ' ' + (lang === 'es' ? (val === 1 ? 'día' : 'días') : (val === 1 ? 'day' : 'days'));
      if (f.format === 'miles') return (Math.round(val * 10) / 10) + ' mi';
      if (f.format === 'percent') return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
      return String(val);
    }

    function refresh() {
      flat(ctx.fields).forEach(function (f) {
        if (f.type !== 'calc') return;
        var val; try { val = f.calc(ctx.values); } catch (e) { val = null; }
        ctx.values[f.id] = val;
        var el = ctx.calcEls[f.id];
        if (!el) return;
        el.innerHTML = '';
        var warn = f.warnIf && val != null && f.warnIf(val, ctx.values);
        var good = !warn && f.okIf && val != null && f.okIf(val, ctx.values);
        el.className = 'of-calc' + (warn ? ' warn' : good ? ' good' : '');
        el.append(h('strong', null, calcText(f, val)),
          warn && f.warnText ? h('span', null, L(f, 'warnText')) : null,
          good && f.okText ? h('span', null, L(f, 'okText')) : null);
      });
      flat(ctx.fields).forEach(function (f) { if (f.id && ctx.els[f.id]) ctx.els[f.id].hidden = !isVisible(f); });
    }

    /* ---------------- render form ---------------- */
    function renderForm() {
      var def = ctx.def, stage = ctx.stage, record = ctx.record;
      ctx.view = 'form'; ctx.els = {}; ctx.calcEls = {};
      root.innerHTML = '';
      root.append(h('div', { class: 'of-top' },
        h('button', { type: 'button', class: 'of-back', onclick: function () { if (record) openForm(def); else renderLibrary(); } },
          icon('back', 18), record ? t('backToLog') : t('back')),
        langBtn()));
      root.append(h('div', { class: 'of-head' },
        h('div', { class: 'of-head-ic' }, icon(def.icon, 24)),
        h('div', null, h('h2', { class: 'of-h1' }, L(def, 'title')), def.intro ? h('p', { class: 'of-sub' }, L(def, 'intro')) : null)));
      if (def.stages && !record) root.append(openPanel());
      if (record) { var s = summarize(def, record); root.append(h('div', { class: 'of-banner' }, h('div', { class: 'of-visit-t' }, s.title), h('div', { class: 'of-visit-s' }, s.sub))); }
      if (def.stages) root.append(h('div', { class: 'of-cat' }, L(stage, 'label')));

      var form = h('form', { class: 'of-form', novalidate: true });
      form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
      ctx.fields.forEach(function (f) { form.append(renderField(f)); });
      var label = def.stages ? L(stage, 'label') : (L(def, 'submitLabel') || t('submit'));
      ctx.submitLabel = label;
      ctx.submitBtn = h('button', { type: 'submit', class: 'of-submit' }, label);
      form.append(h('div', { class: 'of-bar' }, h('button', { type: 'button', class: 'of-ghost', onclick: resetForm }, t('reset')), ctx.submitBtn));
      root.append(form);
      refresh();
      Object.keys(ctx.errors).forEach(paintError);
    }

    function renderField(f) {
      var el;
      if (f.type === 'group') {
        el = h('div', { class: 'of-group' + (f.plain ? ' plain' : '') }, f.label ? h('div', { class: 'of-group-t' }, L(f, 'label')) : null, f.fields.map(renderField));
      } else if (f.type === 'info') {
        el = renderInfo(f);
      } else if (f.type === 'store' && stores.length < 2) {
        return null;   // one store: answered on its own (initialValues)
      } else {
        el = wrap(f, control(f));
      }
      if (f.id) ctx.els[f.id] = el;
      return el;
    }

    function wrap(f, ctrl) {
      var lab = f.label ? h('div', { class: 'of-label', id: 'of-l-' + f.id }, L(f, 'label'),
        f.required ? h('span', { class: 'of-req', title: t('required') }, ' *') : (f.type === 'calc' ? null : h('span', { class: 'of-opt' }, ' · ' + t('optional')))) : null;
      return h('div', { class: 'of-field' + (f.type === 'calc' ? ' of-field-calc' : '') }, lab,
        f.help ? h('div', { class: 'of-help' }, L(f, 'help')) : null, ctrl, h('div', { class: 'of-err', role: 'alert' }));
    }

    function renderInfo(f) {
      var body = (L(f, 'text') || []).map(function (p) { return h('p', null, p); });
      var bl = L(f, 'bullets');
      if (bl) body.push(h('ul', null, bl.map(function (b) { return h('li', null, b); })));
      var cls = 'of-info' + (f.tone ? ' ' + f.tone : '');
      if (f.collapsed) return h('details', { class: cls }, h('summary', null, L(f, 'label')), h('div', { class: 'of-info-b' }, body));
      return h('div', { class: cls }, f.label ? h('div', { class: 'of-info-t' }, L(f, 'label')) : null, body);
    }

    function control(f) {
      if (f.options && !isLeader && f.options.some(function (o) { return o.leaderOnly; })) {
        f = Object.assign({}, f, { options: f.options.filter(function (o) { return !o.leaderOnly; }) });
      }
      switch (f.type) {
        case 'store': return segmented(f, stores);
        case 'choice':
          if (f.style === 'chips') return chips(f, f.options, false);
          if (f.style === 'list' || f.options.length > 3 || f.options.some(function (o) { return o.desc; })) return optionList(f);
          return segmented(f, f.options);
        case 'multi': return f.style === 'checks' ? checkList(f) : chips(f, f.options, true);
        case 'yesno': return segmented(f, [{ v: true, l: t('yes') }, { v: false, l: t('no') }]);
        case 'textarea': return textarea(f);
        case 'currency': return currency(f);
        case 'number': return f.stepper ? stepper(f) : numberInput(f);
        case 'date': case 'time': case 'datetime': return dateInput(f);
        case 'photo': case 'file': return photo(f);
        case 'signature': return signature(f);
        case 'ack': return ack(f);
        case 'items': return items(f);
        case 'repeat': return repeat(f);
        case 'quickpick': return quickpick(f);
        case 'calc': var c = h('div', { class: 'of-calc' }); ctx.calcEls[f.id] = c; return c;
        default: return textInput(f);
      }
    }

    /* ---------------- controls ---------------- */
    function segmented(f, options) {
      var box = h('div', { class: 'of-seg', role: 'radiogroup', 'aria-labelledby': 'of-l-' + f.id });
      function paint() { Array.prototype.forEach.call(box.children, function (b, i) { b.setAttribute('aria-checked', String(ctx.values[f.id] === options[i].v)); }); }
      options.forEach(function (o) {
        box.append(h('button', { type: 'button', class: 'of-seg-b', role: 'radio', onclick: function () {
          setVal(f.id, o.v); paint(); if (f.type === 'store') lsSet('store', o.v);
        } }, L(o, 'l')));
      });
      paint();
      return box;
    }

    function optionList(f) {
      var box = h('div', { class: 'of-opts', role: 'radiogroup', 'aria-labelledby': 'of-l-' + f.id });
      function paint() { Array.prototype.forEach.call(box.children, function (b, i) { b.setAttribute('aria-checked', String(ctx.values[f.id] === f.options[i].v)); }); }
      f.options.forEach(function (o) {
        box.append(h('button', { type: 'button', class: 'of-opt-b', role: 'radio', onclick: function () { setVal(f.id, o.v); paint(); } },
          h('span', { class: 'of-dot' }),
          h('span', null,
            h('span', { class: 'of-opt-l' }, o.tone ? h('span', { class: 'of-tone ' + o.tone }) : null, L(o, 'l')),
            o.desc ? h('span', { class: 'of-opt-d' }, L(o, 'desc')) : null)));
      });
      paint();
      return box;
    }

    function chips(f, options, multi) {
      var box = h('div', { class: 'of-chips', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': 'of-l-' + f.id });
      function sel() { return multi ? (ctx.values[f.id] || []) : ctx.values[f.id]; }
      function paint() {
        Array.prototype.forEach.call(box.children, function (b, i) {
          var v = options[i].v; b.setAttribute('aria-pressed', String(multi ? sel().indexOf(v) > -1 : sel() === v));
        });
      }
      options.forEach(function (o) {
        box.append(h('button', { type: 'button', class: 'of-chip', onclick: function () {
          if (multi) { var a = sel().slice(), i = a.indexOf(o.v); if (i < 0) a.push(o.v); else a.splice(i, 1); setVal(f.id, a); }
          else setVal(f.id, o.v);
          paint();
        } }, L(o, 'l')));
      });
      paint();
      return box;
    }

    function checkList(f) {
      var box = h('div', { class: 'of-checks' });
      var sections = f.sections || [{ items: f.options }];
      sections.forEach(function (sec) {
        if (sec.label) box.append(h('div', { class: 'of-check-h' }, L(sec, 'label')));
        sec.items.forEach(function (o) {
          var b = h('button', { type: 'button', class: 'of-ack of-check', role: 'checkbox' }, h('span', { class: 'of-box' }, icon('check', 15)), h('span', null, L(o, 'l')));
          function paint() { b.setAttribute('aria-checked', String((ctx.values[f.id] || []).indexOf(o.v) > -1)); }
          b.addEventListener('click', function () {
            var a = (ctx.values[f.id] || []).slice(), i = a.indexOf(o.v);
            if (i < 0) a.push(o.v); else a.splice(i, 1);
            setVal(f.id, a); paint();
          });
          paint(); box.append(b);
        });
      });
      return box;
    }

    function textInput(f) {
      var type = f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text';
      var inp = h('input', {
        id: 'of-f-' + f.id, class: 'of-input', type: type, 'aria-labelledby': 'of-l-' + f.id, placeholder: L(f, 'placeholder') || '',
        autocomplete: f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'off',
        inputmode: f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : null,
        autocapitalize: f.type === 'email' ? 'off' : (f.type === 'person' ? 'words' : 'sentences')
      });
      inp.value = ctx.values[f.id] || '';
      if (f.type === 'person' && roster && roster.length) { ensureRoster(); inp.setAttribute('list', 'of-roster-list'); }
      inp.addEventListener('input', function () {
        if (f.type === 'phone') { var p = fmtPhone(inp.value); if (p !== inp.value) inp.value = p; }
        setVal(f.id, inp.value);
      });
      return inp;
    }
    function ensureRoster() {
      var dl = document.getElementById('of-roster-list');
      if (!dl) { dl = h('datalist', { id: 'of-roster-list' }); document.body.appendChild(dl); }
      dl.innerHTML = '';
      (roster || []).forEach(function (n) { dl.appendChild(h('option', { value: n })); });
    }

    function textarea(f) {
      var ta = h('textarea', { id: 'of-f-' + f.id, class: 'of-input of-ta', rows: 3, 'aria-labelledby': 'of-l-' + f.id, placeholder: L(f, 'placeholder') || '' });
      ta.value = ctx.values[f.id] || '';
      function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; }
      ta.addEventListener('input', function () { grow(); setVal(f.id, ta.value); });
      requestAnimationFrame(grow);
      return ta;
    }

    function currency(f) {
      var inp = h('input', { id: 'of-f-' + f.id, class: 'of-input of-money', type: 'text', inputmode: 'decimal', 'aria-labelledby': 'of-l-' + f.id, placeholder: '0.00' });
      var v = ctx.values[f.id];
      inp.value = (v === '' || v == null) ? '' : Number(v).toFixed(2);
      inp.addEventListener('input', function () {
        var clean = inp.value.replace(f.allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g, '');
        if (clean !== inp.value) inp.value = clean;
        var n = parseFloat(clean); setVal(f.id, isNaN(n) ? '' : n);
      });
      inp.addEventListener('blur', function () { var n = parseFloat(inp.value); if (!isNaN(n)) inp.value = n.toFixed(2); });
      return h('div', { class: 'of-affix' }, h('span', { class: 'of-pre' }, '$'), inp);
    }

    function numberInput(f) {
      var inp = h('input', { id: 'of-f-' + f.id, class: 'of-input', type: 'text', inputmode: 'decimal', 'aria-labelledby': 'of-l-' + f.id, placeholder: L(f, 'placeholder') || '' });
      var v = ctx.values[f.id]; inp.value = v == null ? '' : v;
      inp.addEventListener('input', function () {
        var clean = inp.value.replace(/[^0-9.]/g, ''); if (clean !== inp.value) inp.value = clean;
        var n = parseFloat(clean); setVal(f.id, isNaN(n) ? '' : n);
      });
      return f.suffix ? h('div', { class: 'of-affix' }, inp, h('span', { class: 'of-suf' }, L(f, 'suffix'))) : inp;
    }

    function stepper(f) {
      var step = f.step || 1, min = f.min != null ? f.min : 0, max = f.max != null ? f.max : 9999;
      var out = h('input', { id: 'of-f-' + f.id, class: 'of-input of-step-v', type: 'text', inputmode: 'decimal', 'aria-labelledby': 'of-l-' + f.id });
      var v = ctx.values[f.id]; out.value = v == null ? '' : v;
      function set(n) { n = Math.max(min, Math.min(max, Math.round(n / step) * step)); out.value = String(n); setVal(f.id, n); }
      out.addEventListener('input', function () { var n = parseFloat(out.value); setVal(f.id, isNaN(n) ? '' : n); });
      return h('div', { class: 'of-step' },
        h('button', { type: 'button', class: 'of-step-b', 'aria-label': 'Decrease', onclick: function () { set(num(ctx.values[f.id]) - step); } }, '−'),
        out,
        h('button', { type: 'button', class: 'of-step-b', 'aria-label': 'Increase', onclick: function () { set(num(ctx.values[f.id]) + step); } }, '+'),
        f.suffix ? h('span', { class: 'of-suf' }, L(f, 'suffix')) : null);
    }

    function dateInput(f) {
      var inp = h('input', { id: 'of-f-' + f.id, class: 'of-input', type: f.type === 'datetime' ? 'datetime-local' : f.type, 'aria-labelledby': 'of-l-' + f.id });
      inp.value = ctx.values[f.id] || '';
      inp.addEventListener('input', function () { setVal(f.id, inp.value); });
      inp.addEventListener('change', function () { setVal(f.id, inp.value); });
      return inp;
    }

    function quickpick(f) {
      var inp = textInput(Object.assign({}, f, { type: 'text' }));
      var list = (lang === 'es' && f.chips_es) ? f.chips_es : f.chips;
      var box = h('div', { class: 'of-chips of-qp' }, list.map(function (c) {
        return h('button', { type: 'button', class: 'of-chip of-chip-s', onclick: function () { inp.value = c; setVal(f.id, c); } }, c);
      }));
      return h('div', null, box, inp);
    }

    function photo(f) {
      var isFile = f.type === 'file';
      var max = f.max || (isFile ? 3 : 4);
      var grid = h('div', { class: 'of-photos' });
      var file = h('input', { type: 'file', accept: isFile ? 'image/*,application/pdf' : 'image/*', class: 'of-hidden', multiple: max > 1 });
      var add = h('button', { type: 'button', class: 'of-photo-add' }, icon(isFile ? 'file' : 'camera', 22), h('span', null, isFile ? t('addFile') : t('addPhoto')));
      add.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var picked = Array.prototype.slice.call(file.files);
        file.value = '';
        var list = (ctx.values[f.id] || []).slice();
        (function next(i) {
          if (i >= picked.length || list.length >= max) { setVal(f.id, list); paint(); return; }
          var p = picked[i];
          var job = /^image\//.test(p.type) ? compressImage(p) : (isFile ? readRaw(p) : Promise.reject(new Error('type')));
          job.then(function (d) { list.push(d); next(i + 1); }, function (e) { toast(e && e.message === 'too big' ? t('tooBig') : t('badImage')); next(i + 1); });
        })(0);
      });
      function paint() {
        grid.innerHTML = '';
        (ctx.values[f.id] || []).forEach(function (src, i) {
          var isPdf = /^data:application\/pdf/.test(src);
          grid.append(h('div', { class: 'of-thumb' + (isPdf ? ' pdf' : '') }, isPdf ? h('span', null, icon('file', 26), 'PDF') : h('img', { src: src, alt: '' }),
            h('button', { type: 'button', class: 'of-thumb-x', 'aria-label': t('remove'), onclick: function () {
              var l = ctx.values[f.id].slice(); l.splice(i, 1); setVal(f.id, l); paint();
            } }, icon('x', 14))));
        });
        if ((ctx.values[f.id] || []).length < max) grid.append(add);
      }
      paint();
      return h('div', null, grid, file);
    }

    function signature(f) {
      var c = h('canvas', { class: 'of-sig-c', 'aria-label': L(f, 'label') || t('signHere') });
      var padEl = h('div', { class: 'of-sig' + (ctx.values[f.id] ? ' has' : '') }, c, h('div', { class: 'of-sig-hint' }, t('signHere')));
      var g = null, drawing = false, last = null;
      function setup() {
        var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        if (r.width < 2) return false;
        c.width = r.width * dpr; c.height = r.height * dpr;
        g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
        if (ctx.values[f.id]) { var im = new Image(); im.onload = function () { g.drawImage(im, 0, 0, r.width, r.height); }; im.src = ctx.values[f.id]; }
        return true;
      }
      function pos(e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      c.addEventListener('pointerdown', function (e) {
        if (!g || c.width < 2) setup();
        drawing = true; last = pos(e); try { c.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        padEl.classList.add('has'); e.preventDefault();
      });
      c.addEventListener('pointermove', function (e) {
        if (!drawing || !g) return;
        var p = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p;
      });
      function end() { if (!drawing) return; drawing = false; setVal(f.id, c.toDataURL('image/png')); }
      c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
      requestAnimationFrame(setup);
      var clear = h('button', { type: 'button', class: 'of-link', onclick: function () {
        ctx.values[f.id] = ''; setup(); if (g) g.clearRect(0, 0, c.width, c.height); padEl.classList.remove('has'); setVal(f.id, '');
      } }, t('clear'));
      return h('div', null, padEl, h('div', { class: 'of-sig-row' }, clear));
    }

    function ack(f) {
      var b = h('button', { type: 'button', class: 'of-ack', role: 'checkbox' }, h('span', { class: 'of-box' }, icon('check', 15)), h('span', null, L(f, 'statement')));
      function paint() { b.setAttribute('aria-checked', String(!!ctx.values[f.id])); }
      b.addEventListener('click', function () { setVal(f.id, !ctx.values[f.id]); paint(); });
      paint();
      return b;
    }

    function items(f) {
      var box = h('div', { class: 'of-items' }), totalEl = h('div', { class: 'of-total' });
      function val() { return ctx.values[f.id] || (ctx.values[f.id] = { qty: {}, custom: {}, total: 0 }); }
      function calc() {
        var v = val(), tot = 0;
        f.options.forEach(function (o) {
          if (o.custom) { var c = v.custom[o.v]; if (c && c.on) tot += num(c.cost); }
          else tot += (v.qty[o.v] || 0) * o.price;
        });
        v.total = Math.round(tot * 100) / 100;
        totalEl.innerHTML = ''; totalEl.append(h('span', null, t('total')), h('strong', null, money(v.total)));
      }
      function changed() { calc(); setVal(f.id, val()); }
      f.options.forEach(function (o) {
        if (!o.custom) {
          var q = h('span', { class: 'of-q' }, String(val().qty[o.v] || 0));
          var row = h('div', { class: 'of-item' + ((val().qty[o.v] || 0) > 0 ? ' on' : '') });
          var ch = function (d) { var v = val(); v.qty[o.v] = Math.max(0, (v.qty[o.v] || 0) + d); q.textContent = v.qty[o.v]; row.classList.toggle('on', v.qty[o.v] > 0); changed(); };
          row.append(h('div', { class: 'of-item-l' }, h('span', null, L(o, 'l')), h('span', { class: 'of-item-p' }, money(o.price) + ' ' + t('each'))),
            h('div', { class: 'of-step sm' },
              h('button', { type: 'button', class: 'of-step-b', 'aria-label': 'Remove one', onclick: function () { ch(-1); } }, '−'), q,
              h('button', { type: 'button', class: 'of-step-b', 'aria-label': 'Add one', onclick: function () { ch(1); } }, '+')));
          box.append(row);
        } else {
          var c = val().custom[o.v] || (val().custom[o.v] = { on: false, cost: '', name: '' });
          var cost = h('input', { class: 'of-input of-money', inputmode: 'decimal', placeholder: '0.00', 'aria-label': L(o, 'l') });
          cost.value = c.cost;
          cost.addEventListener('input', function () { cost.value = cost.value.replace(/[^0-9.]/g, ''); c.cost = cost.value; changed(); });
          var name = null;
          if (o.custom === 'named') {
            name = h('input', { class: 'of-input', placeholder: t('itemName'), 'aria-label': t('itemName') });
            name.value = c.name; name.addEventListener('input', function () { c.name = name.value; setVal(f.id, val()); });
          }
          var tog = h('button', { type: 'button', class: 'of-item-tog', role: 'checkbox' }, h('span', { class: 'of-box' }, icon('check', 14)), L(o, 'l'));
          var crow = h('div', { class: 'of-item of-item-c' + (c.on ? ' on' : '') }, tog, h('div', { class: 'of-item-x' }, name, h('div', { class: 'of-affix' }, h('span', { class: 'of-pre' }, '$'), cost)));
          tog.setAttribute('aria-checked', String(c.on));
          tog.addEventListener('click', function () { c.on = !c.on; tog.setAttribute('aria-checked', String(c.on)); crow.classList.toggle('on', c.on); changed(); });
          box.append(crow);
        }
      });
      calc();
      return h('div', null, box, totalEl);
    }

    function repeat(f) {
      var box = h('div', { class: 'of-rep' });
      function rows() { if (!Array.isArray(ctx.values[f.id]) || !ctx.values[f.id].length) ctx.values[f.id] = [{}]; return ctx.values[f.id]; }
      function paint() {
        box.innerHTML = '';
        rows().forEach(function (r, i) {
          var cells = f.columns.map(function (c) {
            var isNum = c.type === 'currency' || c.type === 'number';
            var inp = h('input', { class: 'of-input', placeholder: L(c, 'label'), 'aria-label': L(c, 'label'),
              inputmode: isNum ? 'decimal' : (c.type === 'phone' ? 'tel' : null) });
            inp.value = r[c.id] != null ? r[c.id] : '';
            inp.addEventListener('input', function () {
              var v = inp.value;
              if (c.type === 'phone') { v = fmtPhone(v); inp.value = v; }
              if (isNum) { v = v.replace(c.allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g, ''); inp.value = v; }
              r[c.id] = v; setVal(f.id, rows());
            });
            var cell = c.type === 'currency' ? h('div', { class: 'of-affix' }, h('span', { class: 'of-pre' }, '$'), inp) : inp;
            return h('div', { class: 'of-rep-cell', style: c.grow ? 'flex:' + c.grow : null }, cell);
          });
          box.append(h('div', { class: 'of-rep-row' }, h('div', { class: 'of-rep-cells' }, cells),
            rows().length > 1 ? h('button', { type: 'button', class: 'of-rep-x', 'aria-label': t('remove'), onclick: function () {
              rows().splice(i, 1); setVal(f.id, rows()); paint();
            } }, icon('x', 14)) : null));
        });
        box.append(h('button', { type: 'button', class: 'of-link of-rep-add', onclick: function () { rows().push({}); setVal(f.id, rows()); paint(); } },
          '+ ' + (L(f, 'addLabel') || t('addRow'))));
      }
      paint();
      return box;
    }

    /* ---------------- staged forms (vendor log) ---------------- */
    function openPanel() {
      var def = ctx.def;
      var list = h('div', null, h('div', { class: 'of-visit-s' }, t('loading')));
      var box = h('div', { class: 'of-open' }, h('div', { class: 'of-open-h' }, h('span', { class: 'of-live' }), t('onSite')), list);
      Promise.resolve(api.listOpen(def.id)).then(function (items) {
        list.innerHTML = '';
        if (!items.length) { list.append(h('div', { class: 'of-visit-s' }, t('noneOnSite'))); return; }
        items.forEach(function (it) {
          var s = summarize(def, it);
          list.append(h('div', { class: 'of-visit' },
            h('div', { class: 'of-visit-tx' }, h('div', { class: 'of-visit-t' }, s.title), h('div', { class: 'of-visit-s' }, s.sub)),
            h('button', { type: 'button', class: 'of-sm-btn', onclick: function () { openForm(def, def.stages[1].id, it); } }, L(def.stages[1], 'label'))));
        });
      }, function () { list.innerHTML = ''; list.append(h('div', { class: 'of-visit-s' }, t('loadFailed'))); });
      return box;
    }
    function summarize(def, it) {
      var f0 = flat(def.stages[0].fields);
      var sum = it.summary || it.values || {};
      function lab(k) {
        var f = f0.filter(function (x) { return x.id === k; })[0], v = sum[k];
        if (v == null || v === '') return null;
        if (f && f.options) { var o = f.options.filter(function (o) { return o.v === v; })[0]; return o ? L(o, 'l') : String(v); }
        return String(v);
      }
      var parts = (def.openSummary || []).map(lab).filter(Boolean);
      var st = stores.length > 1 && stores.filter(function (s) { return s.v === it.store; })[0];
      var since = it.createdAt ? new Date(it.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      return { title: parts[0] || '—', sub: parts.slice(1).concat([st && st.l, since && (t('since') + ' ' + since)]).filter(Boolean).join(' · ') };
    }

    /* ---------------- validate + submit ---------------- */
    function isEmpty(f, v) {
      if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return true;
      if (Array.isArray(v)) return f.type === 'repeat' ? !v.some(function (r) { return r && String(r[f.columns[0].id] || '').trim(); }) : !v.length;
      if (f.type === 'ack') return !v;
      if (f.type === 'items') return !(v && v.total > 0);
      if (typeof v === 'string') return !v.trim();
      return false;
    }
    function validate() {
      var errs = {};
      flat(ctx.fields).forEach(function (f) {
        if (!f.id || f.type === 'group' || f.type === 'info' || f.type === 'calc' || !isVisible(f)) return;
        var v = ctx.values[f.id], e = null, empty = isEmpty(f, v);
        if (f.required && empty) e = f.type === 'ack' ? t('mustAck') : f.type === 'photo' ? t('needPhoto') : f.type === 'repeat' ? t('needRow') : t('required');
        else if (!empty) {
          if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e = t('badEmail');
          if (f.type === 'phone' && String(v).replace(/\D/g, '').length !== 10) e = t('badPhone');
          if ((f.type === 'number' || f.type === 'currency') && f.min != null && v < f.min) e = t('min') + ' ' + f.min;
          if ((f.type === 'number' || f.type === 'currency') && f.max != null && v > f.max) e = t('max') + ' ' + f.max;
        }
        if (!e && f.check) { var r = f.check(v, ctx.values); if (r) e = msg(r); }
        if (e) errs[f.id] = e;
      });
      Object.keys(ctx.errors).forEach(function (id) { if (!errs[id]) { delete ctx.errors[id]; paintError(id); } });
      Object.keys(errs).forEach(function (id) { ctx.errors[id] = errs[id]; paintError(id); });
      return Object.keys(errs);
    }
    function paintError(id) {
      var el = ctx.els[id]; if (!el) return;
      var box = null;
      for (var i = 0; i < el.children.length; i++) if (el.children[i].classList.contains('of-err')) box = el.children[i];
      if (box) box.textContent = ctx.errors[id] || '';
      el.classList.toggle('bad', !!ctx.errors[id]);
    }

    function submit() {
      var bad = validate();
      if (bad.length) {
        var el = ctx.els[bad[0]]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(t('fixErrors')); return;
      }
      var c = ctx, def = c.def, values = {}, files = {};
      flat(c.fields).forEach(function (f) {
        if (!f.id || f.type === 'group' || f.type === 'info' || !isVisible(f)) return;
        var v = c.values[f.id];
        if (isEmpty(f, v) && f.type !== 'yesno' && f.type !== 'calc') return;
        if (f.type === 'photo' || f.type === 'file') files[f.id] = v;
        else if (f.type === 'signature') files[f.id] = [v];
        else if (f.type === 'repeat') values[f.id] = v.filter(function (r) { return r && String(r[f.columns[0].id] || '').trim(); });
        else values[f.id] = v;
      });
      var anon = flat(c.fields).filter(function (f) { return f.role === 'anonymous'; })[0];
      var isAnon = anon && values[anon.id] === true;
      var submitter = flat(c.fields).filter(function (f) { return f.role === 'submitter' && isVisible(f); })[0];
      var payload = {
        formId: def.id, version: def.version || 1, stage: c.stage.id || null,
        store: values.store || (c.record && c.record.store) || null,
        submittedBy: isAnon ? null : (submitter ? (values[submitter.id] || null) : null),
        anonymous: !!isAnon,
        values: values, files: files, clientTime: new Date().toISOString(), lang: lang
      };
      if (!def.noRemember) flat(c.fields).forEach(function (f) { if (f.remember && values[f.id]) lsSet('remember:' + f.remember, values[f.id]); });
      c.submitBtn.disabled = true; c.submitBtn.textContent = t('submitting');
      var p = c.record ? api.completeStage(def.id, c.record.id, c.stage.id, payload) : api.submit(payload);
      Promise.resolve(p).then(function (res) {
        clearTimeout(saveTimer); lsDel(c.draftKey);
        if (opts.onSubmitted) { try { opts.onSubmitted({ def: def, stage: c.stage.id, payload: payload, result: res }); } catch (e) { /* ignore */ } }
        renderSuccess(c);
      }, function () {
        toast(t('failed')); c.submitBtn.disabled = false; c.submitBtn.textContent = c.submitLabel;
      });
    }

    function renderSuccess(c) {
      var def = c.def, isCheckin = def.stages && !c.record;
      ctx = { view: 'done' };
      root.innerHTML = '';
      root.append(h('div', { class: 'of-done' },
        h('div', { class: 'of-done-ic' }, icon('check', 34)),
        h('h2', { class: 'of-h1' }, isCheckin ? t('checkedIn') : c.record ? t('checkedOut') : t('success')),
        h('p', { class: 'of-sub' }, isCheckin ? t('checkedInSub') : (L(def, 'successText') || t('successSub'))),
        h('div', { class: 'of-done-b' },
          h('button', { type: 'button', class: 'of-submit', onclick: function () { openForm(def); } }, def.stages ? t('backToLog') : t('another')),
          h('button', { type: 'button', class: 'of-ghost', onclick: renderLibrary }, t('done')))));
      try { root.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ }
    }

    function resetForm(e) {
      var b = e.currentTarget;
      if (!b.dataset.arm) {
        b.dataset.arm = '1'; b.textContent = t('tapAgain');
        setTimeout(function () { if (b.isConnected) { delete b.dataset.arm; b.textContent = t('reset'); } }, 3000);
        return;
      }
      lsDel(ctx.draftKey);
      openForm(ctx.def, ctx.stage.id, ctx.record);
    }

    renderLibrary();
    return {
      open: function (id) { var d = defs.filter(function (x) { return x.id === id; })[0]; if (d) openForm(d); },
      setRoster: function (list) { roster = list; if (document.getElementById('of-roster-list')) ensureRoster(); },
      setLang: function (l) { lang = l; lsSet('lang', l); if (ctx && ctx.view === 'form') renderForm(); else renderLibrary(); },
      setLeader: function (b) { isLeader = !!b; if (!ctx || ctx.view !== 'form') renderLibrary(); },
      home: renderLibrary
    };
  }

  /* ======================================================================= */
  /* Manager inbox: browse, read and close out submissions (leaders only)    */
  /* ======================================================================= */
  var STATUSES = [
    { v: 'new', l: 'New' }, { v: 'in_progress', l: 'In progress' }, { v: 'done', l: 'Done' }
  ];

  function mountInbox(root, opts) {
    opts = opts || {};
    injectCss();
    var C = config(opts), defs = C.defs, api = C.api, stores = C.stores;
    var byId = {}; defs.forEach(function (d) { byId[d.id] = d; });
    var filt = { formId: '', status: 'new', store: '' };
    root.classList.add('of-root');

    function storeName(v) { if (stores.length < 2) return ''; var s = stores.filter(function (x) { return x.v === v; })[0]; return s ? s.l : (v || ''); }
    function allFields(def) {
      var out = [];
      (def.stages || [{ fields: def.fields }]).forEach(function (s) { flat(s.fields).forEach(function (f) { out.push(f); }); });
      return out;
    }

    function list() {
      root.innerHTML = '';
      var formSel = h('select', { id: 'of-inbox-form', class: 'of-input of-select', 'aria-label': 'Form' },
        h('option', { value: '' }, 'All forms'),
        defs.map(function (d) { return h('option', { value: d.id }, d.title); }));
      formSel.value = filt.formId;
      formSel.addEventListener('change', function () { filt.formId = formSel.value; load(); });
      function seg(opts2, key) {
        var box = h('div', { class: 'of-seg of-seg-sm', role: 'radiogroup' });
        opts2.forEach(function (o) {
          var b = h('button', { type: 'button', class: 'of-seg-b', role: 'radio', 'aria-checked': String(filt[key] === o.v), onclick: function () {
            filt[key] = o.v; Array.prototype.forEach.call(box.children, function (x) { x.setAttribute('aria-checked', 'false'); }); b.setAttribute('aria-checked', 'true'); load();
          } }, o.l);
          box.append(b);
        });
        return box;
      }
      var rows = h('div', { class: 'of-inbox-list' });
      root.append(
        h('div', { class: 'of-top' }, h('h2', { class: 'of-h1' }, 'Form submissions')),
        h('div', { class: 'of-filters' }, formSel,
          seg(STATUSES.concat([{ v: '', l: 'All' }]), 'status'),
          stores.length > 1 ? seg([{ v: '', l: 'Both stores' }].concat(stores), 'store') : null,
          h('button', { type: 'button', class: 'of-ghost of-export', onclick: function () { exportSheet(this); } }, 'Export spreadsheet')),
        rows);
      function load() {
        rows.innerHTML = ''; rows.append(h('div', { class: 'of-empty' }, 'Loading…'));
        Promise.resolve(api.listSubmissions(filt)).then(function (items) {
          rows.innerHTML = '';
          if (!items.length) { rows.append(h('div', { class: 'of-empty' }, 'Nothing here. You are caught up.')); return; }
          items.forEach(function (it) {
            var def = byId[it.formId] || { title: it.formId, icon: 'file' };
            var line = (def.inboxSummary || []).map(function (k) { return shortVal(def, k, (it.values || {})[k]); }).filter(Boolean).join(' · ');
            rows.append(h('button', { type: 'button', class: 'of-card of-row', onclick: function () { detail(it.formId, it.id); } },
              h('span', { class: 'of-card-ic' }, icon(def.icon, 20)),
              h('span', { class: 'of-card-tx' },
                h('span', { class: 'of-card-t' }, def.title, def.sensitive ? h('span', { class: 'of-lock', title: 'Sensitive' }, icon('lock', 13)) : null),
                h('span', { class: 'of-card-b' }, line || '—'),
                h('span', { class: 'of-meta' }, [it.anonymous ? 'Anonymous' : (it.submittedBy || 'Unknown'), storeName(it.store), ago(it.createdAt)].filter(Boolean).join(' · '))),
              h('span', { class: 'of-status s-' + (it.status || 'new') }, statusLabel(it.status))));
          });
        }, function (e) { rows.innerHTML = ''; rows.append(h('div', { class: 'of-empty' }, "Couldn't load submissions. " + (e && e.message ? '(' + e.message + ')' : ''))); });
      }
      load();
    }

    // Export spreadsheet (Tim, Oct 23 2026): what the filters show, one sheet
    // per form, a column per question, as Excel (CSV if Excel can't be made).
    function cellText(f, v) {
      if (v == null || v === '') return '';
      switch (f.type) {
        case 'choice': return optLabel(f, v);
        case 'store': return (stores.filter(function (x) { return x.v === v; })[0] || { l: v }).l;
        case 'multi':
          var all = f.options || [];
          if (f.sections) f.sections.forEach(function (s) { all = all.concat(s.items); });
          return (Array.isArray(v) ? v : []).map(function (x) { var o = all.filter(function (y) { return y.v === x; })[0]; return o ? o.l : x; }).join(', ');
        case 'yesno': return v ? 'Yes' : 'No';
        case 'currency': case 'number': return Number(v);
        case 'items': return v && v.total != null ? Number(v.total) : '';
        case 'repeat': return (Array.isArray(v) ? v : []).map(function (r) { return f.columns.map(function (c) { return r[c.id]; }).filter(function (x) { return x != null && x !== ''; }).join(' '); }).join('; ');
        case 'ack': return v ? 'Yes' : '';
        default: return typeof v === 'object' ? JSON.stringify(v) : v;
      }
    }
    var SKIP_IN_SHEET = ['info', 'group', 'photo', 'file', 'signature'];
    function sheetRows(def, items) {
      var fields = allFields(def).filter(function (f) { return f.id && SKIP_IN_SHEET.indexOf(f.type) === -1 && !(f.type === 'store' && stores.length < 2); });
      var head = ['Submitted', 'Status', 'Submitted by'].concat(fields.map(function (f) { return f.label || f.id; }));
      var body = items.map(function (it) {
        var vals = it.values || {};
        return [new Date(it.createdAt).toLocaleString('en-US'), statusLabel(it.status), it.anonymous ? 'Anonymous' : (it.submittedBy || '')]
          .concat(fields.map(function (f) { return cellText(f, vals[f.id]); }));
      });
      return [head].concat(body);
    }
    function exportSheet(btn) {
      var was = btn.textContent;
      btn.disabled = true; btn.textContent = 'Exporting…';
      Promise.resolve(api.listSubmissions(filt)).then(function (items) {
        if (!items.length) { btn.textContent = 'Nothing to export'; return; }
        var byForm = {};
        items.forEach(function (it) { (byForm[it.formId] = byForm[it.formId] || []).push(it); });
        var stamp = new Date().toISOString().slice(0, 10);
        if (global.XLSX) {
          var wb = global.XLSX.utils.book_new(), used = {};
          Object.keys(byForm).forEach(function (id) {
            var def = byId[id] || { title: id, fields: [] };
            var name = String(def.title).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28), n = 2, base = name;
            while (used[name]) name = base.slice(0, 26) + ' ' + (n++);
            used[name] = true;
            global.XLSX.utils.book_append_sheet(wb, global.XLSX.utils.aoa_to_sheet(sheetRows(def, byForm[id])), name);
          });
          global.XLSX.writeFile(wb, 'Form submissions ' + stamp + '.xlsx');
        } else {
          var lines = [];
          Object.keys(byForm).forEach(function (id) {
            var def = byId[id] || { title: id, fields: [] };
            sheetRows(def, byForm[id]).forEach(function (r, i) { lines.push([i ? def.title : 'Form'].concat(r).map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',')); });
            lines.push('');
          });
          var a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: 'Form submissions ' + stamp + '.csv' });
          document.body.append(a); a.click(); a.remove();
        }
        btn.textContent = 'Exported ' + items.length;
      }, function (e) { btn.textContent = "Couldn't export"; }).then(function () {
        setTimeout(function () { btn.disabled = false; btn.textContent = was; }, 2500);
      });
    }

    function statusLabel(s) {
      if (s === 'open') return 'On site';
      var o = STATUSES.filter(function (x) { return x.v === s; })[0]; return o ? o.l : 'New';
    }

    function optLabel(f, v) { var o = (f.options || []).filter(function (x) { return x.v === v; })[0]; return o ? o.l : String(v); }
    function shortVal(def, k, v) {
      if (v == null || v === '') return null;
      var f = allFields(def).filter(function (x) { return x.id === k; })[0];
      if (!f) return String(v);
      if (f.type === 'choice') return optLabel(f, v);
      if (f.type === 'currency' || f.format === 'money') return money(v);
      if (f.type === 'date' || f.type === 'datetime') return fmtDate(v);
      if (f.type === 'items') return money(v.total);
      if (f.type === 'repeat') return v.map(function (r) { return r[f.columns[0].id]; }).join(', ');
      return String(v).length > 60 ? String(v).slice(0, 57) + '…' : String(v);
    }

    function renderValue(sub, f, v) {
      switch (f.type) {
        case 'choice': case 'store': return f.type === 'store' ? storeName(v) : optLabel(f, v);
        case 'multi':
          var opts2 = f.options || [];
          if (f.sections) f.sections.forEach(function (s) { opts2 = opts2.concat(s.items); });
          if (f.sections) {
            return h('ul', { class: 'of-dl-list' }, opts2.map(function (o) {
              var done = v.indexOf(o.v) > -1;
              return h('li', { class: done ? 'ok' : 'miss' }, (done ? '✓ ' : '○ ') + o.l);
            }));
          }
          return v.map(function (x) { var o = opts2.filter(function (y) { return y.v === x; })[0]; return o ? o.l : x; }).join(', ');
        case 'yesno': return v ? 'Yes' : 'No';
        case 'currency': return money(v);
        case 'calc': return calcFmt(f, v);
        case 'date': case 'datetime': return fmtDate(v);
        case 'ack': return '✓ ' + f.statement;
        case 'items':
          var lines = [];
          f.options.forEach(function (o) {
            if (!o.custom && v.qty && v.qty[o.v]) lines.push(o.l + ' × ' + v.qty[o.v] + ' = ' + money(v.qty[o.v] * o.price));
            if (o.custom && v.custom && v.custom[o.v] && v.custom[o.v].on) lines.push((v.custom[o.v].name || o.l) + ' = ' + money(v.custom[o.v].cost));
          });
          lines.push('Total ' + money(v.total));
          return h('ul', { class: 'of-dl-list' }, lines.map(function (l) { return h('li', null, l); }));
        case 'repeat':
          return h('ul', { class: 'of-dl-list' }, v.map(function (r) {
            return h('li', null, f.columns.map(function (c) { return r[c.id] ? (c.type === 'currency' ? money(r[c.id]) : r[c.id]) : null; }).filter(Boolean).join(' · '));
          }));
        default: return String(v);
      }
    }
    function calcFmt(f, v) {
      if (v == null) return '—';
      if (f.format === 'money') return money(v);
      if (f.format === 'days') return v + (v === 1 ? ' day' : ' days');
      if (f.format === 'miles') return (Math.round(v * 10) / 10) + ' mi';
      if (f.format === 'percent') return (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';
      return String(v);
    }

    function fieldsBlock(sub, def, fields, values, files, prefix) {
      var dl = h('div', { class: 'of-dl' });
      flat(fields).forEach(function (f) {
        if (!f.id || f.type === 'group' || f.type === 'info') return;
        if (f.type === 'photo' || f.type === 'file' || f.type === 'signature') {
          var n = (files || {})[f.id];
          if (!n) return;
          var thumbs = [];
          for (var i = 0; i < n; i++) {
            var src = api.fileUrl(sub.formId, sub.id, (prefix || '') + f.id, i);
            thumbs.push(h('a', { href: src, target: '_blank', rel: 'noopener', class: 'of-thumb' + (f.type === 'signature' ? ' sig' : '') }, h('img', { src: src, alt: f.label || '' })));
          }
          dl.append(h('div', { class: 'of-dl-r' }, h('div', { class: 'of-dl-k' }, f.label || ''), h('div', { class: 'of-photos' }, thumbs)));
          return;
        }
        var v = values[f.id];
        if (v == null || v === '' || (Array.isArray(v) && !v.length && !f.sections)) return;
        if (f.type === 'multi' && f.sections && !Array.isArray(v)) v = [];
        dl.append(h('div', { class: 'of-dl-r' }, h('div', { class: 'of-dl-k' }, f.label || ''), h('div', { class: 'of-dl-v' }, renderValue(sub, f, v))));
      });
      return dl;
    }

    function detail(formId, id) {
      root.innerHTML = '';
      root.append(h('div', { class: 'of-top' }, h('button', { type: 'button', class: 'of-back', onclick: list }, icon('back', 18), 'All submissions')),
        h('div', { class: 'of-empty' }, 'Loading…'));
      Promise.resolve(api.getSubmission(formId, id)).then(function (sub) {
        var def = byId[sub.formId] || { title: sub.formId, icon: 'file', fields: [] };
        root.lastChild.remove();
        root.append(h('div', { class: 'of-head' },
          h('div', { class: 'of-head-ic' }, icon(def.icon, 24)),
          h('div', null, h('h2', { class: 'of-h1' }, def.title),
            h('p', { class: 'of-sub' }, [sub.anonymous ? 'Anonymous' : (sub.submittedBy || 'Unknown'), storeName(sub.store), fmtDate(new Date(sub.createdAt).toISOString().slice(0, 16))].filter(Boolean).join(' · ')))));
        if (def.sensitive) root.append(h('div', { class: 'of-info warn' }, h('div', { class: 'of-info-t' }, 'Sensitive'), h('p', null, 'Keep the details of this submission between the people who need to act on it.')));
        if (def.stages) {
          def.stages.forEach(function (s, i) {
            var st = i === 0 ? { values: sub.values, files: sub.files } : ((sub.stages || {})[s.id] || null);
            root.append(h('div', { class: 'of-cat' }, s.label + (st && st.submittedBy ? ' · ' + st.submittedBy : '') + (st && st.at ? ' · ' + new Date(st.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')));
            root.append(st ? fieldsBlock(sub, def, s.fields, st.values || {}, st.files, i === 0 ? '' : s.id + '__') : h('div', { class: 'of-empty sm' }, 'Not done yet'));
          });
        } else {
          root.append(fieldsBlock(sub, def, def.fields, sub.values || {}, sub.files));
        }
        // status + note
        var cur = sub.status === 'open' ? 'open' : (sub.status || 'new');
        var seg = h('div', { class: 'of-seg', role: 'radiogroup', 'aria-label': 'Status' });
        STATUSES.forEach(function (o) {
          var b = h('button', { type: 'button', class: 'of-seg-b', role: 'radio', 'aria-checked': String(cur === o.v), onclick: function () {
            cur = o.v; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute('aria-checked', 'false'); }); b.setAttribute('aria-checked', 'true');
          } }, o.l);
          seg.append(b);
        });
        var note = h('textarea', { id: 'of-inbox-note', class: 'of-input of-ta', rows: 2, placeholder: 'What was done, who is handling it…', 'aria-label': 'Note' });
        var by = h('input', { id: 'of-inbox-by', class: 'of-input', placeholder: 'Your name', 'aria-label': 'Your name' });
        by.value = lsGet('remember:leader', '');
        var history = (sub.history || []).slice().reverse().map(function (x) {
          return h('div', { class: 'of-hist' }, h('strong', null, statusLabel(x.status)), ' · ' + (x.by || '') + ' · ' + ago(x.at), x.note ? h('div', null, x.note) : null);
        });
        var save = h('button', { type: 'button', class: 'of-submit' }, 'Save');
        save.addEventListener('click', function () {
          if (sub.status === 'open' && cur === 'new') { toast('Pick a status first'); return; }
          save.disabled = true; save.textContent = 'Saving…';
          if (by.value) lsSet('remember:leader', by.value);
          Promise.resolve(api.setStatus(sub.formId, sub.id, cur, note.value, by.value)).then(function () { toast('Saved'); list(); },
            function () { toast("Couldn't save. Try again."); save.disabled = false; save.textContent = 'Save'; });
        });
        root.append(h('div', { class: 'of-cat' }, 'Follow-up'),
          h('div', { class: 'of-field' }, seg, h('div', { style: 'height:10px' }), note, h('div', { style: 'height:8px' }), by,
            history.length ? h('div', { class: 'of-hist-box' }, history) : null),
          h('div', { class: 'of-bar' }, save));
      }, function () { root.lastChild.textContent = "Couldn't load that submission."; });
    }

    list();
    return { refresh: list };
  }

  /* ---------- styles (override any --of-* variable from your own CSS) ---------- */
  function injectCss() {
    if (document.getElementById('of-css')) return;
    var css = [
      '.of-root{--of-bg:#0f1115;--of-card:#171a21;--of-card2:#1e222b;--of-line:#2a2f3a;--of-text:#eef0f4;--of-muted:#9aa3b2;--of-accent:#e51636;--of-accent-ink:#fff;--of-ok:#2fbf71;--of-warn:#f2a33a;--of-danger:#ff5a5f;--of-radius:14px;--of-scheme:dark;color:var(--of-text);max-width:680px;margin:0 auto;padding:4px 0 24px;-webkit-tap-highlight-color:transparent;position:relative}',
      '.of-root *{box-sizing:border-box}.of-root [hidden]{display:none!important}',
      '.of-root button:focus-visible,.of-root input:focus-visible,.of-root textarea:focus-visible,.of-root select:focus-visible{outline:2px solid var(--of-accent);outline-offset:2px}',
      '.of-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 14px}',
      '.of-h1{font-size:1.35rem;font-weight:700;margin:0;letter-spacing:-.01em;line-height:1.25;text-wrap:balance}',
      '.of-sub{margin:4px 0 0;color:var(--of-muted);font-size:.92rem;line-height:1.45}',
      '.of-lang,.of-back,.of-link{background:none;border:0;color:var(--of-muted);font:inherit;font-size:.9rem;padding:8px 2px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
      '.of-lang{border:1px solid var(--of-line);border-radius:999px;padding:6px 12px}.of-link:hover,.of-back:hover,.of-lang:hover{color:var(--of-text)}',
      '.of-search{display:flex;align-items:center;gap:8px;background:var(--of-card);border:1px solid var(--of-line);border-radius:12px;padding:0 12px;color:var(--of-muted)}',
      '.of-search-input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--of-text);font:inherit;padding:12px 0;font-size:16px}',
      '.of-cat{font-size:.74rem;text-transform:uppercase;letter-spacing:.08em;color:var(--of-muted);margin:20px 2px 8px;font-weight:700}',
      '.of-card{width:100%;display:flex;align-items:center;gap:14px;text-align:left;background:var(--of-card);border:1px solid var(--of-line);border-radius:var(--of-radius);padding:13px 14px;margin-bottom:8px;color:inherit;font:inherit;cursor:pointer;transition:border-color .15s,transform .1s}',
      '.of-card:hover{border-color:color-mix(in srgb,var(--of-accent) 45%,var(--of-line))}.of-card:active{transform:scale(.99)}',
      '.of-card-ic,.of-head-ic{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--of-accent) 15%,transparent);color:var(--of-accent)}',
      '.of-card-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.of-card-t{font-weight:600;display:flex;align-items:center;gap:6px}.of-card-b{color:var(--of-muted);font-size:.85rem;overflow-wrap:anywhere}',
      '.of-meta{color:var(--of-muted);font-size:.78rem}.of-lock{color:var(--of-warn);display:inline-flex}',
      '.of-chev{color:var(--of-muted);display:flex}.of-pill{font-size:.72rem;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--of-warn) 16%,transparent);color:var(--of-warn);font-weight:700;display:inline-flex;align-items:center;gap:4px;flex:none}',
      '.of-pill.lead{background:color-mix(in srgb,var(--of-muted) 16%,transparent);color:var(--of-muted)}',
      '.of-empty{color:var(--of-muted);text-align:center;padding:32px 0}.of-empty.sm{padding:10px 0;text-align:left}',
      '.of-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}',
      '.of-form{display:flex;flex-direction:column;gap:12px}',
      '.of-field{background:var(--of-card);border:1px solid var(--of-line);border-radius:var(--of-radius);padding:14px}.of-field.bad{border-color:var(--of-danger)}',
      '.of-group{display:flex;flex-direction:column;gap:12px;padding-left:12px;border-left:2px solid color-mix(in srgb,var(--of-accent) 60%,var(--of-line))}.of-group.plain{padding-left:0;border-left:0}',
      '.of-group-t{font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;color:var(--of-muted);margin-top:4px}',
      '.of-label{font-weight:600;font-size:.95rem;margin-bottom:10px;line-height:1.35}.of-req{color:var(--of-accent)}.of-opt{color:var(--of-muted);font-weight:400;font-size:.8rem}',
      '.of-help{color:var(--of-muted);font-size:.84rem;margin:-4px 0 10px;line-height:1.4}',
      '.of-err{color:var(--of-danger);font-size:.84rem;margin-top:8px}.of-err:empty{display:none}',
      '.of-input{width:100%;background:var(--of-card2);border:1px solid var(--of-line);border-radius:10px;color:var(--of-text);font:inherit;font-size:16px;padding:12px;outline:0;transition:border-color .15s;min-width:0}',
      '.of-input:focus{border-color:var(--of-accent)}.of-input::placeholder{color:color-mix(in srgb,var(--of-muted) 75%,transparent)}',
      '.of-root input[type=date],.of-root input[type=time],.of-root input[type=datetime-local],.of-select{color-scheme:var(--of-scheme);min-height:48px}',
      '.of-ta{resize:none;min-height:88px;line-height:1.45;display:block}',
      '.of-affix{display:flex;align-items:center;background:var(--of-card2);border:1px solid var(--of-line);border-radius:10px}.of-affix:focus-within{border-color:var(--of-accent)}',
      '.of-affix .of-input{border:0;background:none}.of-pre{padding-left:12px;color:var(--of-muted)}.of-affix .of-pre+.of-input{padding-left:4px}.of-suf{padding:0 12px;color:var(--of-muted);white-space:nowrap}',
      '.of-seg{display:flex;gap:8px;flex-wrap:wrap}.of-seg-b{flex:1;min-height:46px;border-radius:10px;border:1px solid var(--of-line);background:var(--of-card2);color:var(--of-text);font:inherit;font-weight:600;cursor:pointer;padding:6px 10px}',
      '.of-seg-b[aria-checked=true]{background:var(--of-accent);border-color:var(--of-accent);color:var(--of-accent-ink)}',
      '.of-seg-sm .of-seg-b{min-height:36px;font-size:.85rem;flex:0 1 auto}',
      '.of-opts{display:flex;flex-direction:column;gap:8px}',
      '.of-opt-b{display:flex;gap:12px;align-items:flex-start;text-align:left;padding:12px;border-radius:10px;border:1px solid var(--of-line);background:var(--of-card2);color:var(--of-text);font:inherit;cursor:pointer}',
      '.of-opt-b[aria-checked=true]{border-color:var(--of-accent);background:color-mix(in srgb,var(--of-accent) 10%,var(--of-card2))}',
      '.of-dot{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--of-line);margin-top:1px;display:grid;place-items:center}',
      '.of-opt-b[aria-checked=true] .of-dot{border-color:var(--of-accent)}.of-opt-b[aria-checked=true] .of-dot::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--of-accent)}',
      '.of-opt-l{font-weight:600;display:flex;align-items:center;gap:8px}.of-opt-d{display:block;color:var(--of-muted);font-size:.84rem;margin-top:2px}',
      '.of-tone{width:9px;height:9px;border-radius:50%;flex:none}.of-tone.ok{background:var(--of-ok)}.of-tone.warn{background:var(--of-warn)}.of-tone.danger{background:var(--of-danger)}',
      '.of-chips{display:flex;flex-wrap:wrap;gap:8px}',
      '.of-chip{border:1px solid var(--of-line);background:var(--of-card2);color:var(--of-text);border-radius:999px;padding:9px 14px;font:inherit;font-size:.9rem;cursor:pointer}',
      '.of-chip[aria-pressed=true]{background:var(--of-accent);border-color:var(--of-accent);color:var(--of-accent-ink)}.of-qp{margin-bottom:10px}.of-chip-s{padding:6px 11px;font-size:.83rem}',
      '.of-step{display:flex;align-items:center;gap:8px}.of-step-b{width:46px;height:46px;border-radius:10px;border:1px solid var(--of-line);background:var(--of-card2);color:var(--of-text);font-size:1.3rem;cursor:pointer;flex:none}',
      '.of-step-v{text-align:center;max-width:96px}.of-step.sm .of-step-b{width:38px;height:38px}.of-q{min-width:26px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}',
      '.of-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}',
      '.of-photo-add{aspect-ratio:1;border:1.5px dashed var(--of-line);border-radius:10px;background:none;color:var(--of-muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:inherit;font-size:.82rem;cursor:pointer}',
      '.of-thumb{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--of-card2);display:block}.of-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
      '.of-thumb.sig{aspect-ratio:3/1;grid-column:span 2;background:#fff}.of-thumb.sig img{object-fit:contain}',
      '.of-thumb.pdf>span{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:100%;color:var(--of-muted);font-size:.8rem;font-weight:700}',
      '.of-thumb-x{position:absolute;top:5px;right:5px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;display:grid;place-items:center;cursor:pointer}',
      '.of-hidden{display:none}',
      '.of-sig{position:relative;height:150px;background:#fff;border-radius:10px;overflow:hidden}.of-sig-c{width:100%;height:100%;touch-action:none;display:block;cursor:crosshair}',
      '.of-sig-hint{position:absolute;left:14px;right:14px;bottom:26px;border-top:1px solid #c9ced8;color:#8a93a3;font-size:.78rem;padding-top:4px;pointer-events:none}.of-sig.has .of-sig-hint{opacity:.3}',
      '.of-sig-row{display:flex;justify-content:flex-end}',
      '.of-ack{display:flex;gap:12px;align-items:flex-start;text-align:left;width:100%;background:none;border:0;color:var(--of-text);font:inherit;cursor:pointer;padding:0;line-height:1.45}',
      '.of-box{flex:none;width:22px;height:22px;border-radius:6px;border:2px solid var(--of-line);display:grid;place-items:center;color:transparent}',
      '[aria-checked=true]>.of-box{background:var(--of-accent);border-color:var(--of-accent);color:#fff}',
      '.of-checks{display:flex;flex-direction:column}.of-check{padding:11px 0;border-top:1px solid var(--of-line)}',
      '.of-check-h{font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;color:var(--of-muted);font-weight:700;padding:14px 0 6px}.of-check-h:first-child{padding-top:0}',
      '.of-items{display:flex;flex-direction:column;gap:6px}',
      '.of-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:var(--of-card2);border:1px solid transparent}.of-item.on{border-color:var(--of-accent)}',
      '.of-item-l{display:flex;flex-direction:column}.of-item-p{color:var(--of-muted);font-size:.8rem}',
      '.of-item-c{flex-direction:column;align-items:stretch}.of-item-tog{display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--of-text);font:inherit;padding:4px 0;cursor:pointer;text-align:left}',
      '.of-item-x{display:none;gap:8px;margin-top:8px}.of-item-c.on .of-item-x{display:flex}.of-item-x>*{flex:1;min-width:0}',
      '.of-total{display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--of-line);font-size:1.05rem;font-variant-numeric:tabular-nums}',
      '.of-rep{display:flex;flex-direction:column;gap:8px}.of-rep-row{display:flex;gap:8px;align-items:center}.of-rep-cells{flex:1;display:flex;gap:8px;flex-wrap:wrap;min-width:0}',
      '.of-rep-cell{flex:1;min-width:110px}.of-rep-x{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--of-line);background:none;color:var(--of-muted);display:grid;place-items:center;cursor:pointer}',
      '.of-rep-add{align-self:flex-start;color:var(--of-accent);font-weight:600}',
      '.of-calc{display:flex;flex-direction:column;gap:4px;font-size:1.25rem;font-variant-numeric:tabular-nums}.of-calc span{font-size:.86rem;color:var(--of-muted)}',
      '.of-calc.warn strong,.of-calc.warn span{color:var(--of-warn)}.of-calc.good strong,.of-calc.good span{color:var(--of-ok)}',
      '.of-field-calc{background:var(--of-card2)}',
      '.of-info{background:var(--of-card);border:1px solid var(--of-line);border-radius:var(--of-radius);padding:14px;font-size:.92rem;line-height:1.5}',
      '.of-info.danger{border-color:var(--of-danger);background:color-mix(in srgb,var(--of-danger) 9%,var(--of-card))}.of-info.warn{border-color:var(--of-warn);background:color-mix(in srgb,var(--of-warn) 8%,var(--of-card))}',
      '.of-info p{margin:0 0 8px}.of-info ul{margin:0 0 8px;padding-left:20px}.of-info li{margin-bottom:4px}.of-info>:last-child,.of-info-b>:last-child{margin-bottom:0}',
      '.of-info-t{font-weight:700;margin-bottom:6px}.of-info summary{cursor:pointer;font-weight:600}.of-info-b{margin-top:10px}',
      '.of-bar{position:sticky;bottom:0;display:flex;gap:10px;padding:14px 0 calc(12px + env(safe-area-inset-bottom,0px));background:linear-gradient(transparent,var(--of-bg) 28%);margin-top:4px;z-index:2}',
      '.of-submit{flex:1;min-height:52px;border:0;border-radius:12px;background:var(--of-accent);color:var(--of-accent-ink);font:inherit;font-weight:700;font-size:1rem;cursor:pointer}.of-submit:disabled{opacity:.6}',
      '.of-ghost{min-height:52px;padding:0 18px;border-radius:12px;border:1px solid var(--of-line);background:var(--of-card);color:var(--of-text);font:inherit;cursor:pointer}',
      '.of-open{background:var(--of-card);border:1px solid var(--of-line);border-radius:var(--of-radius);padding:14px;margin-bottom:4px}',
      '.of-open-h{display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:8px}.of-live{width:8px;height:8px;border-radius:50%;background:var(--of-ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--of-ok) 20%,transparent)}',
      '.of-visit{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--of-line)}.of-visit:first-child{border-top:0}',
      '.of-visit-tx{flex:1;min-width:0}.of-visit-t{font-weight:600}.of-visit-s{color:var(--of-muted);font-size:.84rem}',
      '.of-sm-btn{border:0;border-radius:10px;background:var(--of-accent);color:var(--of-accent-ink);font:inherit;font-weight:600;padding:9px 14px;cursor:pointer;flex:none}',
      '.of-banner{background:var(--of-card);border:1px solid var(--of-line);border-left:3px solid var(--of-ok);border-radius:var(--of-radius);padding:12px 14px;margin-bottom:6px}',
      '.of-done{text-align:center;padding:48px 8px}.of-done-ic{width:72px;height:72px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--of-ok) 16%,transparent);color:var(--of-ok)}',
      '.of-done-b{display:flex;flex-direction:column;gap:10px;max-width:320px;margin:24px auto 0}',
      '.of-filters{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}.of-select{appearance:auto}',
      '.of-row{align-items:flex-start}.of-status{flex:none;font-size:.74rem;font-weight:700;padding:4px 9px;border-radius:999px;align-self:center}',
      '.of-status.s-new{background:color-mix(in srgb,var(--of-accent) 16%,transparent);color:var(--of-accent)}',
      '.of-status.s-in_progress{background:color-mix(in srgb,var(--of-warn) 16%,transparent);color:var(--of-warn)}',
      '.of-status.s-done{background:color-mix(in srgb,var(--of-ok) 16%,transparent);color:var(--of-ok)}',
      '.of-status.s-open{background:color-mix(in srgb,var(--of-ok) 16%,transparent);color:var(--of-ok)}',
      '.of-dl{background:var(--of-card);border:1px solid var(--of-line);border-radius:var(--of-radius);padding:4px 14px}',
      '.of-dl-r{padding:11px 0;border-top:1px solid var(--of-line);display:flex;flex-direction:column;gap:4px}.of-dl-r:first-child{border-top:0}',
      '.of-dl-k{color:var(--of-muted);font-size:.8rem}.of-dl-v{white-space:pre-wrap;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}',
      '.of-dl-list{margin:0;padding-left:0;list-style:none}.of-dl-list li{padding:2px 0}.of-dl-list li.miss{color:var(--of-muted)}.of-dl-list li.ok{color:var(--of-ok)}',
      '.of-hist-box{margin-top:12px;border-top:1px solid var(--of-line);padding-top:8px}.of-hist{font-size:.84rem;color:var(--of-muted);padding:4px 0}.of-hist strong{color:var(--of-text)}',
      '.of-toast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(16px);background:#2a2f3a;color:#fff;padding:10px 16px;border-radius:10px;font-size:.9rem;opacity:0;transition:.2s;pointer-events:none;z-index:9999;max-width:calc(100% - 32px);text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35)}',
      '.of-toast.show{opacity:1;transform:translateX(-50%)}',
      '@media (prefers-reduced-motion:reduce){.of-root *,.of-toast{transition:none!important}}'
    ].join('\n');
    var s = document.createElement('style'); s.id = 'of-css'; s.textContent = css; document.head.appendChild(s);
  }

  global.OpsForms = { mount: mount, mountInbox: mountInbox, version: '1.0.0' };
})(window);

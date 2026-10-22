/*!
 * CFA Buda Ops Hub - Form definitions
 * Every form in the Forms tab is described here. To change a form, edit its entry; no layout code needed.
 *
 * Field types: text, person, email, phone, textarea, number, currency, date, time, datetime,
 *   store, choice (style: 'chips' | 'list'), multi (style: 'checks'), yesno, photo, file (photo or PDF),
 *   signature, ack (checkbox statement), items (priced picker), repeat (rows), quickpick (chips + text),
 *   calc (live computed value), info (text block), group (wraps fields; can be shown/hidden as a unit).
 * Common keys: id, label, label_es, help, help_es, placeholder, required, showIf, check(v, values),
 *   remember (prefill next time), role: 'submitter' | 'anonymous'.
 * Form keys: audience: 'leaders' (only shows when signed in to Manage), sensitive (flagged in inbox),
 *   noDraft / noRemember (nothing kept on the device), inboxSummary (field ids shown in the inbox list).
 * Bump `version` when you change a form so old and new submissions can be told apart.
 */
(function (global) {
  'use strict';

  var STORE = { id: 'store', type: 'store', label: 'Which store?', label_es: '¿Qué restaurante?', required: true };

  var AREAS = [
    { v: 'kitchen', l: 'Kitchen', l_es: 'Cocina' },
    { v: 'front', l: 'Front counter', l_es: 'Mostrador' },
    { v: 'drive_thru', l: 'Drive-thru', l_es: 'Autoservicio' },
    { v: 'dining', l: 'Dining room', l_es: 'Comedor' },
    { v: 'restroom', l: 'Restrooms', l_es: 'Baños' },
    { v: 'outside', l: 'Outside / parking', l_es: 'Afuera / estacionamiento' },
    { v: 'office', l: 'Office', l_es: 'Oficina' },
    { v: 'other', l: 'Other', l_es: 'Otro' }
  ];

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    var x = new Date(a + 'T12:00'), y = new Date(b + 'T12:00');
    if (isNaN(x) || isNaN(y)) return null;
    return Math.round((y - x) / 86400000);
  }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var REQUIRED = { en: 'Required', es: 'Obligatorio' };

  var CATEGORIES = [
    { id: 'ops', l: 'Around the restaurant', l_es: 'En el restaurante' },
    { id: 'people', l: 'Team & HR', l_es: 'Equipo y Recursos Humanos' },
    { id: 'money', l: 'Money & receipts', l_es: 'Dinero y recibos' },
    { id: 'safety', l: 'Report an incident', l_es: 'Reportar un incidente' }
  ];

  var FORMS = [

    /* ------------------------------------------------------------------ */
    /* Replaces 1b. Repair/Supplies Needed + 1e. Maintenance Request       */
    /* ------------------------------------------------------------------ */
    {
      id: 'repair_request', version: 1, category: 'ops', icon: 'wrench',
      title: 'Repair or Supply Request', title_es: 'Reparación o suministros',
      blurb: "Something's broken, or we're running low", blurb_es: 'Algo está roto o se está acabando',
      keywords: ['maintenance', 'broken', 'fix', 'supplies', 'equipment', '1b', '1e', 'reparar', 'roto', 'mantenimiento'],
      inboxSummary: ['kind', 'what', 'urgency', 'items'],
      fields: [
        STORE,
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name', label_es: 'Tu nombre', required: true },
        { id: 'kind', type: 'choice', label: 'What do you need?', label_es: '¿Qué necesitas?', required: true, options: [
          { v: 'repair', l: 'Something is broken', l_es: 'Algo está roto' },
          { v: 'supplies', l: 'We need supplies', l_es: 'Necesitamos suministros' }] },
        { id: 'g_repair', type: 'group', plain: true, showIf: { field: 'kind', eq: 'repair' }, fields: [
          { id: 'what', type: 'text', label: 'What is broken?', label_es: '¿Qué está roto?', required: true,
            placeholder: 'e.g. Fryer 3, drive-thru headset', placeholder_es: 'ej. Freidora 3, audífono del autoservicio' },
          { id: 'area', type: 'choice', style: 'chips', label: 'Where is it?', label_es: '¿Dónde está?', required: true, options: AREAS },
          { id: 'urgency', type: 'choice', style: 'list', label: 'How urgent is it?', label_es: '¿Qué tan urgente es?', required: true, options: [
            { v: 'safety', tone: 'danger', l: 'Safety hazard', l_es: 'Peligro de seguridad',
              desc: 'Someone could get hurt. Tell the leader on shift now, too.', desc_es: 'Alguien podría lastimarse. Avísale también al líder en turno ahora.' },
            { v: 'slowing', tone: 'warn', l: 'Slowing us down', l_es: 'Nos está atrasando',
              desc: 'We can work around it, but it hurts service.', desc_es: 'Podemos seguir, pero afecta el servicio.' },
            { v: 'can_wait', tone: 'ok', l: 'Can wait', l_es: 'Puede esperar',
              desc: 'Fix it when someone gets a chance.', desc_es: 'Se puede arreglar cuando haya tiempo.' }] },
          { id: 'details', type: 'textarea', label: "What's happening?", label_es: '¿Qué está pasando?', required: true,
            help: 'Include the model, serial number and asset tag if you can see them.',
            help_es: 'Incluye el modelo, número de serie y etiqueta de activo si los puedes ver.' },
          { id: 'photos', type: 'photo', label: 'Photo of the problem', label_es: 'Foto del problema', required: true,
            help: 'A clear shot of the serial / asset tag helps a lot.', help_es: 'Una foto clara de la etiqueta de serie ayuda mucho.' }
        ] },
        { id: 'g_supplies', type: 'group', plain: true, showIf: { field: 'kind', eq: 'supplies' }, fields: [
          { id: 'items', type: 'repeat', label: 'What do we need?', label_es: '¿Qué necesitamos?', required: true,
            columns: [{ id: 'item', label: 'Item', label_es: 'Artículo', grow: 2 }, { id: 'qty', label: 'How many', label_es: 'Cuántos', grow: 1 }],
            addLabel: 'Add another item', addLabel_es: 'Agregar otro artículo' },
          { id: 'supply_note', type: 'textarea', label: 'Anything else we should know?', label_es: '¿Algo más que debamos saber?' },
          { id: 'supply_photo', type: 'photo', max: 2, label: 'Photo', label_es: 'Foto',
            help: 'A picture of the label or box helps us order the right thing.', help_es: 'Una foto de la etiqueta o caja nos ayuda a pedir lo correcto.' }
        ] }
      ]
    },

    /* ------------------------------------------------------------------ */
    /* Vendor Check-In & Check-Out Log: now two steps, times are automatic */
    /* ------------------------------------------------------------------ */
    {
      id: 'vendor_log', version: 1, category: 'ops', icon: 'truck',
      title: 'Vendor Check-In / Out', title_es: 'Registro de proveedores',
      blurb: 'Log a technician or vendor when they arrive and leave', blurb_es: 'Registra a un técnico o proveedor al llegar y al salir',
      keywords: ['vendor', 'technician', 'repair', 'service', 'proveedor', 'técnico'],
      openSummary: ['vendor', 'service', 'area'],
      inboxSummary: ['vendor', 'service', 'area'],
      stages: [
        { id: 'checkin', label: 'Check in', label_es: 'Registrar entrada', fields: [
          STORE,
          { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Who is logging this?', label_es: '¿Quién lo registra?', required: true },
          { id: 'vendor', type: 'text', label: 'Vendor / company', label_es: 'Proveedor / compañía', required: true, placeholder: 'e.g. Hobart, Ecolab', placeholder_es: 'ej. Hobart, Ecolab' },
          { id: 'tech', type: 'person', label: 'Technician name', label_es: 'Nombre del técnico' },
          { id: 'service', type: 'choice', style: 'chips', label: 'Type of service', label_es: 'Tipo de servicio', required: true, options: [
            { v: 'repair', l: 'Repair', l_es: 'Reparación' }, { v: 'install', l: 'Installation', l_es: 'Instalación' },
            { v: 'maintenance', l: 'Maintenance', l_es: 'Mantenimiento' }, { v: 'inspection', l: 'Inspection', l_es: 'Inspección' },
            { v: 'cleaning', l: 'Cleaning', l_es: 'Limpieza' }, { v: 'delivery', l: 'Delivery', l_es: 'Entrega' },
            { v: 'emergency', l: 'Emergency', l_es: 'Emergencia' }, { v: 'other', l: 'Other', l_es: 'Otro' }] },
          { id: 'area', type: 'text', label: 'What are they working on?', label_es: '¿En qué están trabajando?', required: true,
            placeholder: 'e.g. Walk-in cooler, ice machine', placeholder_es: 'ej. Cámara fría, máquina de hielo' }
        ] },
        { id: 'checkout', label: 'Check out', label_es: 'Registrar salida', fields: [
          { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Who is checking them out?', label_es: '¿Quién registra la salida?', required: true },
          { id: 'result', type: 'choice', style: 'list', label: 'Was the issue fixed?', label_es: '¿Se resolvió el problema?', required: true, options: [
            { v: 'resolved', tone: 'ok', l: 'Yes, all fixed', l_es: 'Sí, todo resuelto' },
            { v: 'followup', tone: 'warn', l: 'Needs a follow-up visit', l_es: 'Necesita otra visita' },
            { v: 'parts', tone: 'warn', l: 'Waiting on parts', l_es: 'Esperando piezas' },
            { v: 'more_service', tone: 'warn', l: 'Needs more service', l_es: 'Necesita más servicio' },
            { v: 'undiagnosed', tone: 'danger', l: "Couldn't find the problem", l_es: 'No encontraron el problema' }] },
          { id: 'next', type: 'textarea', label: 'What happens next?', label_es: '¿Qué sigue?', required: true,
            help: 'Return date, part on order, quote number…', help_es: 'Fecha de regreso, pieza pedida, número de cotización…',
            showIf: function (v) { return v.result && v.result !== 'resolved'; } },
          { id: 'invoice', type: 'yesno', label: 'Did they leave an invoice or service receipt?', label_es: '¿Dejaron una factura o recibo de servicio?', required: true },
          { id: 'invoice_photo', type: 'photo', max: 3, label: 'Photo of the invoice', label_es: 'Foto de la factura', required: true, showIf: { field: 'invoice', eq: true } },
          { id: 'notes', type: 'textarea', label: 'Anything else?', label_es: '¿Algo más?' }
        ] }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'transfer_log', version: 1, category: 'ops', icon: 'swap',
      title: 'Transfer Log', title_es: 'Registro de transferencias',
      blurb: 'Product or supplies moving between stores', blurb_es: 'Producto o suministros entre restaurantes',
      keywords: ['transfer', 'borrow', 'lend', '1i', 'transferencia', 'prestar'],
      inboxSummary: ['direction', 'items', 'other_store'],
      fields: [
        Object.assign({}, STORE, { label: 'Your store', label_es: 'Tu restaurante' }),
        { id: 'direction', type: 'choice', label: 'Are we giving or receiving?', label_es: '¿Estamos dando o recibiendo?', required: true, options: [
          { v: 'giving', l: 'Giving', l_es: 'Dando' }, { v: 'receiving', l: 'Receiving', l_es: 'Recibiendo' }] },
        { id: 'other_store', type: 'choice', label: 'The other store', label_es: 'El otro restaurante', required: true,
          options: [{ v: 'buda', l: 'Buda' }, { v: 'west_buda', l: 'West Buda' }, { v: 'other', l: 'Another Chick-fil-A', l_es: 'Otro Chick-fil-A' }],
          check: function (v, vals) { return v && v === vals.store ? { en: "That's your own store", es: 'Ese es tu propio restaurante' } : null; } },
        { id: 'other_name', type: 'text', label: 'Which Chick-fil-A?', label_es: '¿Cuál Chick-fil-A?', required: true, showIf: { field: 'other_store', eq: 'other' },
          placeholder: 'e.g. Kyle', placeholder_es: 'ej. Kyle' },
        { id: 'items', type: 'repeat', label: 'What items, and how much?', label_es: '¿Qué artículos y cuánto?', required: true,
          help: 'Example: 1 case filets, 2 sleeves of cups', help_es: 'Ejemplo: 1 caja de filetes, 2 paquetes de vasos',
          columns: [{ id: 'item', label: 'Item', label_es: 'Artículo', grow: 2 }, { id: 'qty', label: 'Amount', label_es: 'Cantidad', grow: 1 }],
          addLabel: 'Add another item', addLabel_es: 'Agregar otro artículo' },
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name', label_es: 'Tu nombre', required: true },
        { id: 'other_tm', type: 'person', label: 'Name of the team member picking it up', label_es: 'Nombre de quien lo recoge', required: true,
          help: 'Have them type their own name.', help_es: 'Pídele que escriba su propio nombre.', showIf: { field: 'direction', eq: 'giving' } },
        { id: 'sender_tm', type: 'person', label: 'Who sent it?', label_es: '¿Quién lo envió?', showIf: { field: 'direction', eq: 'receiving' } }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'mileage_log', version: 1, category: 'ops', icon: 'car',
      title: 'Mileage Log', title_es: 'Registro de millas',
      blurb: 'Catering runs, bank deposits, supply pickups', blurb_es: 'Entregas de catering, depósitos, compras',
      keywords: ['miles', 'driving', 'delivery', 'catering', '1j', 'millas', 'manejar'],
      inboxSummary: ['purpose', 'destination', 'miles'],
      fields: [
        STORE,
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Driver', label_es: 'Conductor', required: true },
        { id: 'date', type: 'date', default: 'today', label: 'Date', label_es: 'Fecha', required: true },
        { id: 'purpose', type: 'quickpick', label: 'Trip purpose', label_es: 'Motivo del viaje', required: true,
          chips: ['Catering delivery', 'Bank deposit', 'Supply run', 'Community event'],
          chips_es: ['Entrega de catering', 'Depósito bancario', 'Compra de suministros', 'Evento comunitario'] },
        { id: 'destination', type: 'text', label: 'Destination', label_es: 'Destino', required: true, placeholder: 'Business name or address', placeholder_es: 'Nombre del negocio o dirección' },
        { id: 'g_odo', type: 'group', plain: true, fields: [
          { id: 'odo_start', type: 'number', label: 'Odometer at start', label_es: 'Odómetro al salir', required: true, suffix: 'mi' },
          { id: 'odo_end', type: 'number', label: 'Odometer at end', label_es: 'Odómetro al regresar', required: true, suffix: 'mi',
            check: function (v, vals) { return v !== '' && vals.odo_start !== '' && num(v) <= num(vals.odo_start) ? { en: 'Should be higher than the starting reading', es: 'Debe ser mayor que la lectura inicial' } : null; } },
          { id: 'miles', type: 'calc', label: 'Total miles', label_es: 'Millas totales', format: 'miles',
            calc: function (v) { return v.odo_start !== '' && v.odo_end !== '' && v.odo_start != null && v.odo_end != null ? num(v.odo_end) - num(v.odo_start) : null; },
            warnIf: function (m) { return m <= 0 || m > 300; }, warnText: 'Double-check the odometer readings', warnText_es: 'Revisa las lecturas del odómetro' }
        ] },
        { id: 'notes', type: 'textarea', label: 'Notes', label_es: 'Notas' }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'expense', version: 1, category: 'money', icon: 'receipt',
      title: 'Expense Report', title_es: 'Reporte de gastos',
      blurb: 'Bought something for the store? Get it on the books', blurb_es: '¿Compraste algo para el restaurante? Repórtalo aquí',
      keywords: ['expense', 'receipt', 'reimburse', 'purchase', 'gasto', 'recibo', 'reembolso'],
      inboxSummary: ['amount', 'category', 'details'],
      fields: [
        STORE,
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name', label_es: 'Tu nombre', required: true },
        { id: 'date', type: 'date', default: 'today', label: 'Date of purchase', label_es: 'Fecha de compra', required: true },
        { id: 'category', type: 'choice', style: 'chips', label: 'Category', label_es: 'Categoría', required: true, options: [
          { v: 'food', l: 'Food & product', l_es: 'Comida y producto' }, { v: 'supplies', l: 'Supplies', l_es: 'Suministros' },
          { v: 'repairs', l: 'Repairs', l_es: 'Reparaciones' }, { v: 'marketing', l: 'Marketing & events', l_es: 'Mercadeo y eventos' },
          { v: 'team', l: 'Team appreciation', l_es: 'Reconocimiento al equipo' }, { v: 'fuel', l: 'Fuel', l_es: 'Gasolina' },
          { v: 'other', l: 'Other', l_es: 'Otro' }] },
        { id: 'details', type: 'textarea', label: 'What was it for?', label_es: '¿Para qué fue?', required: true,
          placeholder: 'e.g. 4 bags of ice from H-E-B, ice machine down', placeholder_es: 'ej. 4 bolsas de hielo de H-E-B, la máquina falló' },
        { id: 'amount', type: 'currency', label: 'Total amount', label_es: 'Total', required: true, min: 0.01 },
        { id: 'receipt', type: 'photo', max: 3, label: 'Receipt photo', label_es: 'Foto del recibo', required: true,
          help: 'Lay it flat so the total and date are readable.', help_es: 'Ponlo plano para que se lean el total y la fecha.' },
        { id: 'confirm', type: 'ack', required: true,
          statement: 'This expense is valid and was for business purposes.', statement_es: 'Este gasto es válido y fue para fines del negocio.' }
      ]
    },

    /* ------------------------------------------------------------------ */
    /* ezCater reconciliation: one order per submission, math done for you */
    /* ------------------------------------------------------------------ */
    {
      id: 'ezcater_recon', version: 1, category: 'money', icon: 'dollar', audience: 'leaders',
      title: 'ezCater Reconciliation',
      blurb: 'Match an ezCater order to its deposit',
      keywords: ['ezcater', 'catering', 'deposit', 'reconcile'],
      inboxSummary: ['order_no', 'guest', 'diff'],
      fields: [
        STORE,
        { id: 'g_order', type: 'group', label: 'Order', fields: [
          { id: 'order_date', type: 'date', label: 'Order date', required: true },
          { id: 'order_no', type: 'text', label: 'ezCater order #', required: true },
          { id: 'guest', type: 'text', label: 'Guest / company', required: true },
          { id: 'order_total', type: 'currency', label: 'Order total', required: true },
          { id: 'fee', type: 'currency', label: 'ezCater fee', required: true },
          { id: 'adjustments', type: 'repeat', label: 'Other fees or adjustments taken out',
            help: 'Refunds, credits, promo costs. Leave blank if none.',
            columns: [{ id: 'desc', label: 'Description', grow: 2 }, { id: 'amount', label: 'Amount', type: 'currency', grow: 1, allowNegative: true }],
            addLabel: 'Add another adjustment' },
          { id: 'expected', type: 'calc', label: 'Expected deposit', format: 'money',
            calc: function (v) {
              if (v.order_total === '' || v.order_total == null) return null;
              var adj = (v.adjustments || []).reduce(function (s, r) { return s + num(r && r.amount); }, 0);
              return Math.round((num(v.order_total) - num(v.fee) - adj) * 100) / 100;
            } }
        ] },
        { id: 'g_pay', type: 'group', label: 'Deposit', fields: [
          { id: 'date_paid', type: 'date', label: 'Date paid', required: true },
          { id: 'deposit_ref', type: 'text', label: 'Deposit reference #', required: true },
          { id: 'deposited', type: 'currency', label: 'Amount deposited', required: true },
          { id: 'diff', type: 'calc', label: 'Difference', format: 'money',
            calc: function (v) {
              if (v.deposited === '' || v.deposited == null || v.expected == null) return null;
              return Math.round((num(v.deposited) - num(v.expected)) * 100) / 100;
            },
            warnIf: function (d) { return Math.abs(d) >= 0.01; }, warnText: "Doesn't match. Explain below.",
            okIf: function (d) { return Math.abs(d) < 0.01; }, okText: 'Matches' }
        ] },
        { id: 'diff_note', type: 'textarea', label: 'Notes',
          help: 'Required when the deposit does not match.',
          check: function (v, vals) { return vals.diff != null && Math.abs(vals.diff) >= 0.01 && !(v && String(v).trim()) ? { en: 'Explain the difference' } : null; } },
        { id: 'name', type: 'person', role: 'submitter', remember: 'leader', label: 'Reconciled by', required: true }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'ask_hr', version: 1, category: 'people', icon: 'chat',
      title: 'Ask HR', title_es: 'Pregúntale a Recursos Humanos',
      blurb: 'Payroll, time off, benefits or anything else', blurb_es: 'Nómina, ausencias, beneficios o cualquier otra cosa',
      keywords: ['hr', 'question', 'payroll', 'benefits', '1g', 'pregunta', 'nómina'],
      successText: "HR will get back to you soon.", successText_es: 'Recursos Humanos te responderá pronto.',
      inboxSummary: ['topic', 'question'],
      fields: [
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name', label_es: 'Tu nombre', required: true },
        STORE,
        { id: 'topic', type: 'choice', style: 'chips', label: 'Topic', label_es: 'Tema', required: true, options: [
          { v: 'payroll', l: 'Payroll', l_es: 'Nómina' }, { v: 'absence', l: 'Time off / absence', l_es: 'Ausencias' },
          { v: 'benefits', l: 'Benefits', l_es: 'Beneficios' }, { v: 'info', l: 'Update my info', l_es: 'Actualizar mis datos' },
          { v: 'other', l: 'Something else', l_es: 'Otra cosa' }] },
        { id: 'question', type: 'textarea', label: 'What can we help with?', label_es: '¿En qué te podemos ayudar?', required: true },
        { id: 'attachment', type: 'file', label: 'Attach a document', label_es: 'Adjuntar un documento',
          help: 'Photo or PDF, if it helps explain.', help_es: 'Foto o PDF, si ayuda a explicar.' }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'referral', version: 1, category: 'people', icon: 'users',
      title: 'Refer a Friend', title_es: 'Recomienda a un amigo',
      blurb: 'Earn $100 when someone you refer is hired', blurb_es: 'Gana $100 cuando contratan a quien recomiendas',
      keywords: ['referral', 'refer', 'bonus', 'hire', '1d', 'recomendación', 'bono'],
      successText: 'Thanks for the referral! We will reach out to them.', successText_es: '¡Gracias por la recomendación! Nos comunicaremos con esa persona.',
      inboxSummary: ['ref_name', 'name'],
      fields: [
        { type: 'info', label: 'How the $100 bonus works', label_es: 'Cómo funciona el bono de $100',
          bullets: [
            'Submit this before their first interview.',
            'You get $100, in person, once they pass their 3H Week evaluation.',
            'If they leave or are not in good standing at 90 days, the $100 comes back out of your next paycheck.'],
          bullets_es: [
            'Envía esto antes de su primera entrevista.',
            'Recibes $100, en persona, cuando pase su evaluación de la Semana 3H.',
            'Si se va o no está al día a los 90 días, los $100 se descuentan de tu próximo cheque.'] },
        STORE,
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name (first and last)', label_es: 'Tu nombre (nombre y apellido)', required: true },
        { id: 'ref_name', type: 'person', label: "Who are you referring? (first and last)", label_es: '¿A quién recomiendas? (nombre y apellido)', required: true },
        { id: 'ref_email', type: 'email', label: 'Their email', label_es: 'Su correo electrónico', required: true },
        { id: 'ref_phone', type: 'phone', label: 'Their phone number', label_es: 'Su número de teléfono', required: true },
        { id: 'why', type: 'textarea', label: 'Why would they be a great addition?', label_es: '¿Por qué serían una gran incorporación?' },
        { id: 'confirm', type: 'ack', required: true,
          statement: "They haven't had their first interview yet, and I understand how the bonus works.",
          statement_es: 'Todavía no ha tenido su primera entrevista y entiendo cómo funciona el bono.' }
      ]
    },

    /* ------------------------------------------------------------------ */
    /* Payroll Notes: leader-only adjustment types hidden from team members */
    /* ------------------------------------------------------------------ */
    {
      id: 'payroll_notes', version: 1, category: 'people', icon: 'dollar',
      title: 'Payroll Note', title_es: 'Nota de nómina',
      blurb: 'Hours corrections, uniform orders and pay changes', blurb_es: 'Corrección de horas, uniformes y cambios de pago',
      keywords: ['payroll', 'hours', 'uniform', 'bonus', 'raise', '1c', 'nómina', 'horas', 'uniforme'],
      inboxSummary: ['type', 'name'],
      fields: [
        STORE,
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Team member name', label_es: 'Nombre del miembro del equipo', required: true },
        { id: 'type', type: 'choice', style: 'list', label: 'What needs to change?', label_es: '¿Qué hay que cambiar?', required: true, options: [
          { v: 'hours', l: 'Hours correction', l_es: 'Corrección de horas', desc: 'Missed punch, wrong clock-out', desc_es: 'Olvidé marcar, salida incorrecta' },
          { v: 'uniform', l: 'Uniform order', l_es: 'Pedido de uniforme', desc: 'Deducted from your paycheck', desc_es: 'Se descuenta de tu cheque' },
          { v: 'bonus', l: 'Bonus', l_es: 'Bono', leaderOnly: true },
          { v: 'pay_rate', l: 'Pay rate increase', l_es: 'Aumento de salario', leaderOnly: true },
          { v: 'cert', l: 'Certification change', l_es: 'Cambio de certificación', leaderOnly: true },
          { v: 'cash', l: 'Cash shortage', l_es: 'Faltante de efectivo', leaderOnly: true },
          { v: 'other', l: 'Something else', l_es: 'Otra cosa' }] },

        { id: 'g_hours', type: 'group', label: 'Hours correction', label_es: 'Corrección de horas', showIf: { field: 'type', eq: 'hours' }, fields: [
          { id: 'hours_dir', type: 'choice', label: 'Add or remove hours?', label_es: '¿Agregar o quitar horas?', required: true, options: [
            { v: 'add', l: 'Add hours', l_es: 'Agregar horas' }, { v: 'deduct', l: 'Remove hours', l_es: 'Quitar horas' }] },
          { id: 'shift_date', type: 'date', label: 'Date of the shift', label_es: 'Fecha del turno', required: true },
          { id: 'hours', type: 'number', stepper: true, step: 0.25, min: 0.25, max: 16, suffix: 'hrs', label: 'How many hours?', label_es: '¿Cuántas horas?', required: true },
          { id: 'hours_reason', type: 'textarea', label: 'What happened?', label_es: '¿Qué pasó?', required: true,
            placeholder: 'e.g. Forgot to clock out at 3:00 PM', placeholder_es: 'ej. Olvidé marcar la salida a las 3:00 PM' }
        ] },

        { id: 'g_uniform', type: 'group', label: 'Uniform order', label_es: 'Pedido de uniforme', showIf: { field: 'type', eq: 'uniform' }, fields: [
          { id: 'uniform', type: 'items', label: 'What are you ordering?', label_es: '¿Qué vas a pedir?', required: true, options: [
            { v: 'shirt', l: 'Shirt', l_es: 'Camisa', price: 20 }, { v: 'pants', l: 'Pants', l_es: 'Pantalones', price: 25 },
            { v: 'belt', l: 'Belt', l_es: 'Cinturón', price: 13 }, { v: 'name_tag', l: 'Name tag', l_es: 'Etiqueta de nombre', price: 5 },
            { v: 'hat', l: 'Hat', l_es: 'Gorra', price: 8 },
            { v: 'shoes', l: 'Shoes for Crews (enter total)', l_es: 'Shoes for Crews (escribe el total)', custom: true },
            { v: 'other', l: 'Something else', l_es: 'Otra cosa', custom: 'named' }] },
          { id: 'split', type: 'yesno', label: 'Split the cost across two paychecks?', label_es: '¿Dividir el costo en dos cheques?', required: true },
          { id: 'per_check', type: 'calc', label: 'Per paycheck', label_es: 'Por cheque', format: 'money', showIf: { field: 'split', eq: true },
            calc: function (v) { return v.uniform && v.uniform.total ? Math.round(v.uniform.total / 2 * 100) / 100 : null; } }
        ] },

        { id: 'g_bonus', type: 'group', label: 'Bonus', showIf: { field: 'type', eq: 'bonus' }, fields: [
          { id: 'bonus_amount', type: 'currency', label: 'Bonus amount', required: true, min: 1 },
          { id: 'bonus_reason', type: 'textarea', label: 'Reason', required: true }
        ] },

        { id: 'g_rate', type: 'group', label: 'Pay rate increase', showIf: { field: 'type', eq: 'pay_rate' }, fields: [
          { id: 'rate_current', type: 'currency', label: 'Current rate (per hour)', required: true },
          { id: 'rate_new', type: 'currency', label: 'New rate (per hour)', required: true,
            check: function (v, vals) { return v !== '' && vals.rate_current !== '' && num(v) <= num(vals.rate_current) ? { en: 'New rate should be higher than the current rate' } : null; } },
          { id: 'rate_change', type: 'calc', label: 'Change', format: 'percent',
            calc: function (v) { return num(v.rate_current) > 0 && num(v.rate_new) > 0 ? (num(v.rate_new) / num(v.rate_current) - 1) * 100 : null; } },
          { id: 'rate_effective', type: 'date', label: 'Effective date', required: true }
        ] },

        { id: 'g_cert', type: 'group', label: 'Certification change', showIf: { field: 'type', eq: 'cert' }, fields: [
          { id: 'cert_level', type: 'choice', style: 'list', label: 'Certification earned', required: true, options: [
            { v: 'team_member', l: 'Certified Team Member' }, { v: 'trainer', l: 'Certified Trainer' },
            { v: 'team_leader', l: 'Certified Team Leader' }, { v: 'director', l: 'Certified Director' },
            { v: 'executive', l: 'Certified Executive' }] },
          { id: 'cert_effective', type: 'date', label: 'Effective date', required: true }
        ] },

        { id: 'g_cash', type: 'group', label: 'Cash shortage', showIf: { field: 'type', eq: 'cash' }, fields: [
          { id: 'cash_amount', type: 'currency', label: 'Shortage amount', required: true, min: 0.01 },
          { id: 'cash_date', type: 'date', label: 'Date of the shortage', required: true },
          { id: 'cash_explain', type: 'textarea', label: 'What happened?', required: true }
        ] },

        { id: 'other_detail', type: 'textarea', label: 'What needs to change?', label_es: '¿Qué hay que cambiar?', required: true, showIf: { field: 'type', eq: 'other' } },
        { id: 'notes', type: 'textarea', label: 'Anything else payroll should know?', label_es: '¿Algo más que nómina deba saber?' },
        { id: 'entered_by', type: 'person', remember: 'leader', label: 'Your name, if entering this for someone else', label_es: 'Tu nombre, si lo llenas por otra persona' }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'leave_request', version: 1, category: 'people', icon: 'calendar',
      title: 'Leave of Absence', title_es: 'Permiso de ausencia',
      blurb: 'FMLA, parental, military, bereavement and more', blurb_es: 'FMLA, maternidad/paternidad, militar, duelo y más',
      keywords: ['leave', 'loa', 'fmla', 'maternity', 'paternity', 'bereavement', 'permiso', 'ausencia'],
      successText: 'HR will review your request and follow up.', successText_es: 'Recursos Humanos revisará tu solicitud y te contactará.',
      inboxSummary: ['type', 'start', 'end', 'name'],
      fields: [
        { type: 'info', collapsed: true, label: 'Read before you apply', label_es: 'Lee antes de solicitar',
          bullets: [
            'Submit at least 30 days before your leave starts, or as soon as you can if it was unexpected.',
            'Every leave must be approved in advance by the HR director.',
            'If your dates change, submit a new request.',
            'During an unpaid leave you are responsible for your insurance premiums, as agreed with HR before the leave starts.',
            'Contact HR at least one week before your return date.',
            'You may be asked to fill out more forms once your leave is approved.'],
          bullets_es: [
            'Envía esto al menos 30 días antes de que empiece tu permiso, o lo antes posible si fue inesperado.',
            'Todo permiso debe ser aprobado con anticipación por el director de Recursos Humanos.',
            'Si cambian tus fechas, envía una nueva solicitud.',
            'Durante un permiso sin goce de sueldo, tú pagas tus primas de seguro, según lo acordado con Recursos Humanos.',
            'Comunícate con Recursos Humanos al menos una semana antes de regresar.',
            'Es posible que te pidan llenar más formularios cuando se apruebe tu permiso.'] },
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name', label_es: 'Tu nombre', required: true },
        STORE,
        { id: 'type', type: 'choice', style: 'list', label: 'Type of leave', label_es: 'Tipo de permiso', required: true, options: [
          { v: 'fmla', l: 'FMLA (Family and Medical Leave Act)', l_es: 'FMLA (Ley de Licencia Familiar y Médica)' },
          { v: 'maternity', l: 'Maternity leave', l_es: 'Licencia de maternidad' },
          { v: 'paternity', l: 'Paternity leave', l_es: 'Licencia de paternidad' },
          { v: 'loa', l: 'Personal leave of absence', l_es: 'Permiso personal' },
          { v: 'civic', l: 'Jury, civic or witness duty', l_es: 'Jurado, deber cívico o testigo' },
          { v: 'military', l: 'Military leave', l_es: 'Licencia militar' },
          { v: 'bereavement', l: 'Bereavement', l_es: 'Duelo' }] },
        { id: 'start', type: 'date', label: 'First day of leave', label_es: 'Primer día del permiso', required: true },
        { id: 'end', type: 'date', label: 'Last day of leave', label_es: 'Último día del permiso', required: true,
          check: function (v, vals) { var d = daysBetween(vals.start, v); return d != null && d < 0 ? { en: 'Must be on or after the first day', es: 'Debe ser igual o posterior al primer día' } : null; } },
        { id: 'length', type: 'calc', label: 'Length of leave', label_es: 'Duración', format: 'days',
          calc: function (v) { var d = daysBetween(v.start, v.end); return d == null || d < 0 ? null : d + 1; } },
        { id: 'notice', type: 'calc', label: 'Notice', label_es: 'Aviso', format: 'days',
          calc: function (v) { return daysBetween(todayStr(), v.start); },
          warnIf: function (d) { return d < 30; }, warnText: 'Less than 30 days away. Send it anyway; HR will follow up.', warnText_es: 'Faltan menos de 30 días. Envíalo de todas formas; Recursos Humanos te contactará.',
          okIf: function (d) { return d >= 30; }, okText: 'Plenty of notice', okText_es: 'Con suficiente aviso' },
        { id: 'notes', type: 'textarea', label: 'Anything HR should know?', label_es: '¿Algo que Recursos Humanos deba saber?' },
        { id: 'signature', type: 'signature', label: 'Your signature', label_es: 'Tu firma', required: true }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'resignation', version: 1, category: 'people', icon: 'door',
      title: 'Resignation', title_es: 'Renuncia',
      blurb: 'Let us know your last day', blurb_es: 'Avísanos cuál será tu último día',
      intro: 'Please give at least two weeks of notice when you can. Thank you for being part of the team.',
      intro_es: 'Por favor avisa con al menos dos semanas de anticipación cuando sea posible. Gracias por ser parte del equipo.',
      keywords: ['resign', 'quit', 'two weeks', 'notice', 'renuncia', 'renunciar'],
      successText: 'Your leader will reach out to talk through next steps.', successText_es: 'Tu líder se comunicará contigo para hablar de los siguientes pasos.',
      inboxSummary: ['name', 'last_day', 'reason'],
      fields: [
        STORE,
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your full name', label_es: 'Tu nombre completo', required: true },
        { id: 'supervisor', type: 'person', label: 'Your leader or manager', label_es: 'Tu líder o gerente', required: true },
        { id: 'last_day', type: 'date', label: 'Last day of work', label_es: 'Último día de trabajo', required: true },
        { id: 'notice', type: 'calc', label: 'Notice', label_es: 'Aviso', format: 'days',
          calc: function (v) { return daysBetween(todayStr(), v.last_day); },
          warnIf: function (d) { return d < 14; }, warnText: 'Less than two weeks of notice', warnText_es: 'Menos de dos semanas de aviso',
          okIf: function (d) { return d >= 14; }, okText: 'Two weeks or more', okText_es: 'Dos semanas o más' },
        { id: 'reason', type: 'choice', style: 'list', label: 'Reason for leaving', label_es: 'Motivo de tu salida', required: true, options: [
          { v: 'new_job', l: 'Found another job', l_es: 'Encontré otro trabajo' },
          { v: 'school', l: 'Going back to school', l_es: 'Regreso a la escuela' },
          { v: 'moving', l: 'Moving away', l_es: 'Me voy a mudar' },
          { v: 'schedule', l: 'Schedule conflict', l_es: 'Conflicto de horario' },
          { v: 'personal', l: 'Personal reasons', l_es: 'Razones personales' },
          { v: 'other', l: 'Other', l_es: 'Otro' }] },
        { id: 'reason_other', type: 'text', label: 'Tell us more', label_es: 'Cuéntanos más', required: true, showIf: { field: 'reason', eq: 'other' } },
        { id: 'doc', type: 'file', max: 2, label: 'Already told your leader by message? Add a screenshot', label_es: '¿Ya le avisaste a tu líder por mensaje? Agrega una captura' },
        { id: 'g_exit', type: 'group', label: 'A few quick questions', label_es: 'Unas preguntas rápidas', fields: [
          { id: 'enjoyed', type: 'textarea', label: 'What did you enjoy most about working here?', label_es: '¿Qué fue lo que más disfrutaste de trabajar aquí?' },
          { id: 'improve', type: 'textarea', label: 'What could we do better for future team members?', label_es: '¿Qué podríamos mejorar para futuros miembros del equipo?' },
          { id: 'return', type: 'choice', label: 'Would you consider coming back someday?', label_es: '¿Considerarías regresar algún día?', required: true, options: [
            { v: 'yes', l: 'Yes', l_es: 'Sí' }, { v: 'maybe', l: 'Maybe', l_es: 'Tal vez' }, { v: 'no', l: 'No' }] }
        ] },
        { id: 'confirm', type: 'ack', required: true,
          statement: "I am voluntarily resigning from my position at Chick-fil-A and have given my expected last day. I understand my final paycheck will be processed on the normal payroll schedule.",
          statement_es: 'Renuncio voluntariamente a mi puesto en Chick-fil-A y he indicado mi último día. Entiendo que mi último cheque se procesará según el calendario normal de nómina.' },
        { id: 'signature', type: 'signature', label: 'Your signature', label_es: 'Tu firma', required: true }
      ]
    },

    /* ------------------------------------------------------------------ */
    /* Termination checklist: leaders only, tailored to a restaurant       */
    /* ------------------------------------------------------------------ */
    {
      id: 'termination', version: 1, category: 'people', icon: 'clipboard', audience: 'leaders', sensitive: true,
      title: 'Separation Checklist',
      blurb: 'Close out a team member who is leaving',
      keywords: ['termination', 'offboard', 'separation', 'fired', 'checklist'],
      inboxSummary: ['employee', 'term_type', 'progress'],
      fields: [
        STORE,
        { id: 'employee', type: 'person', label: 'Team member', required: true },
        { id: 'position', type: 'choice', style: 'chips', label: 'Position', required: true, options: [
          { v: 'team_member', l: 'Team Member' }, { v: 'trainer', l: 'Trainer' }, { v: 'team_leader', l: 'Team Leader' },
          { v: 'director', l: 'Director' }, { v: 'executive', l: 'Executive' }, { v: 'support', l: 'Support' }] },
        { id: 'hire_date', type: 'date', label: 'Hire date', required: true },
        { id: 'term_date', type: 'date', label: 'Last day', required: true },
        { id: 'term_type', type: 'choice', label: 'Type', required: true, options: [{ v: 'voluntary', l: 'Voluntary' }, { v: 'involuntary', l: 'Involuntary' }] },
        { id: 'doc', type: 'file', max: 3, label: 'Related documents', help: 'Resignation, write-ups, separation notice (photo or PDF).' },
        { id: 'checklist', type: 'multi', style: 'checks', label: 'Checklist', sections: [
          { label: 'Paperwork', items: [
            { v: 'term_doc', l: 'Separation document completed' },
            { v: 'exit_interview', l: 'Exit interview done or offered' }] },
          { label: 'Access', items: [
            { v: 'hotschedules', l: 'Removed from HotSchedules' },
            { v: 'apps', l: 'Removed from Connecteam and Ops Hub' },
            { v: 'pos', l: 'POS / register login turned off' },
            { v: 'other_access', l: 'Any other logins turned off (email, CFA systems)' }] },
          { label: 'Property', items: [
            { v: 'uniform', l: 'Uniform and name tag returned' },
            { v: 'keys', l: 'Keys returned; alarm and safe codes changed (leaders)' },
            { v: 'equipment', l: 'Store equipment returned (tablet, headset, card)' }] },
          { label: 'Final pay', items: [
            { v: 'timesheet', l: 'Final timesheet reviewed' },
            { v: 'expenses', l: 'Open expenses reimbursed' },
            { v: 'benefits', l: 'Benefits reviewed' }] }] },
        { id: 'progress', type: 'calc', label: 'Progress',
          calc: function (v) { return (v.checklist || []).length + ' of 12 done'; },
          okIf: function (s, v) { return (v.checklist || []).length === 12; }, okText: 'All done' },
        { id: 'emp_signature', type: 'signature', label: 'Team member signature', help: 'If they are present.' },
        { id: 'name', type: 'person', role: 'submitter', remember: 'leader', label: 'Leader completing this', required: true },
        { id: 'mgr_signature', type: 'signature', label: 'Leader signature', required: true }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'injury_report', version: 1, category: 'safety', icon: 'bandage', sensitive: true,
      title: 'Injury Report', title_es: 'Reporte de lesión',
      blurb: 'Anyone hurt at work, within 24 hours', blurb_es: 'Cualquier lesión en el trabajo, dentro de 24 horas',
      keywords: ['injury', 'accident', 'hurt', 'burn', 'cut', 'workers comp', 'lesión', 'accidente', 'quemadura'],
      successText: 'Thank you. A leader will follow up.', successText_es: 'Gracias. Un líder te dará seguimiento.',
      inboxSummary: ['injured', 'area', 'when', 'medical'],
      fields: [
        { type: 'info', tone: 'danger', label: 'Seriously hurt? Call 911 first.', label_es: '¿Lesión grave? Llama al 911 primero.',
          text: ['Then tell the leader on shift. Fill this out as soon as you can, within 24 hours.'],
          text_es: ['Después avísale al líder en turno. Llena esto lo antes posible, dentro de 24 horas.'] },
        STORE,
        { id: 'when', type: 'datetime', default: 'now', label: 'When did it happen?', label_es: '¿Cuándo pasó?', required: true },
        { id: 'injured', type: 'person', label: 'Who was hurt?', label_es: '¿Quién se lastimó?', required: true },
        { id: 'name', type: 'person', role: 'submitter', remember: 'name', label: 'Your name (person filling this out)', label_es: 'Tu nombre (quien llena esto)', required: true },
        { id: 'area', type: 'choice', style: 'chips', label: 'Where?', label_es: '¿Dónde?', required: true, options: AREAS },
        { id: 'spot', type: 'text', label: 'Exact spot', label_es: 'Lugar exacto', placeholder: 'e.g. Breading table, walk-in freezer', placeholder_es: 'ej. Mesa de empanizar, congelador' },
        { id: 'kind', type: 'multi', label: 'Type of injury', label_es: 'Tipo de lesión', options: [
          { v: 'cut', l: 'Cut', l_es: 'Cortada' }, { v: 'burn', l: 'Burn', l_es: 'Quemadura' }, { v: 'fall', l: 'Slip or fall', l_es: 'Resbalón o caída' },
          { v: 'strain', l: 'Strain from lifting', l_es: 'Esfuerzo al levantar' }, { v: 'struck', l: 'Hit by something', l_es: 'Golpe' },
          { v: 'other', l: 'Other', l_es: 'Otro' }] },
        { id: 'description', type: 'textarea', label: 'What happened?', label_es: '¿Qué pasó?', required: true,
          help: 'Step by step: what they were doing, any equipment involved, and how it happened.',
          help_es: 'Paso a paso: qué estaban haciendo, qué equipo estaba involucrado y cómo pasó.' },
        { id: 'witnesses_yn', type: 'yesno', label: 'Did anyone see it happen?', label_es: '¿Alguien lo vio?', required: true },
        { id: 'witnesses', type: 'textarea', label: 'Witness names', label_es: 'Nombres de los testigos', required: true, showIf: { field: 'witnesses_yn', eq: true } },
        { id: 'photos', type: 'photo', label: 'Photos of the area or injury', label_es: 'Fotos del área o la lesión',
          help: 'Spills, broken equipment, the injury itself if they are okay with it.', help_es: 'Derrames, equipo dañado, la lesión si la persona está de acuerdo.' },
        { id: 'medical', type: 'yesno', label: 'Did they get medical attention?', label_es: '¿Recibió atención médica?', required: true },
        { id: 'medical_where', type: 'text', label: 'Where?', label_es: '¿Dónde?', showIf: { field: 'medical', eq: true },
          placeholder: 'First aid on site, urgent care, ER…', placeholder_es: 'Primeros auxilios aquí, clínica, sala de emergencias…' },
        { id: 'leader', type: 'person', label: 'Leader who was told', label_es: 'Líder al que se le avisó', required: true },
        { id: 'comments', type: 'textarea', label: 'Anything else?', label_es: '¿Algo más?' },
        { id: 'confirm', type: 'ack', required: true,
          statement: "I reported this injury to the leadership team within 24 hours and understand my rights regarding workers' compensation.",
          statement_es: 'Reporté esta lesión al equipo de liderazgo dentro de 24 horas y entiendo mis derechos sobre la compensación laboral.' },
        { id: 'signature', type: 'signature', label: 'Signature of the person who was hurt', label_es: 'Firma de la persona lesionada', required: true }
      ]
    },

    /* ------------------------------------------------------------------ */
    /* Harassment report: anonymous option; nothing saved on the device    */
    /* ------------------------------------------------------------------ */
    {
      id: 'harassment_report', version: 1, category: 'safety', icon: 'shield', sensitive: true, noDraft: true, noRemember: true,
      title: 'Report Harassment', title_es: 'Reportar acoso',
      blurb: 'You can report anonymously', blurb_es: 'Puedes reportar de forma anónima',
      keywords: ['harassment', 'complaint', 'report', 'bullying', 'anonymous', 'acoso', 'queja', 'anónimo'],
      successText: 'Thank you for speaking up. Leadership will look into this.', successText_es: 'Gracias por hablar. El liderazgo lo va a investigar.',
      inboxSummary: ['when', 'about'],
      fields: [
        { type: 'info', label: 'You are not in trouble for reporting.', label_es: 'No tendrás problemas por reportar.',
          text: ['If you believe you have been harassed, tell us here. Reports go only to restaurant leadership. If you are in danger right now, call 911.'],
          text_es: ['Si crees que has sufrido acoso, cuéntanos aquí. Los reportes solo los ve el liderazgo del restaurante. Si estás en peligro ahora mismo, llama al 911.'] },
        { id: 'anonymous', type: 'yesno', role: 'anonymous', label: 'Do you want to stay anonymous?', label_es: '¿Quieres permanecer en el anonimato?', required: true,
          help: 'If you do, we cannot follow up with you directly.', help_es: 'Si eliges el anonimato, no podremos darte seguimiento directamente.' },
        { id: 'g_who', type: 'group', plain: true, showIf: { field: 'anonymous', eq: false }, fields: [
          { id: 'name', type: 'person', role: 'submitter', label: 'Your name', label_es: 'Tu nombre', required: true },
          { id: 'contact', type: 'text', label: 'Best way to reach you privately', label_es: 'La mejor forma de contactarte en privado', placeholder: 'Phone or email', placeholder_es: 'Teléfono o correo' }
        ] },
        STORE,
        { id: 'when', type: 'datetime', label: 'When did it happen?', label_es: '¿Cuándo pasó?', required: true,
          help: 'Best guess is fine. If it keeps happening, give the most recent time.', help_es: 'Una fecha aproximada está bien. Si sigue pasando, da la más reciente.' },
        { id: 'where', type: 'text', label: 'Where did it happen?', label_es: '¿Dónde pasó?' },
        { id: 'about', type: 'person', label: 'Who is this about?', label_es: '¿Sobre quién es esto?' },
        { id: 'description', type: 'textarea', label: 'What happened?', label_es: '¿Qué pasó?', required: true,
          help: 'As much detail as you are comfortable sharing: what was said or done.', help_es: 'Todos los detalles que te sientas cómodo compartiendo: qué se dijo o se hizo.' },
        { id: 'witnesses', type: 'textarea', label: 'Did anyone else see it? Names and phone numbers', label_es: '¿Alguien más lo vio? Nombres y teléfonos' },
        { id: 'first_time', type: 'yesno', label: 'Is this the first time you have raised this concern about this person?', label_es: '¿Es la primera vez que reportas esto sobre esta persona?' }
      ]
    }
  ];

  global.OPS_FORM_CATEGORIES = CATEGORIES;
  global.OPS_FORM_DEFINITIONS = FORMS;
})(window);

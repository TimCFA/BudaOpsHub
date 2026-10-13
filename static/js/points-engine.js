// ===== ACCOUNTABILITY POINTS: THE ENGINE (TIM-70) =====
// The parser and scoring from Tim's "Buda Accountability Points" artifact,
// unchanged so both score alike: the Actual vs. Scheduled punch report (pdf.js
// text items) → shifts → candidate events (tardies, late breaks, absences,
// extended shifts, unscheduled work) → points, the ladder, and the drafted
// messages (English and Spanish). The hub's side is in points.js.

// ===== APS engine: parser + scoring (shared by the page and Node tests) =====
var APS = (function(){
  // ---------- time helpers ----------
  function toMin(s){ // "04:59 PM" -> minutes since midnight
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((s||'').trim());
    if(!m) return null;
    var h = +m[1] % 12, mm = +m[2];
    if(m[3].toUpperCase()==='PM') h += 12;
    return h*60+mm;
  }
  function fmtTime(min){ // minutes -> "5:33 AM"
    min = ((min%1440)+1440)%1440;
    var h = Math.floor(min/60), m = min%60, ap = h>=12?'PM':'AM';
    h = h%12; if(h===0) h=12;
    return h+':'+(m<10?'0':'')+m+' '+ap;
  }
  function isoDate(us){ // "09/21/2026" -> "2026-09-21"
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us||'');
    return m ? m[3]+'-'+m[1]+'-'+m[2] : null;
  }
  function quarterOf(iso){ var y=+iso.slice(0,4), mo=+iso.slice(5,7); return y+'-Q'+(Math.floor((mo-1)/3)+1); }
  function quarterStart(q){ var y=+q.slice(0,4), n=+q.slice(6); return y+'-'+String((n-1)*3+1).padStart(2,'0')+'-01'; }
  function nextQuarter(q){ var y=+q.slice(0,4), n=+q.slice(6); return n===4 ? (y+1)+'-Q1' : y+'-Q'+(n+1); }
  function prevQuarter(q){ var y=+q.slice(0,4), n=+q.slice(6); return n===1 ? (y-1)+'-Q4' : y+'-Q'+(n-1); }
  function slug(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function firstName(name){ // "Aguilera Andrade, Yaqueline" -> "Yaqueline"
    var p = name.split(',');
    return (p.length>1 ? p[1] : p[0]).trim().split(/\s+/)[0];
  }
  function displayName(name){ var p=name.split(','); return p.length>1 ? (p[1].trim()+' '+p[0].trim()) : name; }

  // ---------- parser: pdf.js text items -> shifts ----------
  // pages: [{items:[{s,x,y}]}] ; returns {range, runDate, shifts:[{emp, date, actIn, actOut, schIn, schOut}]}
  function parseReport(pages){
    var shifts=[], range=null, runDate=null, emp=null, location=null;
    // Location line: on page 1, the text between the report title and the date range.
    (function(){
      var pg=pages[0]; if(!pg) return;
      var title=null, rng=null;
      pg.items.forEach(function(i){ var t=(i.s||'').trim(); if(/Actual Vs\.? Scheduled/i.test(t)) title=i; if(/^\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}$/.test(t)) rng=i; });
      if(!title||!rng) return;
      var mid=pg.items.filter(function(i){ return i.y<title.y && i.y>rng.y && (i.s||'').trim(); }).map(function(i){ return i.s.trim(); });
      if(mid.length) location=mid.join(' ');
    })();
    var X = {name:40, date:[140,175], act:[195,240], sch:[255,305]};
    pages.forEach(function(pg){
      var items = pg.items.filter(function(i){ return i.s && i.s.trim(); });
      // group by rounded y
      var rows = {};
      items.forEach(function(i){
        var key = Math.round(i.y);
        (rows[key] = rows[key] || []).push(i);
      });
      var ys = Object.keys(rows).map(Number).sort(function(a,b){return b-a;}); // top first
      ys.forEach(function(y){
        var r = rows[y];
        r.forEach(function(i){
          var s=i.s.trim();
          if(!range){ var m=/^(\d{2}\/\d{2}\/\d{4}) - (\d{2}\/\d{2}\/\d{4})$/.exec(s); if(m) range=[isoDate(m[1]),isoDate(m[2])]; }
          if(!runDate){ var m2=/^(\d{2}\/\d{2}\/\d{4}) \d{1,2}:\d{2}:\d{2} (AM|PM)$/.exec(s); if(m2) runDate=isoDate(m2[1]); }
          if(i.x < X.name && /,/.test(s) && !/Total/i.test(s)) emp = s;
        });
        var dateItem = r.find(function(i){ return i.x>=X.date[0] && i.x<=X.date[1] && /^\d{2}\/\d{2}\/\d{4}$/.test(i.s.trim()); });
        if(!dateItem || !emp) return;
        var date = isoDate(dateItem.s.trim());
        function cell(col, yy){ // find a time item in column at row y or the line below (y-9)
          var hit = r.find(function(i){ return i.x>=col[0] && i.x<=col[1] && toMin(i.s)!==null; });
          return hit ? toMin(hit.s) : null;
        }
        function cellBelow(col){
          var below = rows[y-9] || rows[y-8] || rows[y-10] || [];
          var hit = below.find(function(i){ return i.x>=col[0] && i.x<=col[1] && toMin(i.s)!==null; });
          return hit ? toMin(hit.s) : null;
        }
        shifts.push({ emp:emp, date:date, actIn:cell(X.act), actOut:cellBelow(X.act), schIn:cell(X.sch), schOut:cellBelow(X.sch) });
      });
    });
    return {range:range, runDate:runDate, location:location, shifts:shifts};
  }

  // ---------- derive candidate events from shifts ----------
  // settings: {breakMinutes, graceMinutes, extendedHours, quarterStartDate}
  // returns [{id, tm, tmName, date, type, status, detail, minutes, actIn, schIn}]
  function deriveEvents(parsed, settings, opts){
    opts = opts||{};
    var cutoff = opts.cutoffDate || parsed.runDate; // absences only for dates before this
    var minDate = settings.quarterStartDate || '2026-10-01';
    var out=[];
    // group by emp+date, keep report order
    var byKey={}, order=[];
    parsed.shifts.forEach(function(s){
      var k=s.emp+'|'+s.date; if(!byKey[k]){byKey[k]=[];order.push(k);} byKey[k].push(s);
    });
    order.forEach(function(k){
      var rows=byKey[k], emp=rows[0].emp, date=rows[0].date, tm=slug(emp);
      if(date < minDate) return;
      var lastOut=null; // actual out of the previous segment on this day
      rows.forEach(function(s){
        var id=tm+'_'+date;
        if(s.schIn!==null && s.actIn===null && s.actOut===null){
          if(cutoff && date < cutoff){
            out.push({id:id+'_absence_'+pad(s.schIn), tm:tm, tmName:emp, date:date, type:'absence', status:'review',
              detail:'No punches for the '+fmtTime(s.schIn)+'–'+fmtTime(s.schOut)+' shift. Classify: no-call/no-show, call-out type, or approved time off.',
              schIn:s.schIn, schOut:s.schOut});
          }
        } else if(s.schIn!==null && s.actIn!==null){
          var late = s.actIn - s.schIn;
          if(late > (settings.clockGraceMinutes||0)){
            out.push({id:id+'_tardy_'+pad(s.schIn), tm:tm, tmName:emp, date:date, type:'tardy', status:'confirmed',
              minutes:late, actIn:s.actIn, schIn:s.schIn,
              detail:'Clocked in at '+fmtTime(s.actIn)+' for a '+fmtTime(s.schIn)+' start ('+late+' min late).'});
          }
          if(s.actOut!==null && s.schOut!==null && (s.actOut - s.schOut) >= (settings.extendedHours||3)*60){
            out.push({id:id+'_extended_'+pad(s.schIn), tm:tm, tmName:emp, date:date, type:'extended', status:'review',
              minutes:s.actOut-s.schOut, detail:'Clocked out at '+fmtTime(s.actOut)+' vs '+fmtTime(s.schOut)+' scheduled ('+Math.round((s.actOut-s.schOut)/60*10)/10+' hrs over). Confirm it was to cover the team.'});
          }
        } else if(s.schIn===null && s.actIn!==null && lastOut!==null){
          var brk = s.actIn - lastOut;
          var allowed = (settings.breakMinutes||30) + (settings.graceMinutes||0);
          if(brk > allowed){
            out.push({id:id+'_break_'+pad(s.actIn), tm:tm, tmName:emp, date:date, type:'latebreak', status:'confirmed',
              minutes:brk, breakOut:lastOut, breakIn:s.actIn,
              detail:'Break ran '+brk+' min ('+fmtTime(lastOut)+' to '+fmtTime(s.actIn)+') against a '+(settings.breakMinutes||30)+'-min break.'});
          }
        } else if(s.schIn===null && s.actIn!==null && lastOut===null && !rows.some(function(r){ return r.schIn!==null; })){
          // Worked on a day with no scheduled shift at all: likely a call-in or pickup. A leader confirms the credit.
          out.push({id:id+'_unscheduled_'+pad(s.actIn), tm:tm, tmName:emp, date:date, type:'unscheduled', status:'review',
            actIn:s.actIn, actOut:s.actOut,
            detail:'Worked '+fmtTime(s.actIn)+(s.actOut!==null?'–'+fmtTime(s.actOut):'')+' with no scheduled shift. Called in or picked up a shift?'});
        }
        if(s.actOut!==null) lastOut=s.actOut;
      });
    });
    return out;
  }
  function pad(m){ return String(m).padStart(4,'0'); }

  // ---------- scoring ----------
  var TYPES = {
    violence:     {label:'Violence',                         pts:100},
    harassment:   {label:'Harassment',                       pts:100},
    theft:        {label:'Theft (product, equipment, time)', pts:100},
    discount:     {label:'Discount violation',               pts:100},
    insubord:     {label:'Insubordination',                  pts:50},
    language:     {label:'Inappropriate language',           pts:50},
    ncns:         {label:'No-call/no-show',                  pts:50},
    callout_lt24: {label:'Call-out, under 24 hrs notice',    pts:25},
    mgrpin:       {label:'Use of manager pin',               pts:25},
    callout_24:   {label:'Call-out, 24+ hrs notice',         pts:10},
    callout_doc:  {label:'Call-out under 24 hrs, with documentation', pts:10},
    values:       {label:'Values violation',                 pts:10},
    uniform:      {label:'Uniform/appearance violation',     pts:5},
    foodsafety:   {label:'Food safety violation',            pts:5},
    tasks:        {label:'Left shift without completed tasks', pts:5},
    pickup:       {label:'Picked up a shift',                pts:-10},
    cover:        {label:'Covered for a team member',        pts:-10},
    aboveb:       {label:'Above and beyond performance',     pts:-10},
    extended:     {label:'Extended shift (3+ hrs to cover the team)', pts:-10},
    timeoff:      {label:'Approved time off (requested before schedule posted)', pts:0},
    tardy:        {label:'Tardy',                            pts:null},
    latebreak:    {label:'Late from break',                  pts:null},
    carryover:    {label:'Carryover from last quarter',      pts:null},
    absence:      {label:'Absence (needs review)',           pts:null},
    unscheduled:  {label:'Worked with no scheduled shift (needs review)', pts:null}
  };
  function punctPts(n){ return n<=3 ? 5 : n===4 ? 10 : 20; }

  var LADDER = [
    {at:5,   label:'Admin messages TM their QTD total', short:'Message'},
    {at:10,  label:'Admin messages TM their QTD total', short:'Message'},
    {at:20,  label:'Leader conversation + HR scoreboard update', short:'Leader conversation'},
    {at:30,  label:'Documented warning', short:'Documented warning'},
    {at:50,  label:'Coaching conversation + formal write-up', short:'Write-up'},
    {at:75,  label:'PIP + 1-week suspension (enacted next schedule)', short:'PIP + suspension'},
    {at:100, label:'HR meeting to document and terminate', short:'Termination'}
  ];
  function ladderLevel(total){ var lv=null; LADDER.forEach(function(l){ if(total>=l.at) lv=l; }); return lv; }
  function nextStep(total){ return LADDER.find(function(l){ return l.at>total && l.at>=20; }) || null; }

  // events: all confirmed events for one TM in one quarter. Returns events annotated with pts & running total.
  function scoreTM(events){
    var sorted = events.slice().sort(function(a,b){ return (a.date+(a.seq||'')) < (b.date+(b.seq||'')) ? -1 : 1; });
    var n=0, total=0;
    sorted.forEach(function(e){
      var p;
      if(e.type==='tardy'||e.type==='latebreak'){ n++; e.punctN=n; p=punctPts(n); }
      else if(e.type==='carryover') p=e.points||0;
      else if(TYPES[e.type] && TYPES[e.type].pts!==null) p=TYPES[e.type].pts;
      else p=e.points||0;
      e.pts=p; total=Math.max(0,total+p); e.running=total;
    });
    return {events:sorted, total:total, punctCount:n};
  }
  function carryover(endTotal){ return Math.max(0, Math.min(20, Math.floor(endTotal*0.5))); }

  // ---------- message drafting ----------
  var ES = {
    labels: {violence:'Violencia', harassment:'Acoso', theft:'Robo (producto, equipo o tiempo)', discount:'Violación de descuentos', insubord:'Insubordinación',
      language:'Lenguaje inapropiado', ncns:'No llamar ni presentarse', callout_lt24:'Aviso de falta con menos de 24 horas', mgrpin:'Uso del PIN de gerente',
      callout_24:'Aviso de falta con 24+ horas', callout_doc:'Aviso de falta con documentación', values:'Violación de valores', uniform:'Violación de uniforme o apariencia',
      foodsafety:'Violación de seguridad alimentaria', tasks:'Salir del turno sin terminar las tareas', pickup:'Turno extra', cover:'Cubrir a un compañero',
      aboveb:'Desempeño excepcional', extended:'Turno extendido para apoyar al equipo', timeoff:'Tiempo libre aprobado', tardy:'Tardanza', latebreak:'Regreso tarde del descanso', carryover:'Puntos del trimestre anterior'},
    ladder: {5:'un mensaje con tu total del trimestre', 10:'un mensaje con tu total del trimestre', 20:'una conversación con un líder y actualización en el tablero de HR',
      30:'una advertencia documentada', 50:'una conversación de coaching y un reporte formal por escrito', 75:'un plan de mejora (PIP) y una suspensión de una semana', 100:'una reunión con HR para documentar y terminar el empleo'}
  };
  function dayLabel(iso, today, lang){
    var d=new Date(iso+'T12:00:00'), t=new Date(today+'T12:00:00');
    var diff=Math.round((t-d)/86400000);
    var es = lang==='es';
    var wd=(es?['dom','lun','mar','mié','jue','vie','sáb']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[d.getDay()];
    var md=(d.getMonth()+1)+'/'+d.getDate();
    if(diff===0) return es?'hoy':'today';
    if(diff===1) return (es?'ayer (':'yesterday (')+wd+' '+md+')';
    return wd+' '+md;
  }
  // ---------- short message format ----------
  // One line per item, scannable on a phone. Target under 450 characters.
  var SHORT = {
    en: {
      open: ['Hey {f}, attendance update from {l} and the leadership team.',
             'Hey {f}, quick attendance note from {l} and the leadership team.',
             'Hey {f}, {l} and the leadership team check attendance daily. Here is yours.'],
      openPos: ['Hey {f}, {l} and the leadership team noticed something good.',
                'Hey {f}, good news from {l} and the leadership team.'],
      total: 'You are at {t} points this quarter.',
      next: 'At {n}: {step}.',
      reached: 'That passes {n} ({step}). A leader will follow up.',
      closeLow: ['Easy to stay ahead of. We know you will.', 'Small things add up. We know you will keep this one small.', 'We know you can be on time. We are counting on it.'],
      closeHigh: ['We would rather fix this with you than watch it climb. Talk to a leader.', 'We want to keep you here. Let\'s talk about getting this back under control.'],
      closePos: ['Keep it up. We see it.', 'Thanks for stepping up. It does not go unnoticed.'],
      check: 'Seems off? Come see a senior director.',
      steps: {5:'a message with your total', 10:'a message with your total', 20:'leader conversation', 30:'documented warning', 50:'coaching conversation + write-up', 75:'PIP + 1-week suspension', 100:'HR meeting to terminate'}
    },
    es: {
      open: ['Hola {f}, actualización de asistencia de {l} y el equipo de liderazgo.',
             'Hola {f}, una nota rápida de asistencia de {l} y el equipo de liderazgo.',
             'Hola {f}, {l} y el equipo de liderazgo revisamos la asistencia a diario. Aquí va la tuya.'],
      openPos: ['Hola {f}, {l} y el equipo de liderazgo notamos algo bueno.',
                'Hola {f}, buenas noticias de {l} y el equipo de liderazgo.'],
      total: 'Llevas {t} puntos este trimestre.',
      next: 'A los {n}: {step}.',
      reached: 'Eso pasa los {n} ({step}). Un líder hablará contigo.',
      closeLow: ['Es fácil mantenerse adelante. Sabemos que lo harás.', 'Las cosas pequeñas suman. Sabemos que esta la mantendrás pequeña.', 'Sabemos que puedes llegar a tiempo. Contamos contigo.'],
      closeHigh: ['Preferimos resolver esto contigo que ver cómo sube. Habla con un líder.', 'Queremos que sigas aquí. Hablemos de cómo volver a tener esto bajo control.'],
      closePos: ['Sigue así. Lo vemos.', 'Gracias por dar ese paso extra. No pasa desapercibido.'],
      check: '¿Algo no cuadra? Habla con un director senior.',
      steps: {5:'un mensaje con tu total', 10:'un mensaje con tu total', 20:'conversación con un líder', 30:'advertencia documentada', 50:'conversación de coaching + reporte escrito', 75:'PIP + suspensión de una semana', 100:'reunión con HR para terminar el empleo'}
    }
  };
  function hashStr(s){ var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
  function pick(arr, seed, salt){ return arr[(seed+salt)%arr.length]; }
  function seedFor(tmName, events){ return hashStr(tmName+'|'+events.map(function(e){return e.id;}).join(',')); }
  function shortDay(iso, today, lang){
    var d=new Date(iso+'T12:00:00'), t=new Date(today+'T12:00:00'), diff=Math.round((t-d)/86400000);
    var wd=(lang==='es'?['dom','lun','mar','mié','jue','vie','sáb']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[d.getDay()];
    var md=(d.getMonth()+1)+'/'+d.getDate();
    if(diff===1) return (lang==='es'?'Ayer ':'Yesterday ')+md;
    return wd+' '+md;
  }
  function hm(min){ return fmtTime(min).replace(' ',''); } // 5:33AM
  function eventLine(e, today, lang, breakMinutes){
    var es=lang==='es', day=shortDay(e.date,today,lang), p=e.pts, pp=(p>0?'+':'')+p, hrs=Math.round((e.minutes||0)/60*10)/10;
    var L=es?ES.labels:null;
    switch(e.type){
      case 'tardy': return es ? day+': entrada '+hm(e.actIn)+' para turno de '+hm(e.schIn)+'. Tardanza #'+e.punctN+' ('+pp+')'
                              : day+': clocked in '+hm(e.actIn)+' for a '+hm(e.schIn)+' start. Tardy #'+e.punctN+' ('+pp+')';
      case 'latebreak': return es ? day+': descanso de '+e.minutes+' min (límite '+(breakMinutes||30)+'). Cuenta como tardanza #'+e.punctN+' ('+pp+')'
                                  : day+': '+e.minutes+'-min break ('+(breakMinutes||30)+' allowed). Counts as tardy #'+e.punctN+' ('+pp+')';
      case 'ncns': return es ? day+': no llamaste ni te presentaste ('+pp+')' : day+': no-call/no-show ('+pp+')';
      case 'callout_lt24': return (es ? day+': falta avisada con menos de 24 hrs ('+pp+')' : day+': call-out with under 24 hrs notice ('+pp+')')+(e.notePending?(es?'. Con nota del médico baja a +10':'. Doctor\'s note drops it to +10'):'');
      case 'callout_24': return es ? day+': falta avisada con 24+ hrs ('+pp+')' : day+': call-out with 24+ hrs notice ('+pp+')';
      case 'callout_doc': return e.noteReceived ? (es ? day+': gracias por la nota del médico. Ahora cuenta +10 en lugar de +25' : day+': thanks for the doctor\'s note. Now +10 instead of +25')
                                               : (es ? day+': falta avisada con documentación ('+pp+')' : day+': call-out with documentation ('+pp+')');
      case 'pickup': return es ? day+': viniste cuando el equipo lo necesitaba ('+pp+'). ¡Gracias!' : day+': came in when the team needed help ('+pp+'). Thank you!';
      case 'cover': return es ? day+': cubriste a un compañero ('+pp+'). ¡Gracias!' : day+': covered for a teammate ('+pp+'). Thank you!';
      case 'extended': return es ? day+': te quedaste '+hrs+' hrs extra por el equipo ('+pp+'). ¡Gracias!' : day+': stayed '+hrs+' extra hrs for the team ('+pp+'). Thank you!';
      case 'aboveb': return es ? day+': desempeño excepcional ('+pp+'). ¡Gracias!' : day+': above and beyond ('+pp+'). Thank you!';
      default: return day+': '+(es ? (L[e.type]||e.type) : (TYPES[e.type]?TYPES[e.type].label:e.type))+(e.note?' ('+e.note+')':'')+' ('+pp+')';
    }
  }
  function lc(s){ return s.toLowerCase().replace(/\bhr\b/g,'HR').replace(/\bpip\b/g,'PIP'); }
  // opts: {signature, lang:'en'|'es', breakMinutes}
  function draftMessage(tmName, newEvents, total, today, opts){
    opts = typeof opts==='string' ? {signature:opts} : (opts||{});
    var lang = opts.lang==='es' ? 'es' : 'en', v=SHORT[lang], first=firstName(tmName), seed=seedFor(tmName,newEvents);
    var allPositive = newEvents.every(function(e){ return e.pts<0 || e.noteReceived; });
    var lines=[];
    lines.push(pick(allPositive?v.openPos:v.open, seed, 0).replace('{f}',first).replace('{l}',opts.leader||'Casey'));
    newEvents.forEach(function(e){ lines.push('• '+eventLine(e,today,lang,opts.breakMinutes)); });
    var nx=nextStep(total), lv=ladderLevel(total), status=v.total.replace('{t}',total);
    if(lv && lv.at>=20) status+=' '+v.reached.replace('{n}',lv.at).replace('{step}',v.steps[lv.at]);
    else if(nx) status+=' '+v.next.replace('{n}',nx.at).replace('{step}',v.steps[nx.at]);
    lines.push(status);
    lines.push(pick(allPositive?v.closePos:(total<20?v.closeLow:v.closeHigh), seed, 1));
    lines.push(v.check);
    return lines.join('\n')+'\n— '+(opts.signature||'Chick-fil-A Buda Leadership');
  }
  return {toMin:toMin, fmtTime:fmtTime, isoDate:isoDate, quarterOf:quarterOf, quarterStart:quarterStart, nextQuarter:nextQuarter, prevQuarter:prevQuarter,
    slug:slug, firstName:firstName, displayName:displayName, parseReport:parseReport, deriveEvents:deriveEvents,
    TYPES:TYPES, LADDER:LADDER, punctPts:punctPts, ladderLevel:ladderLevel, nextStep:nextStep, scoreTM:scoreTM, carryover:carryover,
    draftMessage:draftMessage, dayLabel:dayLabel, ES:ES};
})();


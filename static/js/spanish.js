// ===== SPANISH =====
// Screens the kitchen (BOH) team uses carry Spanish next to the English
// (Tim, Oct 2026): Set Ups, Waste, Food Safety and the Prep Board. Every
// translation is here, in one place, so a Spanish-speaking leader can fix a
// word once and it changes everywhere. Informal "tú", as the Waste tab's
// help line already used. tests/test_spanish.py checks that every phrase a
// screen asks for is here and that every BOH station and daypart has one.
//
//   esText(en)   the Spanish for an English phrase ('' if none)
//   esHtml(en)   " <span class=es>…</span>" to sit after the English
//   esLine(en)   the same on its own line, under the English
//   esPlace(slot)  a set-up spot ("Breader 2" → "Empanizador 2"); '' when
//                  any word of it isn't in the station list (FOH spots)
//   esDaypart(name)  "Lunch (10:30-2:00)" → "Almuerzo"
// Phrases with a number take it as an argument: esText('N left', 3).

const ES = {
  // ----- Set Ups -----
  'Set up': 'Configuración',
  'Coach': 'Entrenar',
  'Refresh': 'Actualizar',
  'Checking': 'Revisando',
  'Up to date': 'Al día',
  'N spots updated': n => `${n} ${n === 1 ? 'lugar actualizado' : 'lugares actualizados'}`,
  'This Week': 'Esta semana',
  'Next Week': 'Próxima semana',
  'Shift changes': 'Cambios de turno',
  'Off today': 'No trabaja hoy',
  'N spots to fix': n => `${n} ${n === 1 ? 'puesto' : 'puestos'} por arreglar`,
  'Fill N open': n => `Llenar ${n}`,
  'N placed': n => `${n} ${n === 1 ? 'asignado' : 'asignados'}`,
  'Lead': 'Líder',
  'Choose': 'Elegir',
  'projected': 'proyectado',
  'actual': 'real',
  'per labor hour': 'por hora de trabajo',
  'Goals': 'Metas',
  'Earlier today': 'Más temprano hoy',   // Set Ups: today's dayparts already over, at the bottom   // a Set Ups card's link to Know the Numbers
  'N more spots': n => `+ ${n} ${n === 1 ? 'lugar más' : 'lugares más'} si hay más personas`,
  'Hide open extras': 'Ocultar lugares extra vacíos',
  'needs coverage': 'necesita cobertura',
  'Crushing It': 'Excelente',
  'On the Rise': 'Mejorando',
  'Not Yet': 'Todavía no',
  'Not rated': 'Sin evaluar',
  'Change': 'Cambiar',
  'Hand off': 'Entregar',
  'Note': 'Nota',
  'Clear': 'Quitar',
  'here': 'aquí',
  'on the roster': 'en el horario',
  'Team Lead': 'Líder de equipo',
  'Trainer': 'Entrenador',
  'Drag tip': 'Mantén presionado un nombre y arrástralo a otro lugar para moverlo, o sobre otra persona para intercambiar.',
  'No notes on this spot yet.': 'Todavía no hay notas en este lugar.',
  'Something the next person needs to know': 'Algo que la próxima persona necesita saber',
  'Signed': 'Firmado',
  'Sign in (top right) to sign a note': 'Inicia sesión (arriba a la derecha) para firmar una nota',
  'Cancel': 'Cancelar',
  'Add note': 'Agregar nota',
  'Sign in': 'Iniciar sesión',
  'Remove': 'Quitar',
  'today': 'hoy',
  'Roster': 'Lista del equipo',
  '+ Add Team Member': '+ Agregar miembro del equipo',
  'Team Leader': 'Líder de equipo',
  'In training': 'En entrenamiento',
  'Start break': 'Iniciar descanso',
  'On break': 'En descanso',
  'back at': 'regresa a las',
  'Done': 'Listo',
  'Break done': 'Descanso hecho',
  'undo': 'deshacer',
  'arrives at': 'llega a las',
  'leaves at': 'se va a las',
  'N left': n => `${n} ${n === 1 ? 'falta' : 'faltan'}`,
  'All filled': 'Todo lleno',
  'Next open spot →': 'Siguiente lugar libre →',
  '← Previous': '← Anterior',
  'Search names': 'Buscar nombres',
  'Hand off / split this spot →': 'Entregar / dividir este lugar →',
  'Clear this spot': 'Quitar a la persona de este lugar',
  'off shift now': 'fuera de turno ahora',
  'here now': 'aquí ahora',
  'No one by that name on this shift': 'Nadie con ese nombre en este turno',
  'Nobody on the roster is free for this daypart': 'Nadie del horario está libre en este turno',
  'Skip choice': (slot, above) => `${above} todavía está libre arriba de ${slot}. Los lugares se llenan en orden de prioridad.`,
  'Put NAME in SPOT': (name, spot) => `Poner a ${name} en ${spot}`,
  'Keep NAME in SPOT': (name, spot) => `Dejar a ${name} en ${spot}`,
  '← Back to names': '← Volver a los nombres',
  'Currently assigned:': 'Asignado ahora:',
  'Position': 'Posición',
  'Split With': 'Dividir con',
  'Split Shift': 'Dividir turno',
  'Flag Only — Find Coverage Later': 'Solo marcar: buscar cobertura después',
  'Keep Flagged (Still Looking)': 'Seguir marcado (todavía buscando)',
  'Mark Resolved — No Split Needed': 'Resuelto: no hace falta dividir',
  'Add Team Member': 'Agregar miembro del equipo',
  'Name': 'Nombre',
  'Start Time': 'Hora de entrada',
  'End Time': 'Hora de salida',
  'Add to Roster': 'Agregar al horario',
  'Try 5:30a, 530 or 17:30': 'Pruebe 5:30a, 530 o 17:30',
  'End time is before the start time': 'La hora de salida es antes de la entrada',
  'Truck': 'Camión',
  'No truck shift on the schedule': 'No hay turno de camión en el horario',
  'off the floor': 'fuera del piso',
  'at SPOT now': spot => `en ${spot} ahora`,
  'on the SIDE roster': side => `en el horario de ${side === 'BOH' ? 'cocina' : 'el frente'}`,
  'works': 'trabaja',
  'Also on today’s roster': 'También en el horario de hoy',
  'Show N more from today’s roster': n => `Mostrar ${n} más del horario de hoy`,
  'No one by that name on today’s roster': 'Nadie con ese nombre en el horario de hoy',
  'No one by that name free for this daypart': 'Nadie con ese nombre libre en este turno',
  'Add them with Add Team Member under the roster.': 'Agréguelo con Agregar miembro del equipo debajo del horario.',
  'Export': 'Exportar',
  'Export waste': 'Exportar desperdicio',
  'Last week': 'La semana pasada',
  'Last month': 'El mes pasado',
  'Pick days': 'Elegir días',
  'From': 'Desde',
  'To': 'Hasta',
  'N entries': n => `${n} ${n === 1 ? 'entrada' : 'entradas'}`,
  'No waste logged for those days': 'No hay desperdicio registrado esos días',
  'Download CSV': 'Descargar CSV',
  'Download PDF': 'Descargar PDF',
  'Tomorrow': 'Mañana',
  'No roster yet': 'Todavía no hay horario para este día.',
  'Breaks left': 'Descansos pendientes',
  'Not placed yet': 'Sin asignar',
  'Events': 'Eventos',
  'Tap a name, then a spot': 'Toca un nombre y luego un lugar',
  'Now tap a spot for NAME': name => `Ahora toca un lugar para ${name}`,
  'Everyone on shift is placed.': 'Todos los del turno están asignados.',
  'Put NAME here': name => `Poner a ${name} aquí`,
  'Every break is done.': 'Todos los descansos están hechos.',
  'No breaks owed': 'Nadie trabaja 6 horas o más hoy, así que no hay descansos pendientes.',
  'Search team members': 'Buscar miembros del equipo',
  'Full name': 'Nombre completo',
  'Start typing a name': 'Empieza a escribir un nombre',
  'Pick them from the list': 'Elígelo de la lista',

  // ----- Waste -----
  'Sign in first (top right)': 'Primero inicia sesión (arriba a la derecha)',
  '✓ Under limit': 'Bajo el límite',
  'Near the limit': 'Cerca del límite',
  '⚠ Over limit': 'Sobre el límite',
  '⚠ At the limit': 'En el límite',
  'over the limit': amt => `${amt} sobre el límite`,
  'Right at the limit': 'Justo en el límite',
  'of room left': amt => `quedan ${amt} · menos es mejor`,
  'At ceiling': 'En el tope',
  'All': 'Todo',
  'Proteins': 'Proteínas',
  'Breakfast': 'Desayuno',
  'Breads': 'Panes',
  'Prep': 'Preparación',
  'Raw': 'Crudo',
  'Desserts': 'Postres',
  'Nuggets': 'Pepitas',
  'Strips': 'Tiras',
  'Sandwiches': 'Sándwiches',
  'Sides': 'Acompañantes',
  'Drinks': 'Bebidas',
  'No items match': 'Ningún artículo coincide',
  'Save count': 'Guardar cantidad',
  'Today': 'Hoy',
  "Today's count": 'Cantidad de hoy',
  'No entries in the last 15 minutes': 'No hay entradas en los últimos 15 minutos',
  'No waste logged yet today': 'Todavía no hay desperdicio hoy',
  'Export CSV': 'Exportar CSV',

  // ----- Lists -----
  'Leads sign in hint': 'Líderes de equipo: inicia sesión con tu PIN para la Transición de Líderes y el Conteo de la Caja Fuerte.',

  // ----- Food Safety -----
  'Complete': 'Completo',
  'In progress': 'En progreso',
  'Not started yet today': 'Todavía no se empieza hoy',
  'N coached & corrected': n => `${n} ${n === 1 ? 'entrenado y corregido' : 'entrenados y corregidos'}`,
  'N of M': (n, m) => `${n} de ${m}`,
  'Next:': 'Siguiente:',
  'Recent walkthroughs': 'Recorridos recientes',
  'coached': 'entrenados',
  'Walkthrough N': n => `Recorrido ${n}`,
  'Walkthrough N not started': n => `Recorrido ${n} · todavía no se empieza`,
  'Start another walkthrough': 'Empezar otro recorrido',
  'Nothing coached': 'Nada entrenado',

  // ----- Prep Board -----
  'N made · M to go': (n, m) => `${n} hechos · faltan ${m}`,
  'Done · N made': n => `Listo · ${n} hechos`,
  'N over': n => `${n} de más`,
  'Made today summary': (n, m, k) => `${n} de ${m} hechos hoy · ${k ? `faltan ${k} ${k === 1 ? 'artículo' : 'artículos'}` : 'todo está hecho'}`,
  'N of M done': (n, m) => `${n} de ${m} listos`,
  'Prep Board': 'Tablero de preparación',
  'Prep subtitle': 'Cantidades a preparar del lado frío: ensaladas, wraps, vasos de fruta y parfaits',
  'Build-To Sheet': 'Hoja de preparación',
  'Sold Counts': 'Ventas',
  'Waste': 'Desperdicio',
  'Insights': 'Tendencias',
  'Prep Times': 'Tiempos de preparación',
  'Buffers': 'Márgenes',
  'Buffer suggestion': (day, reason, from, to) => `Sugerencia de margen para ${day}: ${reason} (${from}% → ${to}%)`,
  'Waste high reason': pct => `El desperdicio es como el ${pct}% de lo que se vendió; considera bajar el margen.`,
  'Waste low reason': pct => `El desperdicio es muy bajo (como el ${pct}%); si se están acabando, un margen un poco más alto puede ayudar.`,
  'Apply': 'Aplicar',
  'Dismiss': 'Descartar',
  'no data yet': 'sin datos todavía',
  'N weekdays on record': (n, days) => `${n} ${days} ${n === 1 ? 'registrado' : 'registrados'}`,
  'Build-to subline': (date, basis, pct) => `${date} · ${basis} · margen de ${pct}%`,
  'No sold counts for': days => `Todavía no hay ventas registradas para los ${days}. Ve a Ventas para agregarlas.`,
  'Seasonal note': (days, date) => `Ajuste de temporada activo. Los ${days} recientes se ajustan según cómo cambiaron las ventas el año pasado de esas semanas a las semanas alrededor del ${date}.`,
  'Dated note': (n, days, date) => `Basado en ${n === 1 ? 'el último' : `los últimos ${n}`} ${days}, con más peso a los más recientes. El ajuste de temporada empieza cuando haya ventas de alrededor del ${date} (la misma época del año pasado).`,
  'Plain note': days => `Basado en un promedio simple de los ${days} registrados; estas entradas todavía no tienen fecha. Ponles fecha en Ventas para dar más peso a las semanas recientes.`,
  'Salads': 'Ensaladas',
  'Wraps': 'Wraps',
  'Other': 'Otros',
  'items': 'artículos',
  'forecast seasonal': (fc, level, pct) => `pronóstico ${fc} = recientes ${level} × ${pct}% temporada`,
  'forecast plain': (fc, dated, n, days) => `pronóstico ${fc} · ${dated ? 'últimos' : 'promedio de'} ${n} ${days}`,
  'last year N': n => `año pasado ${n}`,
  'avg N wasted': n => `prom. ${n} desperdiciados`,
  'Nothing recorded yet': 'Todavía no hay nada registrado.',
  'Undated': 'Sin fecha',
  'Set the date for this entry': 'Pon la fecha de esta entrada',
  'N items · N total': (n, total) => `${n} ${n === 1 ? 'artículo' : 'artículos'} · ${total} en total`,
  'New': 'Nuevo',
  'What date are these sales from?': '¿De qué fecha son estas ventas?',
  '← Prev day': '← Día anterior',
  'Next day →': 'Día siguiente →',
  'Date field hint': 'Se queda en esta fecha después de cada carga; toca Día siguiente para avanzar. Los archivos con una columna de fecha usan la fecha de cada fila.',
  'History subline': (days, n, noun) => `${days ? `Los ${days}` : 'Todos los días'} · ${n} ${noun === 'waste day' ? (n === 1 ? 'día de desperdicio' : 'días de desperdicio') : (n === 1 ? 'día' : 'días')} · los más nuevos primero`,
  'Add sold counts': 'Agregar ventas',
  'Paste item name + sold count (tab-separated)': 'Pega el nombre del artículo y la cantidad vendida (separados por tabulador)',
  'Sales Mix note': 'Los archivos del reporte Sales Mix van en Gestionar → Data Uploads (la fecha sale del nombre del archivo).',
  'Add this day': 'Agregar este día',
  'Prep waste note': 'El desperdicio viene de la pestaña Desperdicio. Lo del lado frío que se registra ahí (ensaladas, wraps, vasos de fruta, parfaits) aparece aquí por día y alimenta las cantidades a preparar, las sugerencias de margen y las Tendencias. Para corregir una entrada, usa el Resumen de Desperdicio en la pestaña Tableros.',
  'Buffers subline': 'Márgenes de preparación por día · se suman al promedio vendido',
  'Buffers intro': 'Cada día prepara con su propio margen encima del promedio vendido. El sábado empieza en 0% porque sus ventas son menos predecibles; los demás días empiezan en 10%. Cuando un día tiene por lo menos 3 entradas de desperdicio, aparece aquí y en la Hoja de preparación un ajuste sugerido; nada cambia solo hasta que toques Aplicar.',
  'suggest N%': (n, reason) => `sugerencia ${n}%: ${reason}`,
  'Insights subline': 'Tendencias entre días · de cada entrada de Ventas y de la pestaña Desperdicio',
  'Sales over time': 'Ventas con el tiempo',
  'weeks, months & seasons': 'semanas, meses y temporadas',
  'Add dated Sold Counts to see sales trends.': 'Agrega Ventas con fecha para ver las tendencias.',
  'Item': 'Artículo',
  'No dated sales for this item yet.': 'Todavía no hay ventas con fecha para este artículo.',
  'By month': 'Por mes',
  'By season': 'Por temporada',
  'N days': n => `${n} ${n === 1 ? 'día' : 'días'}`,
  'Period note': 'Promedio vendido por día abierto. La Hoja de preparación empieza a ajustar por temporada sola cuando haya un año de ventas con fecha.',
  'Highest volatility': 'Más variación',
  'day-to-day swing in sold counts': 'cambio de un día a otro en las ventas',
  'Volatility empty': 'Agrega por lo menos dos días de Ventas del mismo artículo para ver la variación.',
  'Waste vs. sold': 'Desperdicio contra ventas',
  'share of build thrown away': 'parte de lo preparado que se tiró',
  'Waste ratio empty': 'Registra el desperdicio del lado frío en la pestaña Desperdicio para ver qué artículos se tiran más.',
  'high waste': 'desperdicio alto',
  'low waste': 'desperdicio bajo',
  'watch': 'vigilar',
  'Waste over time': 'Desperdicio con el tiempo',
  'per item': 'por artículo',
  'No items logged yet.': 'Todavía no hay artículos registrados.',
  'No waste logged yet for this item.': 'Todavía no hay desperdicio de este artículo.',
  'Stockouts': 'Agotados',
  'what ran out, and when': 'qué se acabó y cuándo',
  'Day': 'Día',
  'Time': 'Hora',
  'Log stockout': 'Registrar agotado',
  'No stockouts logged yet': 'Todavía no hay agotados registrados; agrega uno arriba cuando algo se acabe a mitad del turno.',
  // ----- Prep Times -----
  'Too fast': secs => `Son menos de ${secs} segundos por artículo; no cuenta. Revisa la cantidad.`,
  'Too slow': 'Son más de 3 horas por artículo; no cuenta.',
  'Who’s prepping?': '¿Quién prepara?',
  'On today': 'Hoy',
  'Others': 'Otros',
  'Someone else…': 'Otra persona…',
  'Timing now': 'Cronometrando ahora',
  'Start a prep timer': 'Iniciar un cronómetro',
  'Their name': 'Su nombre',
  'First and last name': 'Nombre y apellido',
  'How many': 'Cuántos',
  'Start': 'Iniciar',
  'Hide': 'Ocultar',
  'Or type in a time you already did': 'O escribe un tiempo que ya hiciste',
  'Uses the name, item and count above.': 'Usa el nombre, el artículo y la cantidad de arriba.',
  'Min': 'Min',
  'Sec': 'Seg',
  'Add time': 'Agregar tiempo',
  'This week': 'Esta semana',
  'This month': 'Este mes',
  'All time': 'Siempre',
  'N% faster': n => `${n}% más rápido`,
  'N% slower': n => `${n}% más lento`,
  'Overall empty': (n, scope) => `Aparece aquí quien tenga ${n} o más tiempos${scope === 'week' ? ' esta semana' : scope === 'month' ? ' este mes' : ''}.`,
  'each': 'cada uno',
  'N in T': (n, t) => `${n} en ${t}`,
  'Item empty': (item, scope) => `No hay tiempos de ${item}${scope === 'week' ? ' esta semana' : scope === 'month' ? ' este mes' : ' todavía'}.`,
  'Leaderboard': 'Tabla de posiciones',
  'Fastest overall': 'Los más rápidos en general',
  'Overall hint': 'Cada tiempo se compara con el promedio de ese artículo, así cada artículo cuenta igual.',
  'Fastest by item': 'Los más rápidos por artículo',
  'Average per item': (avg, item, n) => `Promedio: ${avg} por ${item} en ${n} ${n === 1 ? 'tiempo' : 'tiempos'}.`,
  'Recent times': n => `Tiempos recientes (${n} registrados)`,
  'Prep times subline': 'Cronometra una tanda de preparación; la tabla compara el tiempo por artículo.',
  'Fastest on record': '¡el más rápido registrado!',
  'First time logged': 'primera vez registrado',
  'Personal best': '¡tu mejor tiempo!',
  'Cancel this timer?': '¿Cancelar este cronómetro? El tiempo no se guardará.',
  'Enter the minutes and seconds it took': 'Escribe los minutos y segundos que tomó',
  'Remove this time from the leaderboard?': '¿Quitar este tiempo de la tabla?',
  'N times': (n, last) => `${n} ${n === 1 ? 'vez' : 'veces'}${last ? ` · la más reciente ${last}` : ''}`,
  // The team's Schedule (team-schedule.js).
  'Schedule': 'Horario',
  'Next week': 'La próxima semana',
  'Find your shifts': 'Busca tus turnos',
  'Find someone’s shifts': 'Busca los turnos de alguien',
  "Who's working": 'Quién trabaja',
  'Not you?': '¿No eres tú?',
  'Off': 'Libre',
  'Office': 'Oficina',
  // Home: the Right Now card (right-now.js).
  'Right now': 'Ahora mismo',
  'First thing': 'Lo primero',
  'Your spot now': 'Tu lugar ahora',
  'Next spot': 'Tu siguiente lugar',
  'Your shift': 'Tu turno',
  'Your break': 'Tu descanso',
  'Waste today': 'Desperdicio de hoy',
  'Open spots now': 'Lugares abiertos ahora',
  'Scheduled with no spot': 'En el horario sin lugar',
  'Breaks due soon': 'Descansos pronto',
  'Food Safety walkthrough': 'Recorrido de seguridad alimentaria',
  'Set Ups filled': 'Configuración llena',
  'Sign in to see your spot': 'Inicia sesión con tu PIN para ver tu lugar y tu descanso',
  'Not on the schedule': 'No estás en el horario',
  // Today on the calendar (right-now.js).
  'Today on the calendar': 'Hoy en el calendario',
  'Next on the calendar': 'Próximo en el calendario',
  'All day': 'Todo el día',
  'Starts at TIME': time => `Empieza a las ${time}`,
  'Happening now until TIME': time => time ? `Ahora, hasta las ${time}` : 'Ahora',
  'Ended at TIME': time => `Terminó a las ${time}`,
  'Also running': 'También',
  'What to know': 'Lo que hay que saber',
  'Open the calendar': 'Abrir el calendario',
  'You are on SPOT until TIME': (spot, time) => `Estás en ${spot} hasta las ${time}`,
  'Your shift starts at TIME': time => `Tu turno empieza a las ${time}`,
  'No spot yet for DP': dp => `Aún no tienes lugar para ${dp}. Pregunta a tu líder.`,
  'Next: SPOT at DP': (spot, dp) => `Siguiente: ${spot} en ${dp}`,
  'Nobody is on SPOT for DP': (spot, dp) => `Nadie está en ${spot} para ${dp}`,
  'Everything is covered for DP': dp => `Todo está cubierto para ${dp}`,
  // The kitchen iPad's card (right-now.js rnKitchenCard; Tim, Oct 23 2026).
  'This iPad': 'Este iPad',
  'Front': 'Frente',
  'Back': 'Atrás',
  'Still to prep': n => `${n} por preparar`,
  'All prep made today': 'Toda la preparación de hoy está hecha',
  'AM breaks left': (n, total) => `Descansos AM pendientes: ${n} de ${total}`,
  'PM breaks left': (n, total) => `Descansos PM pendientes: ${n} de ${total}`,
  'Next break': (who, time) => `Siguiente: ${who} a las ${time}`,
  'Kitchen waste today': 'Desperdicio de cocina hoy',
  'Most wasted': (item, money) => `Más desperdiciado: ${item} ${money}`,
};

// Words of the BOH stations (zone-reset.js bohPositions), lower case. A spot
// is translated only when every word of it is here, so FOH spots stay
// English-only rather than half translated.
const ES_PLACE_WORDS = {
  breader: 'Empanizador', primary: 'Primario', primari: 'Primario', secondary: 'Secundario', secondari: 'Secundario',
  machines: 'Máquinas', fries: 'Papas', prep: 'Preparación', filters: 'Filtros', biscuit: 'Bisquets', eggs: 'Huevos',
  breaks: 'Descansos', floors: 'Pisos', dishes: 'Platos',
};

// The first word(s) of a daypart's name.
const ES_DAYPARTS = {
  'Early Breakfast': 'Desayuno temprano', 'Breakfast': 'Desayuno', 'Lunch': 'Almuerzo', 'Transition': 'Transición',
  'Mid': 'Media tarde', 'Afternoon': 'Tarde', 'Dinner': 'Cena', 'Close': 'Cierre',
};

function esText(en, ...args){
  const t = ES[en];
  return typeof t === 'function' ? t(...args) : (t || '');
}

function esHtml(en, ...args){
  const t = esText(en, ...args);
  return t ? ` <span class="es" lang="es">${escapeHtml(t)}</span>` : '';
}

function esLine(en, ...args){
  const t = esText(en, ...args);
  return t ? `<span class="es es-line" lang="es">${escapeHtml(t)}</span>` : '';
}

// Wraps Spanish that's already worked out (esPlace, esDaypart) the same way.
function esSpan(t, line){
  return t ? `${line ? '' : ' '}<span class="es${line ? ' es-line' : ''}" lang="es">${escapeHtml(t)}</span>` : '';
}

function esPlace(slot){
  const words = String(slot || '').replace(/([A-Za-z])(\d)/g, '$1 $2');
  let whole = true;
  const out = words.replace(/[A-Za-z]+/g, w => {
    const t = ES_PLACE_WORDS[w.toLowerCase()];
    if(!t) whole = false;
    return t || w;
  });
  return whole && /[A-Za-z]/.test(words) ? out : '';
}

// Static page text: an element with data-es="phrase" gets the Spanish on a
// line under it; data-es-placeholder adds it to an input's placeholder (the
// inputs that have one are all Set Ups', so they follow its side).
function esFillPage(root){
  (root || document).querySelectorAll('[data-es]').forEach(el => {
    if(el.querySelector(':scope > .es')) return;
    el.insertAdjacentHTML('beforeend', el.dataset.esInline !== undefined ? esHtml(el.dataset.es) : esLine(el.dataset.es));
  });
  esSyncSides();
}

// FOH stays English-only, to keep its screens uncluttered (Tim): Set Ups and
// Waste, which switch between FOH and BOH, show the Spanish on the BOH side
// only. Each screen's side sets a class on <body> and theme-cfa.css hides
// .es under it (the screen and the sheets it opens). Food Safety and the Prep
// Board are the kitchen's own, so they always keep it.
function esSideIsBoh(screen){
  if(screen === 'setups') return typeof currentPosSection !== 'undefined' && currentPosSection === 'boh';
  return typeof currentSection !== 'undefined' && currentSection === 'boh';
}

function esSyncSides(){
  if(typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('es-off-setups', !esSideIsBoh('setups'));
  document.body.classList.toggle('es-off-waste', !esSideIsBoh('waste'));
  document.querySelectorAll('[data-es-placeholder]').forEach(el => {
    if(el.dataset.esEn === undefined) el.dataset.esEn = el.placeholder;
    const t = esText(el.dataset.esPlaceholder);
    el.placeholder = t && esSideIsBoh('setups') ? `${el.dataset.esEn} / ${t}` : el.dataset.esEn;
  });
}

// "Monday" or "Mon" → "lunes" / "lun"; plural for "Mondays" ("sábados").
const ES_WEEKDAYS = {
  Monday: ['lunes', 'lunes'], Tuesday: ['martes', 'martes'], Wednesday: ['miércoles', 'miércoles'], Thursday: ['jueves', 'jueves'],
  Friday: ['viernes', 'viernes'], Saturday: ['sábado', 'sábados'], Sunday: ['domingo', 'domingos'],
};
function esWeekday(en, plural){
  const full = Object.keys(ES_WEEKDAYS).find(d => d === en || d.slice(0, 3) === en);
  if(!full) return '';
  return full === en ? ES_WEEKDAYS[full][plural ? 1 : 0] : ES_WEEKDAYS[full][0].slice(0, 3);
}

// "2026-10-05" → "lun, 5 de oct de 2026".
function esDate(iso){
  const d = new Date(String(iso) + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-MX', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
}

function esDaypart(name){
  const base = String(name || '').split(' (')[0].trim();
  return ES_DAYPARTS[base] || '';
}

// Last, once everything above exists: the page's own text.
if(typeof document !== 'undefined' && document.querySelectorAll){
  esFillPage();
  // Not while the initials box is open (it opens on load when none are set).
  if(typeof renderInitialsBadge === 'function' && !document.querySelector('#initialsBadge input')) renderInitialsBadge();
}

(() => {
  'use strict';

  // ——— Configuración ———
  const FECHA_INICIO = '2026-10-04';      // Fecha del «Día 1» (hora de Madrid), en formato AAAA-MM-DD
  const ZONA_HORARIA = 'Europe/Madrid';
  const CLAVE_ESTADO = 'otrora:estado';
  const CLAVE_TEMA = 'almanaque:tema'; // común a Almanaque y a todos sus juegos
  const CLAVE_BIENVENIDA = 'otrora:bienvenida';
  const ACIERTO = '⏳';
  const FALLO = '⌛';
  const LETRAS = ['A', 'B', 'C', 'D', 'E'];
  const DURACION_PORTADA = 1500;          // ms que se ve la portada al abrir

  const $ = (id) => document.getElementById(id);

  // ——— Almacenamiento (siempre protegido) ———
  function leer(clave) {
    try {
      const valor = localStorage.getItem(clave);
      return valor ? JSON.parse(valor) : null;
    } catch (e) {
      return null;
    }
  }
  function escribir(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
  }

  // ——— Fechas en hora de Madrid ———
  function ahoraEnMadrid() {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA_HORARIA, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date());
    const p = {};
    partes.forEach(({ type, value }) => { p[type] = Number(value); });
    return { anio: p.year, mes: p.month, dia: p.day, hora: p.hour % 24, minuto: p.minute, segundo: p.second };
  }

  function diaDeHoy() {
    const a = ahoraEnMadrid();
    const [y, m, d] = FECHA_INICIO.split('-').map(Number);
    const diferencia = Date.UTC(a.anio, a.mes - 1, a.dia) - Date.UTC(y, m - 1, d);
    return Math.max(1, Math.floor(diferencia / 86400000) + 1);
  }

  function segundosHastaManana() {
    const a = ahoraEnMadrid();
    return 86400 - (a.hora * 3600 + a.minuto * 60 + a.segundo);
  }

  function diaDePrueba() {
    try {
      const valor = new URLSearchParams(location.search).get('dia');
      const n = Number.parseInt(valor, 10);
      return Number.isInteger(n) && n >= 1 ? n : null;
    } catch (e) {
      return null;
    }
  }

  // ——— Barajado determinista: el mismo orden para todos cada día ———
  function semilla(texto) {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function aleatorio(s) {
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function barajar(lista, clave) {
    const azar = aleatorio(semilla(clave));
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  const mayuscula = (t) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
  const conPunto = (t) => /[.!?»]$/.test(t) ? t : t + '.';

  // ——— Estado ———
  const estadoVacio = () => ({
    partida: null, // { dia, respuestas: [{ elegida, acierto }] }
    stats: { partidas: 0, aciertos: 0, racha: 0, mejorRacha: 0, ultimoDia: null }
  });

  let estado;
  let dia;
  let modoPrueba = false;
  let palabras = [];
  let indice = 0;
  let temporizador = null;

  function guardar() {
    if (!modoPrueba) escribir(CLAVE_ESTADO, estado);
  }

  function cargarEstado() {
    const guardado = leer(CLAVE_ESTADO);
    const base = estadoVacio();
    if (!guardado || typeof guardado !== 'object') return base;
    return {
      partida: guardado.partida && Array.isArray(guardado.partida.respuestas) ? guardado.partida : null,
      stats: Object.assign(base.stats, guardado.stats || {})
    };
  }

  function rachaVisible() {
    const { racha, ultimoDia } = estado.stats;
    const hoy = diaDeHoy();
    return ultimoDia === hoy || ultimoDia === hoy - 1 ? racha : 0;
  }

  const respuestas = () => estado.partida.respuestas;
  const partidaTerminada = () => respuestas().length >= palabras.length;

  // Con la partida de hoy terminada, la hoja de Otrora sale como «Hecho» en Almanaque,
  // con los aciertos del día y la racha (ver volver-almanaque.js).
  function avisarAlmanaque() {
    if (modoPrueba || !partidaTerminada()) return;
    const avisar = () => window.almanaqueHecho && window.almanaqueHecho({
      aciertos: respuestas().filter((r) => r && r.acierto).length,
      total: palabras.length,
      racha: rachaVisible()
    });
    // app.js va antes que volver-almanaque.js (los dos con defer): si aún no existe,
    // se espera a DOMContentLoaded, que llega después de todos los scripts con defer.
    if (window.almanaqueHecho) avisar();
    else document.addEventListener('DOMContentLoaded', avisar, { once: true });
  }

  function registrarFinal() {
    if (modoPrueba) return;
    const s = estado.stats;
    if (s.ultimoDia === dia) return;
    s.partidas += 1;
    s.aciertos += respuestas().filter((r) => r && r.acierto).length;
    s.racha = s.ultimoDia === dia - 1 ? s.racha + 1 : 1;
    s.mejorRacha = Math.max(s.mejorRacha, s.racha);
    s.ultimoDia = dia;
  }

  // ——— Pantallas ———
  function mostrar(id, foco) {
    ['pantalla-juego', 'pantalla-final'].forEach((p) => { $(p).hidden = p !== id; });
    window.scrollTo(0, 0);
    if (foco) $(foco).focus({ preventScroll: true });
  }

  function pintarProgreso() {
    const lista = $('progreso');
    lista.innerHTML = '';
    palabras.forEach((_, i) => {
      const li = document.createElement('li');
      const r = respuestas()[i];
      if (r) li.className = r.acierto ? 'acierto' : 'fallo';
      else if (i === indice) li.className = 'actual';
      li.setAttribute('aria-label', `Palabra ${i + 1}: ${r ? (r.acierto ? 'acierto' : 'fallo') : 'pendiente'}`);
      lista.appendChild(li);
    });
  }

  function mostrarPregunta(i) {
    indice = i;
    const p = palabras[i];
    $('numero-palabra').textContent = `${i + 1} de ${palabras.length}`;
    $('palabra').textContent = p.palabra;
    $('hoy').textContent = p.hoy;

    const opciones = barajar([p.otrora, ...p.distractores], `${dia}|${p.orden}|${p.palabra}`);
    const contenedor = $('opciones');
    contenedor.innerHTML = '';
    contenedor.classList.remove('respondida');
    opciones.forEach((texto, n) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'opcion';
      boton.dataset.valor = texto;
      boton.innerHTML = `<span class="opcion-letra" aria-hidden="true">${LETRAS[n]}</span><span></span>`;
      boton.lastChild.textContent = mayuscula(texto);
      boton.addEventListener('click', () => responder(texto));
      contenedor.appendChild(boton);
    });

    $('ficha').classList.remove('abierta');
    $('boton-siguiente').textContent = i === palabras.length - 1 ? 'Ver resultado' : 'Siguiente';
    pintarProgreso();
    mostrar('pantalla-juego', 'palabra');

    const previa = respuestas()[i];
    if (previa) revelar(previa, false);
  }

  function responder(elegida) {
    if (respuestas()[indice]) return;
    const r = { elegida, acierto: elegida === palabras[indice].otrora };
    respuestas()[indice] = r;
    if (partidaTerminada()) registrarFinal();
    guardar();
    avisarAlmanaque();
    pintarProgreso();
    revelar(r, true);
  }

  function revelar(r, animar) {
    const p = palabras[indice];
    const contenedor = $('opciones');
    contenedor.classList.add('respondida');
    contenedor.querySelectorAll('.opcion').forEach((b) => {
      b.disabled = true;
      if (b.dataset.valor === p.otrora) b.classList.add('correcta');
      else if (b.dataset.valor === r.elegida) b.classList.add('incorrecta');
    });

    const veredicto = $('veredicto');
    veredicto.textContent = r.acierto ? 'Acierto' : 'No era esa';
    veredicto.className = 'veredicto' + (r.acierto ? '' : ' fallo');
    $('ficha-lema').textContent = p.palabra;
    $('ficha-def').textContent = conPunto(mayuscula(p.otrora));
    $('ficha-explicacion').textContent = p.explicacion;
    $('ficha-epoca').textContent = p.epoca;
    $('ficha-fuente').textContent = p.fuente;

    const ficha = $('ficha');
    ficha.classList.add('abierta');
    if (animar) {
      setTimeout(() => {
        const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        $('boton-siguiente').scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'end' });
      }, 250);
    }
  }

  function siguiente() {
    if (indice < palabras.length - 1) mostrarPregunta(indice + 1);
    else mostrarFinal();
  }

  // ——— Final ———
  function textoResultado() {
    return respuestas().map((r) => (r.acierto ? ACIERTO : FALLO)).join('');
  }

  function mostrarFinal() {
    const aciertos = respuestas().filter((r) => r && r.acierto).length;
    const total = palabras.length;
    const titulos = ['Las palabras guardan bien su pasado', 'Algo has rescatado del olvido', 'Buen oído para lo antiguo', 'Pleno de erudito'];
    $('final-dia').textContent = `Día ${dia}`;
    $('titulo-final').textContent = titulos[Math.round((aciertos / total) * 3)];
    const relojes = $('relojes');
    relojes.innerHTML = '';
    respuestas().forEach((r) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '49 41 22 38');
      svg.setAttribute('class', r && r.acierto ? 'reloj acierto' : 'reloj fallo');
      svg.innerHTML = '<path d="M51,43 H69 C69,52 61,56 61,60 C61,64 69,68 69,77 H51 C51,68 59,64 59,60 C59,56 51,52 51,43 Z"/>';
      relojes.appendChild(svg);
    });
    relojes.setAttribute('aria-label', textoResultado());
    $('puntuacion').textContent = `${aciertos} de ${total} aciertos`;

    const repaso = $('repaso');
    repaso.innerHTML = '';
    palabras.forEach((p, i) => {
      const li = document.createElement('li');
      const acierto = respuestas()[i] && respuestas()[i].acierto;
      li.innerHTML = '<span class="marca" aria-hidden="true"></span><span><b></b> · <span class="ant"></span></span>';
      li.querySelector('.marca').classList.toggle('fallo', !acierto);
      li.querySelector('b').textContent = p.palabra;
      li.querySelector('.ant').textContent = p.otrora;
      repaso.appendChild(li);
    });

    const s = estado.stats;
    $('est-racha').textContent = rachaVisible();
    $('est-mejor').textContent = s.mejorRacha;
    $('est-partidas').textContent = s.partidas;
    $('est-aciertos').textContent = s.aciertos;
    $('boton-repetir').hidden = !modoPrueba;

    mostrar('pantalla-final', 'titulo-final');
    arrancarCuentaAtras();
  }

  function arrancarCuentaAtras() {
    clearInterval(temporizador);
    const pintar = () => {
      const resto = segundosHastaManana();
      if (!modoPrueba && resto >= 86398) { location.reload(); return; } // ha cambiado el día
      const h = String(Math.floor(resto / 3600)).padStart(2, '0');
      const m = String(Math.floor((resto % 3600) / 60)).padStart(2, '0');
      const s = String(resto % 60).padStart(2, '0');
      $('cuenta-atras').textContent = `${h}:${m}:${s}`;
    };
    pintar();
    temporizador = setInterval(pintar, 1000);
  }

  async function compartir() {
    const aciertos = respuestas().filter((r) => r && r.acierto).length;
    const url = location.origin + location.pathname;
    const texto = `Otrora · Día ${dia} · ${aciertos}/${palabras.length} ${textoResultado()}\n${url}`;
    let copiado = false;
    try {
      await navigator.clipboard.writeText(texto);
      copiado = true;
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { copiado = document.execCommand('copy'); } catch (err) { copiado = false; }
      area.remove();
    }
    avisar(copiado ? 'Resultado copiado' : 'No se pudo copiar el resultado');
  }

  let avisoTimeout;
  function avisar(texto) {
    const t = $('toast');
    t.textContent = texto;
    t.classList.add('visible');
    clearTimeout(avisoTimeout);
    avisoTimeout = setTimeout(() => t.classList.remove('visible'), 2200);
  }

  // ——— Tema claro/oscuro ———
  function temaActual() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  function actualizarColorBarra() {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim();
    document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
  }
  function alternarTema() {
    const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch (e) { /* sin almacenamiento */ }
    actualizarColorBarra();
  }

  // ——— Bienvenida ———
  function abrirBienvenida() {
    const hoja = $('bienvenida');
    if (hoja.open) return;
    hoja.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => hoja.classList.add('abierta')));
  }
  function cerrarBienvenida() {
    const hoja = $('bienvenida');
    if (!hoja.open) return;
    hoja.classList.remove('abierta');
    escribir(CLAVE_BIENVENIDA, true);
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => hoja.close(), reducido ? 0 : 480);
  }
  function prepararBienvenida() {
    const hoja = $('bienvenida');
    $('boton-ayuda').addEventListener('click', abrirBienvenida);
    $('boton-empezar').addEventListener('click', cerrarBienvenida);
    hoja.addEventListener('cancel', (e) => { e.preventDefault(); cerrarBienvenida(); });
    hoja.addEventListener('click', (e) => { // toque fuera de la hoja, sobre el fondo oscurecido
      if (e.target === hoja && e.clientY < hoja.getBoundingClientRect().top) cerrarBienvenida();
    });
  }

  // ——— Arranque ———
  function empezar() {
    if (partidaTerminada()) {
      mostrarFinal();
    } else {
      const primeraPendiente = palabras.findIndex((_, i) => !respuestas()[i]);
      mostrarPregunta(primeraPendiente === -1 ? 0 : primeraPendiente);
    }
  }

  // La portada se ve un instante (contado desde que empezó a cargar la página) y se desvanece.
  function esperarPortada() {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const espera = Math.max(0, (reducido ? 600 : DURACION_PORTADA) - performance.now());
    return new Promise((resolver) => setTimeout(resolver, espera));
  }
  function cerrarPortada() {
    $('portada').classList.add('saliendo');
  }

  function prepararDia() {
    estado = cargarEstado();
    if (modoPrueba) estado.partida = null; // en prueba se juega en memoria, sin tocar lo guardado
    if (!estado.partida || estado.partida.dia !== dia) {
      estado.partida = { dia, respuestas: [] };
      guardar();
    }
  }

  async function iniciar() {
    $('boton-tema').addEventListener('click', alternarTema);
    prepararBienvenida();
    actualizarColorBarra();

    const prueba = diaDePrueba();
    modoPrueba = prueba !== null;
    dia = modoPrueba ? prueba : diaDeHoy();

    $('juego-dia').textContent = `Día ${dia}`;
    if (modoPrueba) {
      const aviso = $('aviso-prueba');
      aviso.innerHTML = '<strong>Modo prueba</strong> · no cuenta para tus estadísticas';
      aviso.hidden = false;
    }

    let todas;
    try {
      const respuesta = await fetch('data/palabras.json', { cache: 'no-cache' });
      if (!respuesta.ok) throw new Error(respuesta.status);
      todas = await respuesta.json();
    } catch (e) {
      $('error-carga').textContent = 'No se han podido cargar las palabras. Comprueba la conexión y vuelve a intentarlo.';
      $('error-carga').hidden = false;
      return;
    }

    const diasConContenido = Math.max(...todas.map((p) => p.dia));
    const diaContenido = ((dia - 1) % diasConContenido) + 1;
    palabras = todas.filter((p) => p.dia === diaContenido).sort((a, b) => a.orden - b.orden);

    prepararDia();

    $('boton-siguiente').addEventListener('click', siguiente);
    $('boton-compartir').addEventListener('click', compartir);
    $('boton-repetir').addEventListener('click', () => {
      estado.partida = { dia, respuestas: [] };
      mostrarPregunta(0);
    });

    avisarAlmanaque(); // por si se abre con la partida de hoy ya terminada
    await esperarPortada();
    empezar();
    cerrarPortada();
    if (!leer(CLAVE_BIENVENIDA)) setTimeout(abrirBienvenida, 350);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin conexión offline */ });
    });
  }

  iniciar();
})();

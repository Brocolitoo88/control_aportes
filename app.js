// ============================================
// CONTROL DE APORTES QUINCENALES - FRONTEND
// ============================================

// URL del Web App de Google Apps Script.
// Reemplazar por la URL obtenida al implementar el proyecto (ver instrucciones).
const API_URL = "https://script.google.com/macros/s/AKfycbwd8HZLZlEtbGUteMAUI8f-UZLNMpDTuyAuLeLawd5txBhXmFLlh2LmIYYXhdK7BCms/exec";

// Estado en memoria de la aplicación
let integrantes = [];
let pagos = [];
let configuracion = { valorAporte: 0, diaQuincena1: 15, diaQuincena2: 30 };

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
               "Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

let filtroMes = new Date().getMonth(); // índice 0-11
let filtroAnio = new Date().getFullYear();
let idPagoSeleccionado = null;

// --------------------------------------------
// Inicialización
// --------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  inicializarSelectores();
  cargarDatosIniciales();

  document.getElementById("formPago").addEventListener("submit", manejarRegistroPago);
  document.getElementById("btnMesAnterior").addEventListener("click", () => cambiarMes(-1));
  document.getElementById("btnMesSiguiente").addEventListener("click", () => cambiarMes(1));
  document.getElementById("selectMes").addEventListener("change", manejarCambioFiltro);
  document.getElementById("selectAnio").addEventListener("change", manejarCambioFiltro);

  document.getElementById("filtroHistIntegrante").addEventListener("change", renderizarHistorial);
  document.getElementById("filtroHistMes").addEventListener("change", renderizarHistorial);
  document.getElementById("filtroHistAnio").addEventListener("change", renderizarHistorial);
  document.getElementById("filtroHistQuincena").addEventListener("change", renderizarHistorial);

  document.getElementById("btnConfirmarEliminar").addEventListener("click", confirmarEliminarPago);
  document.getElementById("btnCancelarEliminar").addEventListener("click", cerrarModalEliminar);
  document.getElementById("formEditar").addEventListener("submit", guardarEdicionPago);
  document.getElementById("btnCancelarEditar").addEventListener("click", cerrarModalEditar);
});

// --------------------------------------------
// Cargar integrantes, pagos y configuración desde el backend
// --------------------------------------------
async function cargarDatosIniciales() {
  mostrarCargando(true);
  try {
    const [respIntegrantes, respPagos, respConfig] = await Promise.all([
      llamarApiGet("obtenerIntegrantes"),
      llamarApiGet("obtenerPagos"),
      llamarApiGet("obtenerConfiguracion")
    ]);

    if (respIntegrantes.success) integrantes = respIntegrantes.data;
    if (respPagos.success) pagos = respPagos.data;
    if (respConfig.success) configuracion = respConfig.data;

    llenarSelectIntegrantes();
    actualizarValorAporteVisible();
    renderizarTablaPrincipal();
    renderizarResumen();
    llenarFiltroHistorialIntegrantes();
    renderizarHistorial();
  } catch (error) {
    mostrarMensaje("No se pudo conectar con el servidor. Intente nuevamente.", "error");
  } finally {
    mostrarCargando(false);
  }
}

// --------------------------------------------
// Comunicación con la API (Google Apps Script)
// --------------------------------------------
async function llamarApiGet(accion, parametros = {}) {
  const params = new URLSearchParams({ action: accion, ...parametros });
  const respuesta = await fetch(`${API_URL}?${params.toString()}`);
  return respuesta.json();
}

async function llamarApiPost(datos) {
  // Se envía como texto plano para evitar problemas de CORS con Apps Script.
  const respuesta = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(datos)
  });
  return respuesta.json();
}

// --------------------------------------------
// Selectores de mes / año
// --------------------------------------------
function inicializarSelectores() {
  const selectMes = document.getElementById("selectMes");
  const selectAnio = document.getElementById("selectAnio");
  const filtroHistMes = document.getElementById("filtroHistMes");
  const filtroHistAnio = document.getElementById("filtroHistAnio");
  const filtroHistQuincena = document.getElementById("filtroHistQuincena");

  MESES.forEach((mes, indice) => {
    selectMes.add(new Option(mes, indice));
    filtroHistMes.add(new Option(mes, indice));
  });
  filtroHistMes.add(new Option("Todos", "todos"));
  filtroHistMes.value = "todos";

  const anioActual = new Date().getFullYear();
  for (let a = anioActual - 2; a <= anioActual + 2; a++) {
    selectAnio.add(new Option(a, a));
    filtroHistAnio.add(new Option(a, a));
  }
  filtroHistAnio.add(new Option("Todos", "todos"));
  filtroHistAnio.value = "todos";

  filtroHistQuincena.add(new Option("Todas", "todos"));
  filtroHistQuincena.add(new Option("15", "15"));
  filtroHistQuincena.add(new Option("30", "30"));

  selectMes.value = filtroMes;
  selectAnio.value = filtroAnio;
}

function manejarCambioFiltro() {
  filtroMes = Number(document.getElementById("selectMes").value);
  filtroAnio = Number(document.getElementById("selectAnio").value);
  renderizarTablaPrincipal();
  renderizarResumen();
}

function cambiarMes(delta) {
  filtroMes += delta;
  if (filtroMes < 0) { filtroMes = 11; filtroAnio--; }
  if (filtroMes > 11) { filtroMes = 0; filtroAnio++; }
  document.getElementById("selectMes").value = filtroMes;
  document.getElementById("selectAnio").value = filtroAnio;
  renderizarTablaPrincipal();
  renderizarResumen();
}

// --------------------------------------------
// Formulario de registro de pago
// --------------------------------------------
function llenarSelectIntegrantes() {
  const select = document.getElementById("selectIntegrante");
  select.innerHTML = "";
  integrantes
    .filter(i => esActivo(i.estado))
    .forEach(i => select.add(new Option(i.nombre, i.id)));
}

// Compara el estado ignorando espacios y mayúsculas/minúsculas
// (evita fallos si en la hoja quedó "Activo ", " activo", "ACTIVO", etc.)
function esActivo(estado) {
  return String(estado || "").trim().toLowerCase() === "activo";
}

function actualizarValorAporteVisible() {
  // El valor de Configuracion se usa solo como sugerencia inicial;
  // el usuario puede cambiarlo porque no todos los integrantes aportan lo mismo.
  document.getElementById("inputValorAporte").value = configuracion.valorAporte;
}

async function manejarRegistroPago(evento) {
  evento.preventDefault();

  const idIntegrante = document.getElementById("selectIntegrante").value;
  const fechaPagoInput = document.getElementById("inputFechaPago").value;
  const quincena = document.getElementById("selectQuincena").value;

  // 1. Verificar que exista el integrante
  if (!idIntegrante) {
    mostrarMensaje("Debe seleccionar un integrante.", "error");
    return;
  }
  // 2. Verificar que exista la fecha
  if (!fechaPagoInput) {
    mostrarMensaje("Debe seleccionar la fecha del pago.", "error");
    return;
  }
  // 3. Verificar que se haya seleccionado la quincena
  if (!quincena) {
    mostrarMensaje("Debe seleccionar la quincena.", "error");
    return;
  }
  // 4. Verificar que el valor sea válido (cada integrante puede aportar un monto distinto)
  const valor = Number(document.getElementById("inputValorAporte").value);
  if (!valor || valor <= 0) {
    mostrarMensaje("Debe ingresar un valor de aporte válido.", "error");
    return;
  }
  // 6. Verificar que la quincena sea 15 o 30
  if (Number(quincena) !== 15 && Number(quincena) !== 30) {
    mostrarMensaje("La quincena debe ser 15 o 30.", "error");
    return;
  }

  // 5. La fecha ingresada define el mes/año del pago (evita inconsistencias
  //    cuando el usuario está viendo un mes distinto en la tabla principal).
  const [anio, mesNum, dia] = fechaPagoInput.split("-").map(Number);
  const mesTexto = MESES[mesNum - 1];
  const fechaFormateada = `${String(dia).padStart(2, "0")}/${String(mesNum).padStart(2, "0")}/${anio}`;

  // 7. Evitar pagos duplicados (validación local; el servidor también la aplica)
  const yaExiste = pagos.some(p =>
    String(p.idIntegrante) === String(idIntegrante) &&
    p.mes === mesTexto &&
    Number(p.anio) === anio &&
    Number(p.quincena) === Number(quincena)
  );
  if (yaExiste) {
    mostrarMensaje("Este integrante ya tiene registrado el pago de esta quincena.", "error");
    return;
  }

  mostrarCargando(true);
  try {
    const resultado = await llamarApiPost({
      action: "registrarPago",
      idIntegrante,
      fechaPago: fechaFormateada,
      quincena,
      mes: mesTexto,
      anio,
      valor
    });

    if (resultado.success) {
      mostrarMensaje(resultado.message, "exito");
      document.getElementById("formPago").reset();
      await cargarDatosIniciales();
    } else {
      mostrarMensaje(resultado.message, "error");
    }
  } catch (error) {
    mostrarMensaje("No se pudo conectar con el servidor. Intente nuevamente.", "error");
  } finally {
    mostrarCargando(false);
  }
}

// --------------------------------------------
// Tabla principal (estado de pagos por integrante)
// --------------------------------------------
function renderizarTablaPrincipal() {
  const mesTexto = MESES[filtroMes];
  const encabezado = document.getElementById("encabezadoTabla");
  const cuerpo = document.getElementById("cuerpoTabla");

  encabezado.innerHTML = `<th>Integrante</th><th>15 de ${mesTexto}</th><th>30 de ${mesTexto}</th>`;
  cuerpo.innerHTML = "";

  const activos = integrantes.filter(i => esActivo(i.estado));

  activos.forEach(integrante => {
    const pago15 = buscarPago(integrante.id, mesTexto, filtroAnio, 15);
    const pago30 = buscarPago(integrante.id, mesTexto, filtroAnio, 30);

    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${integrante.nombre}</td>
      <td class="${pago15 ? 'pagado' : 'pendiente'}">${pago15 ? '✓ Pagó' : 'Pendiente'}</td>
      <td class="${pago30 ? 'pagado' : 'pendiente'}">${pago30 ? '✓ Pagó' : 'Pendiente'}</td>
    `;
    cuerpo.appendChild(fila);
  });

  if (activos.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="3">No hay integrantes activos registrados.</td></tr>`;
  }
}

function buscarPago(idIntegrante, mesTexto, anio, quincena) {
  return pagos.find(p =>
    String(p.idIntegrante) === String(idIntegrante) &&
    p.mes === mesTexto &&
    Number(p.anio) === Number(anio) &&
    Number(p.quincena) === Number(quincena)
  );
}

// --------------------------------------------
// Tarjetas de resumen
// --------------------------------------------
function renderizarResumen() {
  const mesTexto = MESES[filtroMes];
  const activos = integrantes.filter(i => esActivo(i.estado));
  const totalIntegrantes = activos.length;

  const pagosDelMes = pagos.filter(p => p.mes === mesTexto && Number(p.anio) === Number(filtroAnio));

  // Un integrante cuenta como "pagó" si registró al menos una quincena del mes.
  const idsQuePagaron = new Set(pagosDelMes.map(p => String(p.idIntegrante)));
  const pagaron = idsQuePagaron.size;
  const pendientes = Math.max(totalIntegrantes - pagaron, 0);
  const recaudado = pagosDelMes.reduce((suma, p) => suma + Number(p.valor), 0);

  document.getElementById("totalIntegrantes").textContent = totalIntegrantes;
  document.getElementById("totalPagaron").textContent = pagaron;
  document.getElementById("totalPendientes").textContent = pendientes;
  document.getElementById("totalRecaudado").textContent = formatearMoneda(recaudado);
}

// --------------------------------------------
// Historial de pagos
// --------------------------------------------
function llenarFiltroHistorialIntegrantes() {
  const select = document.getElementById("filtroHistIntegrante");
  select.innerHTML = "";
  select.add(new Option("Todos", "todos"));
  integrantes.forEach(i => select.add(new Option(i.nombre, i.id)));
}

function renderizarHistorial() {
  const idIntegrante = document.getElementById("filtroHistIntegrante").value;
  const mes = document.getElementById("filtroHistMes").value;
  const anio = document.getElementById("filtroHistAnio").value;
  const quincena = document.getElementById("filtroHistQuincena").value;

  let filtrados = [...pagos];

  if (idIntegrante && idIntegrante !== "todos") {
    filtrados = filtrados.filter(p => String(p.idIntegrante) === String(idIntegrante));
  }
  if (mes && mes !== "todos") {
    filtrados = filtrados.filter(p => p.mes === MESES[Number(mes)]);
  }
  if (anio && anio !== "todos") {
    filtrados = filtrados.filter(p => Number(p.anio) === Number(anio));
  }
  if (quincena && quincena !== "todos") {
    filtrados = filtrados.filter(p => Number(p.quincena) === Number(quincena));
  }

  const cuerpo = document.getElementById("cuerpoHistorial");
  cuerpo.innerHTML = "";

  if (filtrados.length === 0) {
    cuerpo.innerHTML = `<tr><td colspan="6">No hay pagos que coincidan con el filtro.</td></tr>`;
    return;
  }

  filtrados.forEach(pago => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${pago.integrante}</td>
      <td>${pago.fechaPago}</td>
      <td>${pago.quincena}</td>
      <td>${pago.mes} ${pago.anio}</td>
      <td>${formatearMoneda(pago.valor)}</td>
      <td>
        <button class="btn-pequeno" onclick="abrirModalEditar('${pago.idPago}')">Editar</button>
        <button class="btn-pequeno btn-peligro" onclick="abrirModalEliminar('${pago.idPago}')">Eliminar</button>
      </td>
    `;
    cuerpo.appendChild(fila);
  });
}

// --------------------------------------------
// Editar pago
// --------------------------------------------
function abrirModalEditar(idPago) {
  const pago = pagos.find(p => String(p.idPago) === String(idPago));
  if (!pago) return;

  idPagoSeleccionado = idPago;

  document.getElementById("editarIntegrante").value = pago.integrante;
  document.getElementById("editarQuincena").value = pago.quincena;
  document.getElementById("editarValor").value = pago.valor;

  // Convertir fecha dd/MM/yyyy (guardada en Sheets) a yyyy-MM-dd (formato del input date)
  const [dia, mesFecha, anioFecha] = pago.fechaPago.split("/");
  document.getElementById("editarFecha").value = `${anioFecha}-${mesFecha}-${dia}`;

  document.getElementById("modalEditar").classList.remove("oculto");
}

function cerrarModalEditar() {
  document.getElementById("modalEditar").classList.add("oculto");
  idPagoSeleccionado = null;
}

async function guardarEdicionPago(evento) {
  evento.preventDefault();

  const fechaInput = document.getElementById("editarFecha").value;
  const [anio, mes, dia] = fechaInput.split("-");
  const fechaFormateada = `${dia}/${mes}/${anio}`;

  const datos = {
    action: "editarPago",
    idPago: idPagoSeleccionado,
    fechaPago: fechaFormateada,
    quincena: document.getElementById("editarQuincena").value,
    valor: document.getElementById("editarValor").value
  };

  mostrarCargando(true);
  try {
    const resultado = await llamarApiPost(datos);
    if (resultado.success) {
      mostrarMensaje(resultado.message, "exito");
      cerrarModalEditar();
      await cargarDatosIniciales();
    } else {
      mostrarMensaje(resultado.message, "error");
    }
  } catch (error) {
    mostrarMensaje("No se pudo conectar con el servidor. Intente nuevamente.", "error");
  } finally {
    mostrarCargando(false);
  }
}

// --------------------------------------------
// Eliminar pago
// --------------------------------------------
function abrirModalEliminar(idPago) {
  idPagoSeleccionado = idPago;
  document.getElementById("modalEliminar").classList.remove("oculto");
}

function cerrarModalEliminar() {
  document.getElementById("modalEliminar").classList.add("oculto");
  idPagoSeleccionado = null;
}

async function confirmarEliminarPago() {
  if (!idPagoSeleccionado) return;

  mostrarCargando(true);
  try {
    const resultado = await llamarApiPost({ action: "eliminarPago", idPago: idPagoSeleccionado });
    if (resultado.success) {
      mostrarMensaje(resultado.message, "exito");
      cerrarModalEliminar();
      await cargarDatosIniciales();
    } else {
      mostrarMensaje(resultado.message, "error");
    }
  } catch (error) {
    mostrarMensaje("No se pudo conectar con el servidor. Intente nuevamente.", "error");
  } finally {
    mostrarCargando(false);
  }
}

// --------------------------------------------
// Utilidades generales
// --------------------------------------------
function formatearMoneda(valor) {
  return "$" + Number(valor || 0).toLocaleString("es-CO");
}

function mostrarMensaje(texto, tipo) {
  const contenedor = document.getElementById("mensajes");
  const mensaje = document.createElement("div");
  mensaje.className = `mensaje mensaje-${tipo}`;
  mensaje.textContent = texto;
  contenedor.appendChild(mensaje);

  setTimeout(() => mensaje.remove(), 4000);
}

function mostrarCargando(mostrar) {
  document.getElementById("cargando").classList.toggle("oculto", !mostrar);
}

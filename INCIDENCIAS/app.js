// Configuración de conexión limpia
const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co".trim();
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0".trim();

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Almacenes de memoria global
let baseDatosIncidencias = [];
let ordenAtrasoAsc = false;
let ordenPerdidaAsc = false;
let graficoTopProveedores = null;

// Referencias del DOM
const tableBody = document.getElementById('table-body');
const tableCounter = document.getElementById('table-counter');
const statusMessage = document.getElementById('status-message');

document.addEventListener('DOMContentLoaded', () => {
    inicializarEventosMenu();
    conectarSupabaseMasivo();

    // Cierre global al hacer click fuera de contenedores interactivos
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.header-cell') && !e.target.closest('.dropdown-container')) {
            cerrarTodosLosPopovers();
        }
    });
});

function inicializarEventosMenu() {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebarMenu');

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
        });
    }
}

// ALGORITMO RECURSIVO PARA TRAER MÁS DE 1000 DATOS (PAGINACIÓN REVERSA)
async function conectarSupabaseMasivo() {
    let todosLosDatos = [];
    let desde = 0;
    const limiteBloque = 1000;
    let cargando = true;

    try {
        while (cargando) {
            const { data, error } = await _supabase
                .from('incidencias_proveedores')
                .select('*')
                .range(desde, desde + limiteBloque - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                todosLosDatos = todosLosDatos.concat(data);
                desde += limiteBloque;
                // Si trajo menos del bloque solicitado, significa que llegamos al final del set de datos
                if (data.length < limiteBloque) {
                    cargando = false;
                }
            } else {
                cargando = false;
            }
        }

        baseDatosIncidencias = todosLosDatos;
        generarFiltrosDinamicos();
        ejecutarFiltrosInternos();

    } catch (err) {
        console.error("Error Supabase:", err.message);
        if (statusMessage) {
            statusMessage.textContent = "Error al enlazar datos de la base de datos: " + err.message;
        }
    }
}

// OBTENER NÚMERO DE SEMANA DEL AÑO A PARTIR DE UNA FECHA
function obtenerNumeroSemana(fechaStr) {
    if (!fechaStr) return null;
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - startOfYear) / 86400000) + 1) / 7);
    return weekNo;
}

function generarFiltrosDinamicos() {
    const aniosSet = new Set();
    const mesesSet = new Set();
    const semanasSet = new Set();
    const tiposSet = new Set();
    const motivosSet = new Set();

    const mesesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    baseDatosIncidencias.forEach(item => {
        if (item.fecha) {
            const partes = item.fecha.split('T')[0].split('-');
            const anio = partes[0];
            const mesNum = partes[1];
            if (anio) aniosSet.add(anio);
            if (mesNum) mesesSet.add(mesNum);

            const sem = obtenerNumeroSemana(item.fecha);
            if (sem !== null) semanasSet.add(sem);
        }
        if (item.tipo) tiposSet.add(item.tipo.trim());
        if (item.motivos) motivosSet.add(item.motivos.trim());
    });

    // Filtro Año Cabecera
    const containerAnio = document.getElementById('header-anio-content');
    containerAnio.innerHTML = '';
    Array.from(aniosSet).sort().forEach(a => {
        containerAnio.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${a}" class="chk-anio" checked onchange="ejecutarFiltrosInternos()"> ${a}</label>`;
    });

    // Filtro Mes Cabecera
    const containerMes = document.getElementById('header-mes-content');
    containerMes.innerHTML = '';
    Array.from(mesesSet).sort((a, b) => parseInt(a) - parseInt(b)).forEach(m => {
        const nombre = mesesNombres[parseInt(m) - 1] || `Mes ${m}`;
        containerMes.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${m}" class="chk-mes" checked onchange="ejecutarFiltrosInternos()"> ${nombre}</label>`;
    });

    // Filtro Semana Cabecera
    const containerSemana = document.getElementById('header-semana-content');
    containerSemana.innerHTML = '';
    Array.from(semanasSet).sort((a, b) => a - b).forEach(s => {
        containerSemana.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${s}" class="chk-semana" checked onchange="ejecutarFiltrosInternos()"> Semana ${s}</label>`;
    });

    // Tipos Popover
    const containerTipo = document.getElementById('popover-tipo-content');
    containerTipo.innerHTML = '';
    Array.from(tiposSet).sort().forEach(t => {
        containerTipo.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${t}" class="chk-tipo" checked onchange="ejecutarFiltrosInternos()"> ${t}</label>`;
    });

    // Motivos Popover
    const containerMotivo = document.getElementById('popover-motivo-content');
    containerMotivo.innerHTML = '';
    Array.from(motivosSet).sort().forEach(mo => {
        containerMotivo.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${mo}" class="chk-motivo" checked onchange="ejecutarFiltrosInternos()"> ${mo}</label>`;
    });
}

function ejecutarFiltrosInternos() {
    let raw = [...baseDatosIncidencias];

    // 1. Filtro Fecha en tabla (Buscador manual de fecha)
    const txtFecha = document.getElementById('input-search-fecha').value.toLowerCase().trim();
    if (txtFecha) {
        raw = raw.filter(i => i.fecha && i.fecha.toLowerCase().includes(txtFecha));
    }

    // 2. Filtro Proveedor en tabla
    const txtSearch = document.getElementById('input-search-prov').value.toLowerCase().trim();
    if (txtSearch) {
        raw = raw.filter(i => i.proveedor && i.proveedor.toLowerCase().includes(txtSearch));
    }

    // 3. Filtros de Cabecera (Año, Mes, Semana)
    const chkAnios = Array.from(document.querySelectorAll('.chk-anio:checked')).map(c => c.value);
    const chkMeses = Array.from(document.querySelectorAll('.chk-mes:checked')).map(c => c.value);
    const chkSemanas = Array.from(document.querySelectorAll('.chk-semana:checked')).map(c => parseInt(c.value));

    raw = raw.filter(i => {
        if (!i.fecha) return false;
        const partes = i.fecha.split('T')[0].split('-');
        const anio = partes[0];
        const mes = partes[1];
        const sem = obtenerNumeroSemana(i.fecha);

        return chkAnios.includes(anio) && chkMeses.includes(mes) && chkSemanas.includes(sem);
    });

    // 4. Filtro Tipos en popover
    const chkTipos = Array.from(document.querySelectorAll('.chk-tipo:checked')).map(c => c.value);
    raw = raw.filter(i => i.tipo && chkTipos.includes(i.tipo.trim()));

    // 5. Filtro Motivos en popover
    const chkMotivos = Array.from(document.querySelectorAll('.chk-motivo:checked')).map(c => c.value);
    raw = raw.filter(i => i.motivos && chkMotivos.includes(i.motivos.trim()));

    actualizarKPIs(raw);
    actualizarGraficoTop(raw);
    renderizarDatosTabla(raw);
}

// CALCULO Y CONVERSIÓN DE TIEMPOS
function sumarTiemposAHorasDecimales(datos, campo) {
    let totalSegundos = 0;
    datos.forEach(item => {
        const valorStr = item[campo];
        if (valorStr) {
            const partes = valorStr.split(':');
            if (partes.length === 3) {
                const horas = parseInt(partes[0], 10) || 0;
                const minutos = parseInt(partes[1], 10) || 0;
                const segundos = parseInt(partes[2], 10) || 0;
                totalSegundos += (horas * 3600) + (minutos * 60) + segundos;
            }
        }
    });
    // Retornamos formato de horas con un decimal
    return (totalSegundos / 3600).toFixed(1);
}

function actualizarKPIs(datosFiltrados) {
    // KPI 1: Total Incidencias
    document.getElementById('kpi-incidencias').textContent = datosFiltrados.length.toLocaleString();

    // KPI 2: Total Proveedores Únicos
    const provsUnicos = new Set(datosFiltrados.map(i => i.proveedor ? i.proveedor.trim() : null).filter(Boolean));
    document.getElementById('kpi-proveedores').textContent = provsUnicos.size;

    // KPI 3 & 4: Horas totales con formato
    const totalAtraso = sumarTiemposAHorasDecimales(datosFiltrados, 'hr_atraso');
    const totalPerdida = sumarTiemposAHorasDecimales(datosFiltrados, 'hr_perdida');

    document.getElementById('kpi-atraso').textContent = `${totalAtraso}h`;
    document.getElementById('kpi-perdidas').textContent = `${totalPerdida}h`;
}

// GRÁFICO TOP PROVEEDORES (CHART.JS)
function actualizarGraficoTop(datosFiltrados) {
    const conteoProveedores = {};
    datosFiltrados.forEach(i => {
        if (i.proveedor) {
            const nombre = i.proveedor.trim();
            conteoProveedores[nombre] = (conteoProveedores[nombre] || 0) + 1;
        }
    });

    // Ordenar y tomar los top 7
    const top7 = Object.entries(conteoProveedores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7);

    const labels = top7.map(item => item[0].substring(0, 25) + (item[0].length > 25 ? '...' : ''));
    const valores = top7.map(item => item[1]);

    if (graficoTopProveedores) {
        graficoTopProveedores.destroy();
    }

    const ctx = document.getElementById('chart-top-proveedores').getContext('2d');
    graficoTopProveedores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Número de Incidencias',
                data: valores,
                backgroundColor: '#00A3E0',
                borderRadius: 6,
                borderWidth: 0,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748B' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#475569', font: { weight: '600' } }
                }
            }
        }
    });
}

function renderizarDatosTabla(data) {
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:#94A3B8;">No existen registros coincidentes.</td></tr>`;
        tableCounter.textContent = `0 / ${baseDatosIncidencias.length} Registros`;
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        const f = row.fecha ? row.fecha.split('T')[0] : 'N/A';
        const tipoLimpio = row.tipo ? row.tipo.trim().toUpperCase() : '';

        // Estilo condicional del badge de tipo (Rojo si es "NO VINO")
        let badgeClass = "origen-badge";
        if (tipoLimpio === "NO VINO") {
            badgeClass = "origen-badge danger";
        } else if (tipoLimpio === "ATRASO") {
            badgeClass = "origen-badge warning";
        }

        tr.innerHTML = `
            <td>${f}</td>
            <td style="text-align: left; font-weight: 500;">${row.proveedor || 'N/A'}</td>
            <td><span class="${badgeClass}">${row.tipo || 'N/A'}</span></td>
            <td style="text-align: left; color:#475569;">${row.motivos || 'N/A'}</td>
            <td style="font-weight: bold; color: #ef4444;">${row.hr_atraso || '00:00:00'}</td>
            <td style="font-weight: bold; color: #475569;">${row.hr_perdida || '00:00:00'}</td>
        `;
        tableBody.appendChild(tr);
    });

    tableCounter.textContent = `${data.length} / ${baseDatosIncidencias.length} Registros`;
}

// ORDENAMIENTO DE TIEMPOS DE MAYOR A MENOR / MENOR A MAYOR
function alternarOrdenAtraso() {
    ordenAtrasoAsc = !ordenAtrasoAsc;
    baseDatosIncidencias.sort((a, b) => {
        const hA = a.hr_atraso || '00:00:00';
        const hB = b.hr_atraso || '00:00:00';
        return ordenAtrasoAsc ? hA.localeCompare(hB) : hB.localeCompare(hA);
    });
    ejecutarFiltrosInternos();
}

function alternarOrdenPerdida() {
    ordenPerdidaAsc = !ordenPerdidaAsc;
    baseDatosIncidencias.sort((a, b) => {
        const hA = a.hr_perdida || '00:00:00';
        const hB = b.hr_perdida || '00:00:00';
        return ordenPerdidaAsc ? hA.localeCompare(hB) : hB.localeCompare(hA);
    });
    ejecutarFiltrosInternos();
}

// CONTROLADORES DE POPUPS Y DROPDOWNS SIN REQUERIR TOGGLEPOPOVER NATIVO
function toggleDropdownMenu(id, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(id);
    const yaAbierto = target.classList.contains('open');
    cerrarTodosLosPopovers();
    if (!yaAbierto) target.classList.add('open');
}

function togglePopover(id, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(id);
    const yaAbierto = target.classList.contains('show');
    cerrarTodosLosPopovers();
    if (!yaAbierto) target.classList.add('show');
}

function cerrarTodosLosPopovers() {
    document.querySelectorAll('.dropdown-content-list').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.popover-content').forEach(p => p.classList.remove('show'));
}

// ALTERNAR SELECCIÓN UNIFICADA (MARCAR / DESMARCAR EN UN SOLO BOTÓN DINÁMICO)
function alternarSeleccionRapida(className, btnId) {
    const checkboxes = document.querySelectorAll('.' + className);
    const btn = document.getElementById(btnId);
    const algunoDesmarcado = Array.from(checkboxes).some(c => !c.checked);

    checkboxes.forEach(c => c.checked = algunoDesmarcado);
    btn.textContent = algunoDesmarcado ? "Desmarcar todo" : "Marcar todo";

    ejecutarFiltrosInternos();
}

function resetearFiltros() {
    document.getElementById('input-search-fecha').value = '';
    document.getElementById('input-search-prov').value = '';
    document.querySelectorAll('.chk-anio, .chk-mes, .chk-semana, .chk-tipo, .chk-motivo').forEach(c => c.checked = true);
    document.querySelectorAll('.btn-toggle-all').forEach(b => b.textContent = "Desmarcar todo");
    ejecutarFiltrosInternos();
}
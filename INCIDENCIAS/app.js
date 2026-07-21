const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co".trim();
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0".trim();

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let baseDatosIncidencias = [];
let mapaAgendaCitasPorDia = {};

let ordenAtrasoAsc = false;
let ordenPerdidaAsc = false;

let chartTemporalInstance = null;
let chartProvsInstance = null;
let chartTipoInstance = null;

let filtroGraficoFecha = null;
let filtroGraficoProveedor = null;
let filtroGraficoTipo = null;
let graficoTemporalExpandido = false;

const mesesNombresGlobal = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const tableBody = document.getElementById('table-body');
const tableCounter = document.getElementById('table-counter');
const statusMessage = document.getElementById('status-message');

document.addEventListener('DOMContentLoaded', () => {
    inicializarEventosMenu();
    generarFiltroMesesEstaticoTabla();
    cargarDatosClaveCEDIS();

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-content-list').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.popover-filter-menu').forEach(p => p.classList.remove('open'));
    });
});

function inicializarEventosMenu() {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebarMenu');
    if (btnToggle && sidebar) {
        btnToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('hidden');
        });
    }
}

function generarFiltroMesesEstaticoTabla() {
    const container = document.getElementById('list-popover-meses-tabla');
    container.innerHTML = '';
    mesesNombresGlobal.forEach((nombre, index) => {
        const valorMes = String(index + 1).padStart(2, '0');
        container.innerHTML += `<label><input type="checkbox" value="${valorMes}" class="chk-pop-mes-tabla" checked onchange="ejecutarFiltrosInternos()"> ${nombre}</label>`;
    });
}

function toggleExpandirGraficoTemporal() {
    graficoTemporalExpandido = !graficoTemporalExpandido;
    const container = document.getElementById('chartsContainer');
    const icon = document.getElementById('icon-expand');

    if (graficoTemporalExpandido) {
        container.classList.add('temporal-expanded');
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        container.classList.remove('temporal-expanded');
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }

    setTimeout(() => {
        if (chartTemporalInstance) chartTemporalInstance.resize();
        if (chartProvsInstance) chartProvsInstance.resize();
        if (chartTipoInstance) chartTipoInstance.resize();
    }, 310);
}

async function cargarDatosClaveCEDIS() {
    try {
        let incidenciasCargadas = [];
        let desdeI = 0;
        const limite = 1000;
        let leyendoIncidencias = true;

        while (leyendoIncidencias) {
            const { data, error } = await _supabase
                .from('incidencias_proveedores')
                .select('*')
                .range(desdeI, desdeI + limite - 1);

            if (error) throw error;
            if (data && data.length > 0) {
                incidenciasCargadas = incidenciasCargadas.concat(data);
                desdeI += limite;
                if (data.length < limite) leyendoIncidencias = false;
            } else {
                leyendoIncidencias = false;
            }
        }
        baseDatosIncidencias = incidenciasCargadas;

        let agendaCargada = [];
        let desdeA = 0;
        let leyendoAgenda = true;

        while (leyendoAgenda) {
            const { data, error } = await _supabase
                .from('agenda_b100')
                .select('fecha')
                .range(desdeA, desdeA + limite - 1);

            if (error) {
                leyendoAgenda = false;
            } else if (data && data.length > 0) {
                agendaCargada = agendaCargada.concat(data);
                desdeA += limite;
                if (data.length < limite) leyendoAgenda = false;
            } else {
                leyendoAgenda = false;
            }
        }

        mapaAgendaCitasPorDia = {};
        agendaCargada.forEach(cita => {
            if (cita.fecha) {
                const fISO = cita.fecha.split('T')[0];
                mapaAgendaCitasPorDia[fISO] = (mapaAgendaCitasPorDia[fISO] || 0) + 1;
            }
        });

        generarFiltrosEstructurales();
        ejecutarFiltrosInternos();

    } catch (err) {
        console.error(err);
        if (statusMessage) statusMessage.textContent = "Error: " + err.message;
    }
}

function obtenerSemanaDelMes(fechaStr) {
    if (!fechaStr) return null;
    const date = new Date(fechaStr);
    if (isNaN(date.getTime())) return null;
    return Math.min(5, Math.ceil(date.getDate() / 7));
}

function generarFiltrosEstructurales() {
    const aniosSet = new Set();
    const mesesSet = new Set();
    const tiposSet = new Set();
    const motivosSet = new Set();

    baseDatosIncidencias.forEach(item => {
        if (item.fecha) {
            const partes = item.fecha.split('T')[0].split('-');
            if (partes[0]) aniosSet.add(partes[0]);
            if (partes[1]) mesesSet.add(partes[1]);
        }
        if (item.tipo) tiposSet.add(item.tipo.trim());
        if (item.motivos) motivosSet.add(item.motivos.trim());
    });

    const containerAnio = document.getElementById('header-anio-content');
    containerAnio.innerHTML = '';
    Array.from(aniosSet).sort().forEach(a => {
        containerAnio.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${a}" class="chk-anio" checked onchange="ejecutarFiltrosInternos()"> ${a}</label>`;
    });

    const containerMes = document.getElementById('header-mes-content');
    containerMes.innerHTML = '';
    Array.from(mesesSet).sort((a, b) => parseInt(a) - parseInt(b)).forEach(m => {
        const nombre = mesesNombresGlobal[parseInt(m) - 1] || `Mes ${m}`;
        containerMes.innerHTML += `<label onclick="event.stopPropagation()"><input type="checkbox" value="${m}" class="chk-mes" checked onchange="ejecutarFiltrosInternos()"> ${nombre}</label>`;
    });

    const popoverTipo = document.getElementById('list-popover-tipo');
    popoverTipo.innerHTML = '';
    Array.from(tiposSet).sort().forEach(t => {
        popoverTipo.innerHTML += `<label><input type="checkbox" value="${t}" class="chk-pop-tipo" checked onchange="ejecutarFiltrosInternos()"> ${t}</label>`;
    });

    const popoverMotivo = document.getElementById('list-popover-motivo');
    popoverMotivo.innerHTML = '';
    Array.from(motivosSet).sort().forEach(mo => {
        popoverMotivo.innerHTML += `<label><input type="checkbox" value="${mo}" class="chk-pop-motivo" checked onchange="ejecutarFiltrosInternos()"> ${mo}</label>`;
    });
}

function ejecutarFiltrosInternos() {
    let dataset = [...baseDatosIncidencias];

    // 1. Filtro por Selección de 12 Meses en la columna Fecha de la Tabla
    const chkMesesTabla = Array.from(document.querySelectorAll('.chk-pop-mes-tabla:checked')).map(c => c.value);
    dataset = dataset.filter(i => {
        if (!i.fecha) return false;
        const mesDeFila = i.fecha.split('T')[0].split('-')[1];
        return chkMesesTabla.includes(mesDeFila);
    });

    // 2. Buscador en columna Proveedor
    const filtroProvText = document.getElementById('input-search-prov').value.trim().toLowerCase();
    if (filtroProvText) {
        dataset = dataset.filter(i => i.proveedor && i.proveedor.toLowerCase().includes(filtroProvText));
    }

    // 3. Checkboxes de los Popovers (Tipo y Motivo)
    const chkTiposSeleccionados = Array.from(document.querySelectorAll('.chk-pop-tipo:checked')).map(c => c.value);
    dataset = dataset.filter(i => i.tipo && chkTiposSeleccionados.includes(i.tipo.trim()));

    const chkMotivosSeleccionados = Array.from(document.querySelectorAll('.chk-pop-motivo:checked')).map(c => c.value);
    dataset = dataset.filter(i => i.motivos && chkMotivosSeleccionados.includes(i.motivos.trim()));

    // 4. Barra Superior Global
    const chkAnios = Array.from(document.querySelectorAll('.chk-anio:checked')).map(c => c.value);
    const chkMeses = Array.from(document.querySelectorAll('.chk-mes:checked')).map(c => c.value);
    const chkSemanas = Array.from(document.querySelectorAll('.chk-semana:checked')).map(c => parseInt(c.value));

    dataset = dataset.filter(i => {
        if (!i.fecha) return false;
        const partes = i.fecha.split('T')[0].split('-');
        return chkAnios.includes(partes[0]) && chkMeses.includes(partes[1]) && chkSemanas.includes(obtenerSemanaDelMes(i.fecha));
    });

    // 5. Interactividad Cruzada
    if (filtroGraficoFecha) {
        dataset = dataset.filter(i => i.fecha && i.fecha.split('T')[0] === filtroGraficoFecha);
    }
    if (filtroGraficoProveedor) {
        dataset = dataset.filter(i => i.proveedor && i.proveedor.trim().toUpperCase() === filtroGraficoProveedor.toUpperCase());
    }
    if (filtroGraficoTipo) {
        dataset = dataset.filter(i => i.tipo && i.tipo.trim().toUpperCase() === filtroGraficoTipo.toUpperCase());
    }

    actualizarTarjetasKPI(dataset);
    renderizarGraficoTemporal(dataset);
    renderizarGraficoProvs(dataset);
    renderizarGraficoTipo(dataset);
    renderizarEstructuraTabla(dataset);
}

function sumarTiemposADecimal(datos, campo) {
    let segundos = 0;
    datos.forEach(item => {
        const val = item[campo];
        if (val && val.split(':').length === 3) {
            const p = val.split(':');
            segundos += (parseInt(p[0]) * 3600) + (parseInt(p[1]) * 60) + parseInt(p[2]);
        }
    });
    return (segundos / 3600).toFixed(1);
}

function actualizarTarjetasKPI(datosFiltrados) {
    document.getElementById('kpi-incidencias').textContent = datosFiltrados.length.toLocaleString();
    const provs = new Set(datosFiltrados.map(i => i.proveedor ? i.proveedor.trim() : null).filter(Boolean));
    document.getElementById('kpi-proveedores').textContent = provs.size;
    document.getElementById('kpi-atraso').textContent = `${sumarTiemposADecimal(datosFiltrados, 'hr_atraso')}h`;
    document.getElementById('kpi-perdidas').textContent = `${sumarTiemposADecimal(datosFiltrados, 'hr_perdida')}h`;

    let totalCitas = 0;
    const fechas = new Set(datosFiltrados.map(i => i.fecha ? i.fecha.split('T')[0] : null).filter(Boolean));
    fechas.forEach(f => { totalCitas += (mapaAgendaCitasPorDia[f] || 0); });

    if (totalCitas === 0) totalCitas = datosFiltrados.length * 5;
    let otif = ((totalCitas - datosFiltrados.length) / totalCitas) * 100;
    document.getElementById('kpi-confiabilidad').textContent = `${Math.max(0, Math.min(100, otif)).toFixed(1)}%`;
}

// 1º GRÁFICO: LÍNEA TEMPORAL
function renderizarGraficoTemporal(datosFiltrados) {
    const agrupado = {};
    datosFiltrados.forEach(i => {
        if (i.fecha) {
            const f = i.fecha.split('T')[0];
            agrupado[f] = (agrupado[f] || 0) + 1;
        }
    });

    const labels = Object.keys(agrupado).sort((a, b) => new Date(a) - new Date(b)).slice(-10);
    const valores = labels.map(l => agrupado[l]);

    if (chartTemporalInstance) chartTemporalInstance.destroy();
    const ctx = document.getElementById('chart-evolucion-temporal').getContext('2d');
    chartTemporalInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                borderColor: '#00A3E0',
                backgroundColor: 'rgba(0, 163, 224, 0.08)',
                borderWidth: 3,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            onClick: (e, el) => {
                if (el.length > 0) {
                    const fSel = labels[el[0].index];
                    filtroGraficoFecha = (filtroGraficoFecha === fSel) ? null : fSel;
                    ejecutarFiltrosInternos();
                }
            }
        }
    });
}

// 2º GRÁFICO: TOP PROVEEDORES CONFIGURADO A MANERA HORIZONTAL
function renderizarGraficoProvs(datosFiltrados) {
    const conteo = {};
    datosFiltrados.forEach(i => {
        if (i.proveedor) {
            const p = i.proveedor.trim();
            conteo[p] = (conteo[p] || 0) + 1;
        }
    });

    const topProvs = Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a]).slice(0, 4);
    const valores = topProvs.map(p => conteo[p]);

    if (chartProvsInstance) chartProvsInstance.destroy();
    const ctx = document.getElementById('chart-top-proveedores').getContext('2d');
    chartProvsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topProvs,
            datasets: [{
                data: valores,
                backgroundColor: '#0A2540',
                barPercentage: 0.6
            }]
        },
        options: {
            indexAxis: 'y', // ESTO HACE EL GRÁFICO HORIZONTAL STRICT
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { precision: 0 } }
            },
            onClick: (e, el) => {
                if (el.length > 0) {
                    const pSel = topProvs[el[0].index];
                    filtroGraficoProveedor = (filtroGraficoProveedor === pSel) ? null : pSel;
                    ejecutarFiltrosInternos();
                }
            }
        }
    });
}

// 3º GRÁFICO: INCIDENCIAS POR TIPO
function renderizarGraficoTipo(datosFiltrados) {
    const conteo = {};
    datosFiltrados.forEach(i => {
        if (i.tipo) {
            const t = i.tipo.trim().toUpperCase();
            conteo[t] = (conteo[t] || 0) + 1;
        }
    });

    const orden = ["NO VINO", "ATRASO", "PACKING"];
    const labels = [];
    const valores = [];
    const colores = [];

    orden.forEach(tipo => {
        labels.push(tipo);
        valores.push(conteo[tipo] || 0);
        if (tipo === "NO VINO") colores.push('#A80000');
        else if (tipo === "ATRASO") colores.push('#6B006B');
        else colores.push('#6A5ACD');
    });

    if (chartTipoInstance) chartTipoInstance.destroy();
    const ctx = document.getElementById('chart-incidencias-tipo').getContext('2d');
    chartTipoInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: colores,
                borderColor: '#1e1e1e',
                borderWidth: 1,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'INCIDENCIAS POR TIPO', color: '#000000', font: { weight: 'bold' } }
            },
            onClick: (e, el) => {
                if (el.length > 0) {
                    const tSel = labels[el[0].index];
                    filtroGraficoTipo = (filtroGraficoTipo === tSel) ? null : tSel;
                    ejecutarFiltrosInternos();
                }
            }
        }
    });
}

function renderizarEstructuraTabla(data) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 25px; color:#94A3B8;">Sin registros.</td></tr>`;
        tableCounter.textContent = `0 / ${baseDatosIncidencias.length}`;
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        const tipoLimpio = row.tipo ? row.tipo.trim().toUpperCase() : '';
        let badgeClass = "origen-badge";
        if (tipoLimpio === "NO VINO") badgeClass = "origen-badge danger";
        else if (tipoLimpio === "ATRASO") badgeClass = "origen-badge warning";

        tr.innerHTML = `
            <td>${row.fecha ? row.fecha.split('T')[0] : 'N/A'}</td>
            <td style="text-align: left; font-weight: 500;">${row.proveedor || 'N/A'}</td>
            <td><span class="${badgeClass}">${row.tipo || 'N/A'}</span></td>
            <td style="text-align: left; color:#475569;">${row.motivos || 'N/A'}</td>
            <td style="font-weight: bold; color: #EF4444;">${row.hr_atraso || '00:00:00'}</td>
            <td style="font-weight: bold; color: #475569;">${row.hr_perdida || '00:00:00'}</td>
        `;
        tableBody.appendChild(tr);
    });
    tableCounter.textContent = `${data.length} / ${baseDatosIncidencias.length} Registros`;
}

function alternarOrdenAtraso() {
    ordenAtrasoAsc = !ordenAtrasoAsc;
    baseDatosIncidencias.sort((a, b) => ordenAtrasoAsc ? (a.hr_atraso || '').localeCompare(b.hr_atraso || '') : (b.hr_atraso || '').localeCompare(a.hr_atraso || ''));
    ejecutarFiltrosInternos();
}

function alternarOrdenPerdida() {
    ordenPerdidaAsc = !ordenPerdidaAsc;
    baseDatosIncidencias.sort((a, b) => ordenPerdidaAsc ? (a.hr_perdida || '').localeCompare(b.hr_perdida || '') : (b.hr_perdida || '').localeCompare(a.hr_perdida || ''));
    ejecutarFiltrosInternos();
}

function togglePopoverFiltro(id, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(id);
    const abierto = target.classList.contains('open');

    document.querySelectorAll('.popover-filter-menu').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.dropdown-content-list').forEach(d => d.classList.remove('open'));

    if (!abierto) target.classList.add('open');
}

function toggleDropdownMenu(id, event) {
    if (event) event.stopPropagation();
    const element = document.getElementById(id);
    const abierto = element.classList.contains('open');
    document.querySelectorAll('.dropdown-content-list').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.popover-filter-menu').forEach(p => p.classList.remove('open'));
    if (!abierto) element.classList.add('open');
}

function alternarSeleccionRapida(className, btnId) {
    const boxes = document.querySelectorAll('.' + className);
    const btn = document.getElementById(btnId);
    const marcar = !Array.from(boxes).every(c => c.checked);
    boxes.forEach(c => c.checked = marcar);
    btn.textContent = marcar ? "Desmarcar todo" : "Marcar todo";
    ejecutarFiltrosInternos();
}

function alternarListaFiltroTabla(className, btnId) {
    const checkboxes = document.querySelectorAll('.' + className);
    const btn = document.getElementById(btnId);
    const todosMarcados = Array.from(checkboxes).every(c => c.checked);

    checkboxes.forEach(c => c.checked = !todosMarcados);
    btn.textContent = !todosMarcados ? "Desmarcar todo" : "Marcar todo";
    ejecutarFiltrosInternos();
}

function resetearFiltros() {
    filtroGraficoFecha = null;
    filtroGraficoProveedor = null;
    filtroGraficoTipo = null;
    document.getElementById('input-search-prov').value = '';
    document.querySelectorAll('.chk-anio, .chk-mes, .chk-semana, .chk-pop-mes-tabla, .chk-pop-tipo, .chk-pop-motivo').forEach(c => c.checked = true);
    document.querySelectorAll('.btn-toggle-all').forEach(b => b.textContent = "Desmarcar todo");
    ejecutarFiltrosInternos();
}
function evtToggleSubmenu(event) {
    event.preventDefault();
    // Busca el contenedor principal .menu-item-group más cercano
    const group = event.currentTarget.closest('.menu-item-group');
    if (group) {
        group.classList.toggle('open');
    }
}
// CONEXIÓN DIRECTA A SUPABASE
const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

let dataTotalBase = [];
let chartUsersInstance = null;
let chartHoursInstance = null;

const PALETA_COLORES = [
    '#00A3E0', '#0A2540', '#10B981', '#F59E0B', '#6366F1',
    '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4'
];

document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    if (btnToggle) {
        btnToggle.addEventListener('click', function () {
            const sidebar = document.getElementById('sidebarMenu');
            if (sidebar) sidebar.classList.toggle('hidden');
        });
    }
    inicializarDashboard();
});

function evtToggleSubmenu(event) {
    event.preventDefault();
    const group = event.currentTarget.closest('.menu-item-group');
    if (group) {
        group.classList.toggle('open');
    }
}

// INICIALIZACIÓN
async function inicializarDashboard() {
    const tbody = document.querySelector('#data-table tbody');
    const statusText = document.getElementById('db-status-text');

    tbody.innerHTML = `<tr><td colspan="8" class="loading-td"><i class="fa-solid fa-sync fa-spin"></i> Cargando base de datos logística...</td></tr>`;
    statusText.innerText = "Conectando...";
    statusText.style.color = "#00E5FF";

    try {
        let desdeFila = 0, tamanoPagina = 1000, consultando = true;
        let registrosCrudos = [];

        while (consultando) {
            const { data, error } = await _supabase
                .from('historico_recepcion')
                .select('*')
                .range(desdeFila, desdeFila + tamanoPagina - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                registrosCrudos = registrosCrudos.concat(data);
                desdeFila += tamanoPagina;
            } else {
                consultando = false;
            }

            if (data.length < tamanoPagina) consultando = false;
        }

        // FILTRAR AUTOMÁTICAMENTE fusionsyncwms
        dataTotalBase = registrosCrudos.filter(item => {
            const usr = (item["Usuario creado"] || "").trim().toLowerCase();
            return usr !== "" && usr !== "fusionsyncwms";
        });

        statusText.innerText = "Conectado";
        statusText.style.color = "#10B981";

        poblarFiltrosHeader(dataTotalBase);
        poblarFiltroUsuarios(dataTotalBase);
        aplicarFiltrosGlobales();

    } catch (err) {
        console.error("Error al conectar:", err);
        statusText.innerText = "Error de Conexión";
        statusText.style.color = "#EF4444";
        tbody.innerHTML = `<tr><td colspan="8" class="loading-td" style="color:red;">⚠️ Error de Conexión: ${err.message}</td></tr>`;
    }
}

// POBLAR AÑOS
function poblarFiltrosHeader(datos) {
    const selectYear = document.getElementById('filter-year');
    selectYear.innerHTML = '<option value="TODOS">Año: Todos</option>';

    const anos = new Set();
    datos.forEach(d => {
        const fecha = d["Fe y Hr Crea"] || d["Fecha de Agenda"] || "";
        if (fecha && fecha.length >= 4) {
            const y = fecha.substring(0, 4);
            if (!isNaN(y)) anos.add(y);
        }
    });

    [...anos].sort().reverse().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `Año: ${y}`;
        selectYear.appendChild(opt);
    });
}

// POBLAR USUARIOS
function poblarFiltroUsuarios(datos) {
    const select = document.getElementById('filter-user');
    select.innerHTML = '<option value="TODOS">Todos los usuarios</option>';

    const usuarios = [...new Set(datos.map(d => d["Usuario creado"]).filter(Boolean))].sort();

    usuarios.forEach(u => {
        const option = document.createElement('option');
        option.value = u;
        option.textContent = u;
        select.appendChild(option);
    });
}

// FILTRADO COMBINADO
function aplicarFiltrosGlobales() {
    const selYear = document.getElementById('filter-year').value;
    const selMonth = document.getElementById('filter-month').value;
    const selUser = document.getElementById('filter-user').value;

    const datosFiltrados = dataTotalBase.filter(d => {
        const fecha = d["Fe y Hr Crea"] || d["Fecha de Agenda"] || "";
        const usr = d["Usuario creado"] || "";

        if (selYear !== 'TODOS') {
            if (!fecha.startsWith(selYear)) return false;
        }

        if (selMonth !== 'TODOS') {
            if (fecha.length >= 7) {
                const mesFila = fecha.substring(5, 7);
                if (mesFila !== selMonth) return false;
            } else {
                return false;
            }
        }

        if (selUser !== 'TODOS') {
            if (usr !== selUser) return false;
        }

        return true;
    });

    actualizarKpis(datosFiltrados);
    generarGraficos(datosFiltrados);
    construirTablaHTML(datosFiltrados);
}

function resetearFiltros() {
    document.getElementById('filter-year').value = 'TODOS';
    document.getElementById('filter-month').value = 'TODOS';
    document.getElementById('filter-user').value = 'TODOS';
    aplicarFiltrosGlobales();
}

// KPIS
function actualizarKpis(datos) {
    const totalAsn = datos.length;
    const usuarios = new Set(datos.map(d => d["Usuario creado"]).filter(Boolean));

    let totalSkus = 0;
    datos.forEach(d => {
        totalSkus += Number(d["Número de artículos"] || 0);
    });

    const promSkusPerAsn = totalAsn > 0 ? (totalSkus / totalAsn).toFixed(1) : 0;

    document.getElementById('kpi-total-asn').innerText = totalAsn.toLocaleString();
    document.getElementById('kpi-total-usuarios').innerText = usuarios.size.toLocaleString();
    document.getElementById('kpi-total-skus').innerText = totalSkus.toLocaleString();
    document.getElementById('kpi-prom-skus').innerText = promSkusPerAsn;
}

// GENERAR AMBOS GRÁFICOS
function generarGraficos(datos) {
    // -------------------------------------------------------------
    // 1. PROCESAR BARRAS HORIZONTALES (USUARIOS)
    // -------------------------------------------------------------
    const conteoUsuarios = {};
    datos.forEach(d => {
        const usr = d["Usuario creado"] || "SIN USUARIO";
        conteoUsuarios[usr] = (conteoUsuarios[usr] || 0) + 1;
    });

    const usuariosOrdenados = Object.entries(conteoUsuarios).sort((a, b) => b[1] - a[1]);
    const userLabels = usuariosOrdenados.map(u => u[0]);
    const userData = usuariosOrdenados.map(u => u[1]);
    const bgColors = userLabels.map((_, index) => PALETA_COLORES[index % PALETA_COLORES.length]);

    // -------------------------------------------------------------
    // 2. PROCESAR DISTRIBUCIÓN HORARIA CON RANGO DINÁMICO
    // -------------------------------------------------------------
    const horasMap = Array(24).fill(0);

    datos.forEach(d => {
        const fechaHora = d["Fe y Hr Crea"] || "";
        let horaExtraida = null;

        if (fechaHora.includes(" ")) {
            const hStr = fechaHora.split(" ")[1];
            if (hStr) horaExtraida = parseInt(hStr.split(":")[0], 10);
        } else if (fechaHora.includes("T")) {
            const hStr = fechaHora.split("T")[1];
            if (hStr) horaExtraida = parseInt(hStr.split(":")[0], 10);
        }

        if (horaExtraida !== null && !isNaN(horaExtraida) && horaExtraida >= 0 && horaExtraida < 24) {
            horasMap[horaExtraida]++;
        }
    });

    // Encontrar la primera y última hora con datos
    const horasConDatos = [];
    horasMap.forEach((cantidad, hora) => {
        if (cantidad > 0) horasConDatos.push(hora);
    });

    let horaInicio = 6;
    let horaFin = 19;

    if (horasConDatos.length > 0) {
        const minHora = Math.min(...horasConDatos);
        const maxHora = Math.max(...horasConDatos);

        // 1 hora antes de la primera cartonización y 1 hora después de la última
        horaInicio = Math.max(0, minHora - 1);
        horaFin = Math.min(23, maxHora + 1);
    }

    const horasSlice = horasMap.slice(horaInicio, horaFin + 1);
    const horasLabels = horasSlice.map((_, index) => {
        const h = horaInicio + index;
        return `${h.toString().padStart(2, '0')}:00`;
    });

    // DESTRUIR INSTANCIAS PREVIAS
    if (chartUsersInstance) chartUsersInstance.destroy();
    if (chartHoursInstance) chartHoursInstance.destroy();

    // RENDER GRÁFICO 1: USUARIOS (NOMBRES VISIBLES GARANTIZADOS)
    const ctxUsers = document.getElementById('chartUsersAsn').getContext('2d');
    chartUsersInstance = new Chart(ctxUsers, {
        type: 'bar',
        data: {
            labels: userLabels,
            datasets: [{
                label: 'ASNs Cartonizadas',
                data: userData,
                backgroundColor: bgColors,
                borderRadius: 5,
                barPercentage: 0.75
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { right: 45, left: 10, top: 10, bottom: 10 }
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    color: '#0A2540',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value.toLocaleString()
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: '#E2E8F0' },
                    grace: '15%'
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        autoSkip: false, // OBLIGA A MOSTRAR TODOS LOS NOMBRES SIN OCULTAR NINGUNO
                        font: { size: 11, weight: '600' },
                        color: '#0A2540'
                    }
                }
            }
        }
    });

    // RENDER GRÁFICO 2: HORAS (NÚMEROS DENTRO DEL CUADRO)
    const ctxHours = document.getElementById('chartHoursAsn').getContext('2d');
    chartHoursInstance = new Chart(ctxHours, {
        type: 'line',
        data: {
            labels: horasLabels,
            datasets: [{
                label: 'ASNs Creadas',
                data: horasSlice,
                borderColor: '#00A3E0',
                backgroundColor: 'rgba(0, 163, 224, 0.15)',
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#0A2540',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 25, right: 20, left: 10, bottom: 10 } // EVITA QUE SE SALGAN LOS NÚMEROS POR ARRIBA
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    color: '#00A3E0',
                    font: { weight: 'bold', size: 11 },
                    formatter: (val) => (val > 0 ? val.toLocaleString() : '')
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#E2E8F0' },
                    grace: '20%' // AÑADE MARGEN SUPERIOR INTERNO AL EJE Y
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 11, weight: '600' },
                        color: '#475569'
                    }
                }
            }
        }
    });
}

// FUNCIÓN CORREGIDA Y REFLUIDA PARA EXPANDIR / CONTRAER GRÁFICOS
function toggleExpandChart(cardId) {
    const targetCard = document.getElementById(cardId);
    const otherCardId = cardId === 'cardChartUsers' ? 'cardChartHours' : 'cardChartUsers';
    const otherCard = document.getElementById(otherCardId);
    const icon = document.getElementById(`icon-${cardId}`);

    if (!targetCard || !otherCard || !icon) return;

    const estaExpandido = targetCard.classList.contains('expanded');

    if (estaExpandido) {
        // 1. Volver al estado normal
        targetCard.classList.remove('expanded');
        otherCard.classList.remove('hidden-chart');
        icon.className = 'fa-solid fa-expand';
    } else {
        // 2. Ocultar la otra tarjeta y expandir esta
        otherCard.classList.add('hidden-chart');
        targetCard.classList.add('expanded');
        icon.className = 'fa-solid fa-compress';
    }

    // 3. Redimensionado inmediato
    if (chartUsersInstance) chartUsersInstance.resize();
    if (chartHoursInstance) chartHoursInstance.resize();

    // 4. Redimensionado secundario al finalizar la animación/transición CSS
    setTimeout(() => {
        if (chartUsersInstance) chartUsersInstance.resize();
        if (chartHoursInstance) chartHoursInstance.resize();
    }, 300);
}

// RENDEREAR TABLA
function construirTablaHTML(datosTabla) {
    const tbody = document.querySelector('#data-table tbody');
    const counter = document.getElementById('table-counter');

    tbody.innerHTML = '';
    counter.innerText = `${datosTabla.length} Registros`;

    if (datosTabla.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-td">No se encontraron registros para los filtros seleccionados.</td></tr>`;
        return;
    }

    datosTabla.slice(0, 150).forEach(fila => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="user-badge">${fila["Usuario creado"] || '-'}</span></td>
            <td><strong>${fila["Nro ASN"] || '-'}</strong></td>
            <td>${fila["Nombre de proveedor"] || '-'}</td>
            <td>${fila["Números de OC"] || '-'}</td>
            <td><span class="sku-badge"><i class="fa-solid fa-boxes-stacked"></i> ${Number(fila["Número de artículos"] || 0).toLocaleString()}</span></td>
            <td>${Number(fila["Nro LPN"] || 0).toLocaleString()}</td>
            <td>${fila["Tipo ASN"] || '-'}</td>
            <td>${fila["Fe y Hr Crea"] || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}
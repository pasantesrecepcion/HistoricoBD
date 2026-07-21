// Registro de plugin DataLabels global para números sobre los gráficos
Chart.register(ChartDataLabels);

// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0";

let supabaseClient = null;

// Variables globales para datos
let totalRecords_Raw = [];
let records_FilteredByHeader = [];

// Instancias de Charts
let chartLinea = null;
let chartMedidor = null;
let chartSobrecapacidad = null;
let miniGaugeChart = null;

// Estados de Filtro (Soporta Desfiltrar / Toggle)
let fechaSeleccionadaQuick = null;
let filtroOrigenGrafico = null; // 'CDS' (FARMACIA) o 'DP' (SALA)

const CAPACIDAD_FIJA_DIARIA = 77.0;

document.addEventListener("DOMContentLoaded", () => {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebarMenu');
    if (btnToggle && sidebar) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
        });
    }

    try {
        if (typeof supabase !== 'undefined') {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            descargarTodosLosDatosSupabase();
        } else {
            console.warn("Librería window.supabase no detectada. Cargando Fallback.");
            loadFallbackData();
        }
    } catch (error) {
        console.error("Error inicializando Supabase:", error);
        loadFallbackData();
    }

    const btnLimpiarAll = document.getElementById('btn-clear-filters');
    if (btnLimpiarAll) {
        btnLimpiarAll.addEventListener('click', resetearTodosLosFiltros);
    }

    window.addEventListener('click', (e) => {
        if (!e.target.matches('.dropdown-btn') && !e.target.closest('.dropdown-content-list') && !e.target.closest('.filter-icon') && !e.target.closest('.popover-content')) {
            cerrarTodosLosPopovers();
        }
    });

    document.querySelectorAll('.filter-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = icon.getAttribute('data-popover');
            const popover = document.getElementById(targetId);
            const wasVisible = popover ? popover.classList.contains('show') : false;

            cerrarTodosLosPopovers();
            if (popover && !wasVisible) {
                popover.classList.add('show');
            }
        });
    });
});

function getFechaHoyISO() {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function descargarTodosLosDatosSupabase() {
    actualizarMensajeTabla("Conectando con Supabase (Pronósticos futuros)...");
    try {
        if (!supabaseClient) throw new Error("Cliente Supabase no inicializado.");

        let todosLosDatos = [];
        let desde = 0;
        const paso = 1000;
        let trayendo = true;

        const fechaHoy = getFechaHoyISO();

        actualizarMensajeTabla("Estableciendo enlace de alta velocidad con Supabase...");

        while (trayendo) {
            const { data, error } = await supabaseClient
                .from('agenda_b100')
                .select('id_cita, fecha, proveedor, puerta, hora_inicio, hora_fin, cant_sku, cant_cajas, personal_requerido, estado, tipo_destino')
                .gt('fecha', fechaHoy)
                .order('fecha', { ascending: true })
                .range(desde, desde + paso - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                todosLosDatos = todosLosDatos.concat(data);
                desde += paso;
            } else {
                trayendo = false;
            }

            if (!data || data.length < paso) {
                trayendo = false;
            }
        }

        totalRecords_Raw = todosLosDatos;
        actualizarMensajeTabla(`Sincronización completa: ${totalRecords_Raw.length} registros cargados.`);

        generarBotonesFechasDinámicos(totalRecords_Raw);
        ejecutarFiltrosCombinados();

    } catch (err) {
        console.error(err);
        actualizarMensajeTabla(`Fallo de conexión: ${err.message}. Usando Fallback.`);
        loadFallbackData();
    }
}

/**
 * Genera tarjetas/botones INDEPENDIENTES y SEPARADOS para cada fecha
 */
function generarBotonesFechasDinámicos(data) {
    const container = document.getElementById('date-buttons-container');
    if (!container) return;
    container.innerHTML = '';

    const fechasUnicas = [...new Set(data.map(r => r.fecha).filter(Boolean))].sort();

    const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

    fechasUnicas.forEach(f => {
        const partes = f.split('-'); // ISO: [AAAA, MM, DD]
        const dateObj = new Date(Date.parse(`${f}T12:00:00`));
        const diaNombre = diasSemana[dateObj.getDay()];

        // Crear elemento Botón Independiente
        const btnCard = document.createElement('button');
        btnCard.type = 'button';
        btnCard.className = 'btn-fecha-card'; // Clase para estilo independiente
        btnCard.setAttribute('data-fecha', f);

        // Si ya estaba seleccionada previamente, mantenemos el estado visual activo
        if (fechaSeleccionadaQuick === f) {
            btnCard.classList.add('active-filter');
        }

        btnCard.innerHTML = `
            <i class="fa-solid fa-calendar-day"></i>
            <span class="dia-nombre">${diaNombre}</span>
            <span class="fecha-corta">${partes[2]}/${partes[1]}</span>
        `;

        // Evento Click Toggle
        btnCard.onclick = () => seleccionarFechaFiltro(f, btnCard);

        container.appendChild(btnCard);
    });

    ejecutarFiltrosCombinados();
}

/**
 * Selección e intercambio de color de botones por fecha
 */
function seleccionarFechaFiltro(fecha, elementoBtn) {
    if (fechaSeleccionadaQuick === fecha) {
        // Desactivar filtro si se vuelve a presionar el mismo botón
        fechaSeleccionadaQuick = null;
        if (elementoBtn) elementoBtn.classList.remove('active-filter');
    } else {
        // Seleccionar nueva fecha y desmarcar todos los demás botones independientes
        fechaSeleccionadaQuick = fecha;
        document.querySelectorAll('.btn-fecha-card').forEach(b => b.classList.remove('active-filter'));
        if (elementoBtn) elementoBtn.classList.add('active-filter');
    }

    ejecutarFiltrosCombinados();
}

function resetearTodasLasFechas() {
    fechaSeleccionadaQuick = null;
    document.querySelectorAll('.btn-fecha-card').forEach(b => b.classList.remove('active-filter'));
    ejecutarFiltrosCombinados();
}

function parseTimeToDecimal(timeString) {
    if (!timeString) return 0;
    const parts = timeString.split(':');
    const hrs = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    const secs = parseInt(parts[2], 10) || 0;
    return hrs + (mins / 60) + (secs / 3600);
}

function ejecutarFiltrosCombinados() {
    const fechaHoy = getFechaHoyISO();

    records_FilteredByHeader = totalRecords_Raw.filter(r => {
        if (!r.fecha) return false;
        if (r.fecha <= fechaHoy) return false;

        if (fechaSeleccionadaQuick && r.fecha !== fechaSeleccionadaQuick) return false;

        return true;
    });

    ejecutarFiltrosInternos();
}

function ejecutarFiltrosInternos() {
    const buscadorProv = (document.getElementById('input-search-prov')?.value || "").toLowerCase().trim();

    let recordsFinales = records_FilteredByHeader.filter(r => {
        const r_origen = (r.tipo_destino || "CDS").toUpperCase();
        const r_prov = r.proveedor || "";

        const matchBuscador = buscadorProv === "" || r_prov.toLowerCase().includes(buscadorProv);

        let matchFiltroOrigen = true;
        if (filtroOrigenGrafico) {
            matchFiltroOrigen = (r_origen === filtroOrigenGrafico);
        }

        return matchBuscador && matchFiltroOrigen;
    });

    calcularYMostrarKPIs(recordsFinales);
    actualizarTablaYContadores(recordsFinales);
    renderizarGraficosDinamicamente(recordsFinales);
}

function calcularYMostrarKPIs(dataContext) {
    if (!dataContext || dataContext.length === 0) {
        actualizarVistasKPI(0, 0, 0, 0, 0, 0, 0);
        return;
    }

    const proveedoresValidos = dataContext.map(r => r.proveedor).filter(Boolean);
    const totalProveedores = [...new Set(proveedoresValidos)].length;

    let horasOcupadas = 0;
    let totalSkus = 0;
    let totalLpns = 0;
    const fechasConMovimiento = new Set();

    dataContext.forEach(r => {
        const duracion = parseTimeToDecimal(r.hora_fin) - parseTimeToDecimal(r.hora_inicio);
        if (duracion > 0) horasOcupadas += duracion;

        totalSkus += parseInt(r.cant_sku) || 0;
        totalLpns += parseInt(r.cant_cajas) || 0;

        if (r.fecha) fechasConMovimiento.add(r.fecha);
    });

    const diasContados = fechasConMovimiento.size || 1;
    const capacidadTotalPeriodo = diasContados * CAPACIDAD_FIJA_DIARIA;
    const horasDisponibles = Math.max(0, capacidadTotalPeriodo - horasOcupadas);
    const ocupacionPorcentaje = Math.round((horasOcupadas / capacidadTotalPeriodo) * 100);

    actualizarVistasKPI(totalProveedores, horasOcupadas, horasDisponibles, capacidadTotalPeriodo, totalSkus, totalLpns, ocupacionPorcentaje);
}

function actualizarVistasKPI(prov, hOcupadas, hDisponibles, capTotal, skus, lpns, ocupacion) {
    seguraInyeccionHTML('val-prov-total', prov.toLocaleString());
    seguraInyeccionHTML('val-horas-plan', `${hOcupadas.toFixed(1)}h requeridas`);

    seguraInyeccionHTML('val-horas-ocupadas', `${hOcupadas.toFixed(1)}h`);
    seguraInyeccionHTML('sub-capacidad-total', `de ${capTotal.toFixed(1)}h cap.`);

    seguraInyeccionHTML('val-horas-disponibles', `${hDisponibles.toFixed(1)}h`);
    seguraInyeccionHTML('sub-estado-disp', hOcupadas > capTotal ? '¡Exceso de carga!' : 'Horas libres');

    seguraInyeccionHTML('val-skus-totales', skus.toLocaleString());
    seguraInyeccionHTML('val-lpns-totales', lpns.toLocaleString());
    seguraInyeccionHTML('val-ocupacion', `${ocupacion}%`);

    renderMiniGauge(ocupacion);
}

function renderMiniGauge(valorOcupacion) {
    const ctx = document.getElementById('mini-gauge-chart')?.getContext('2d');
    if (!ctx) return;

    if (miniGaugeChart) miniGaugeChart.destroy();

    let gaugeColor = '#10B981';
    if (valorOcupacion > 80) gaugeColor = '#F59E0B';
    if (valorOcupacion > 100) gaugeColor = '#EF4444';

    miniGaugeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [Math.min(valorOcupacion, 100), Math.max(0, 100 - valorOcupacion)],
                backgroundColor: [gaugeColor, '#E2E8F0'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            cutout: '70%',
            plugins: {
                datalabels: { display: false },
                tooltip: { enabled: false },
                legend: { display: false }
            }
        }
    });
}

function actualizarTablaYContadores(recordsFinales) {
    seguraInyeccionHTML('table-counter', `${recordsFinales.length} / ${records_FilteredByHeader.length} Registros Futuros`);
    pintarTablaOperativa(recordsFinales);
}

function pintarTablaOperativa(records) {
    const tbody = document.querySelector('#data-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-td">No hay agendas planificadas para las fechas seleccionadas.</td></tr>`;
        return;
    }

    records.forEach(r => {
        const tr = document.createElement('tr');
        const fecha = r.fecha || '-';
        const prov = r.proveedor || '-';
        const h_inicio = r.hora_inicio ? r.hora_inicio.substring(0, 5) : '--:--';
        const h_fin = r.hora_fin ? r.hora_fin.substring(0, 5) : '--:--';
        const sku = r.cant_sku !== undefined ? r.cant_sku : 0;
        const lpn = r.cant_cajas !== undefined ? r.cant_cajas : 0;

        const rawOrigen = (r.tipo_destino || 'CDS').toUpperCase();
        const esFarmacia = rawOrigen === 'CDS';
        const textoOrigen = esFarmacia ? 'FARMACIA' : 'SALA';
        const claseBadge = esFarmacia ? 'farmacia' : 'sala';

        const estado = r.estado || 'Agendado';

        tr.innerHTML = `
            <td><strong>${fecha}</strong></td>
            <td>${prov}</td>
            <td>${h_inicio}</td>
            <td>${h_fin}</td>
            <td><strong>${sku.toLocaleString()}</strong></td>
            <td><strong>${lpn.toLocaleString()}</strong></td>
            <td><span class="origen-badge ${claseBadge}">${textoOrigen}</span></td>
            <td><span class="estado-badge ${estado.toLowerCase()}">${estado}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarGraficosDinamicamente(records) {
    const diasMap = {};
    records.forEach(r => {
        if (r.fecha) {
            if (!diasMap[r.fecha]) {
                diasMap[r.fecha] = { FARMACIA: 0, SALA: 0 };
            }
            const duracion = parseTimeToDecimal(r.hora_fin) - parseTimeToDecimal(r.hora_inicio);
            const origen = (r.tipo_destino || 'CDS').toUpperCase();
            if (duracion > 0) {
                if (origen === 'DP') diasMap[r.fecha].SALA += duracion;
                else diasMap[r.fecha].FARMACIA += duracion;
            }
        }
    });

    const diasLabelsOriginales = Object.keys(diasMap).sort();

    let labelsGrafico = [...diasLabelsOriginales];
    let dataFarmacia = [];
    let dataSala = [];
    let dataCapacidad = [];

    if (diasLabelsOriginales.length === 1) {
        const d = diasLabelsOriginales[0];
        const partes = d.split('-');
        labelsGrafico = [`${partes[2]}/${partes[1]} (Ini)`, `${partes[2]}/${partes[1]} (Fin)`];
        const valFarm = parseFloat(diasMap[d].FARMACIA.toFixed(1));
        const valSala = parseFloat(diasMap[d].SALA.toFixed(1));

        dataFarmacia = [valFarm, valFarm];
        dataSala = [valSala, valSala];
        dataCapacidad = [CAPACIDAD_FIJA_DIARIA, CAPACIDAD_FIJA_DIARIA];
    } else {
        labelsGrafico = diasLabelsOriginales.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });
        dataFarmacia = diasLabelsOriginales.map(d => parseFloat(diasMap[d].FARMACIA.toFixed(1)));
        dataSala = diasLabelsOriginales.map(d => parseFloat(diasMap[d].SALA.toFixed(1)));
        dataCapacidad = diasLabelsOriginales.map(() => CAPACIDAD_FIJA_DIARIA);
    }

    if (chartLinea) chartLinea.destroy();
    const ctxLinea = document.getElementById('chart-linea-historico')?.getContext('2d');

    if (ctxLinea) {
        chartLinea = new Chart(ctxLinea, {
            type: 'line',
            data: {
                labels: labelsGrafico,
                datasets: [
                    {
                        label: 'Capacidad Máxima (77h)',
                        data: dataCapacidad,
                        borderColor: '#EF4444',
                        backgroundColor: '#EF4444',
                        borderWidth: 2,
                        borderDash: [6, 6],
                        pointRadius: 0,
                        fill: false,
                        datalabels: { display: false }
                    },
                    {
                        label: 'FARMACIA (Celeste)',
                        data: dataFarmacia,
                        borderColor: '#00A3E0',
                        backgroundColor: 'rgba(0, 163, 224, 0.65)',
                        tension: 0.1,
                        fill: 'origin',
                        stack: 'carga',
                        datalabels: { display: false }
                    },
                    {
                        label: 'SALA (Naranja)',
                        data: dataSala,
                        borderColor: '#D97706',
                        backgroundColor: 'rgba(217, 119, 6, 0.65)',
                        tension: 0.1,
                        fill: '-1',
                        stack: 'carga',
                        datalabels: { display: false }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const labelOriginal = diasLabelsOriginales[index];
                        if (labelOriginal) {
                            const btnCoincidente = document.querySelector(`.btn-fecha-card[data-fecha="${labelOriginal}"]`);
                            seleccionarFechaFiltro(labelOriginal, btnCoincidente);
                        }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    datalabels: { display: false }
                },
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Horas Requeridas Acumuladas' }
                    }
                }
            }
        });
    }

    let totalHorasFarmacia = 0;
    let totalHorasSala = 0;
    records.forEach(r => {
        const origen = (r.tipo_destino || "CDS").toUpperCase();
        const duracion = parseTimeToDecimal(r.hora_fin) - parseTimeToDecimal(r.hora_inicio);
        if (duracion > 0) {
            if (origen === "DP") totalHorasSala += duracion;
            else totalHorasFarmacia += duracion;
        }
    });

    if (chartMedidor) chartMedidor.destroy();
    const ctxMedidor = document.getElementById('chart-medidor-almacen')?.getContext('2d');
    if (ctxMedidor) {
        chartMedidor = new Chart(ctxMedidor, {
            type: 'doughnut',
            data: {
                labels: [`FARMACIA`, `SALA`],
                datasets: [{
                    data: [totalHorasFarmacia, totalHorasSala],
                    backgroundColor: ['#00A3E0', '#D97706'],
                    borderWidth: 2,
                    borderColor: '#FFFFFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const origenClic = index === 0 ? 'CDS' : 'DP';

                        if (filtroOrigenGrafico === origenClic) {
                            filtroOrigenGrafico = null;
                        } else {
                            filtroOrigenGrafico = origenClic;
                        }
                        ejecutarFiltrosInternos();
                    } else {
                        filtroOrigenGrafico = null;
                        ejecutarFiltrosInternos();
                    }
                },
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        color: '#FFFFFF',
                        font: { size: 15, weight: 'bold' },
                        formatter: (value, context) => {
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = parseFloat(((value / total) * 100).toFixed(1));
                            return percentage > 5 ? `${percentage}%` : '';
                        }
                    }
                }
            }
        });
    }

    const arrFarmacia = [];
    const arrSala = [];
    const arrSobrante = [];
    const arrExceso = [];

    diasLabelsOriginales.forEach(d => {
        const hFarm = diasMap[d].FARMACIA;
        const hSala = diasMap[d].SALA;
        const hTotal = hFarm + hSala;

        arrFarmacia.push(parseFloat(hFarm.toFixed(1)));
        arrSala.push(parseFloat(hSala.toFixed(1)));

        if (hTotal <= CAPACIDAD_FIJA_DIARIA) {
            arrSobrante.push(parseFloat((CAPACIDAD_FIJA_DIARIA - hTotal).toFixed(1)));
            arrExceso.push(0);
        } else {
            arrSobrante.push(0);
            arrExceso.push(parseFloat((hTotal - CAPACIDAD_FIJA_DIARIA).toFixed(1)));
        }
    });

    if (chartSobrecapacidad) chartSobrecapacidad.destroy();
    const ctxSobrecapacidad = document.getElementById('chart-barras-sobrecapacidad')?.getContext('2d');
    if (ctxSobrecapacidad) {
        chartSobrecapacidad = new Chart(ctxSobrecapacidad, {
            type: 'bar',
            data: {
                labels: diasLabelsOriginales.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; }),
                datasets: [
                    { label: 'FARMACIA', data: arrFarmacia, backgroundColor: '#00A3E0' },
                    { label: 'SALA', data: arrSala, backgroundColor: '#D97706' },
                    { label: 'HORAS LIBRES', data: arrSobrante, backgroundColor: '#10B981' },
                    { label: 'SOBRECAPACIDAD', data: arrExceso, backgroundColor: '#EF4444' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const fechaClic = diasLabelsOriginales[index];
                        if (fechaClic) {
                            const btnCoincidente = document.querySelector(`.btn-fecha-card[data-fecha="${fechaClic}"]`);
                            seleccionarFechaFiltro(fechaClic, btnCoincidente);
                        }
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: { display: true, text: 'Horas Totales' }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                    datalabels: {
                        color: '#FFFFFF',
                        font: { size: 12, weight: 'bold' },
                        formatter: (val) => (val > 2 ? `${val}h` : '')
                    }
                }
            }
        });
    }
}

function resetearTodosLosFiltros() {
    filtroOrigenGrafico = null;
    fechaSeleccionadaQuick = null;
    const inputSearch = document.getElementById('input-search-prov');
    if (inputSearch) inputSearch.value = "";
    document.querySelectorAll('.btn-fecha-card').forEach(b => b.classList.remove('active-filter'));
    ejecutarFiltrosCombinados();
}

function toggleExpansionGrafico() {
    const chartsRow = document.getElementById('chartsRow');
    const mainChartBox = document.getElementById('mainChartBox');
    const sideChartGauge = document.getElementById('sideChartGauge');
    const sideChartProvider = document.getElementById('sideChartProvider');
    const expandBtnIcon = document.querySelector('#btnExpandChart i');

    if (mainChartBox.classList.contains('expanded-full')) {
        mainChartBox.classList.remove('expanded-full');
        sideChartGauge.style.display = 'block';
        sideChartProvider.style.display = 'block';
        chartsRow.classList.remove('expanded-row-grid');
        expandBtnIcon.className = 'fa-solid fa-expand';
    } else {
        mainChartBox.classList.add('expanded-full');
        sideChartGauge.style.display = 'none';
        sideChartProvider.style.display = 'none';
        chartsRow.classList.add('expanded-row-grid');
        expandBtnIcon.className = 'fa-solid fa-compress';
    }
}

function cerrarTodosLosPopovers() {
    document.querySelectorAll('.popover-content').forEach(el => {
        el.classList.remove('show');
    });
}

function seguraInyeccionHTML(id, contenido) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = contenido;
}

function actualizarMensajeTabla(mensaje) {
    seguraInyeccionHTML('status-message', mensaje);
}

function loadFallbackData() {
    totalRecords_Raw = [
        { id_cita: 101, fecha: "2026-07-22", proveedor: "ELITE BRANDS S.R.L.", puerta: "Puerta 1", hora_inicio: "08:30:00", hora_fin: "17:30:00", cant_sku: 131, cant_cajas: 221, personal_requerido: 2, estado: "Agendado", tipo_destino: "CDS" },
        { id_cita: 102, fecha: "2026-07-22", proveedor: "BELLCOS BOLIVIA SA.", puerta: "Puerta 2", hora_inicio: "08:30:00", hora_fin: "17:30:00", cant_sku: 218, cant_cajas: 734, personal_requerido: 3, estado: "Agendado", tipo_destino: "CDS" },
        { id_cita: 103, fecha: "2026-07-23", proveedor: "SADIMEX S.R.L.", puerta: "Puerta 1", hora_inicio: "08:30:00", hora_fin: "10:00:00", cant_sku: 3, cant_cajas: 23, personal_requerido: 1, estado: "Agendado", tipo_destino: "DP" },
        { id_cita: 104, fecha: "2026-07-24", proveedor: "IMPORTADORA LOG...", puerta: "Puerta 3", hora_inicio: "09:00:00", hora_fin: "14:00:00", cant_sku: 50, cant_cajas: 150, personal_requerido: 2, estado: "Agendado", tipo_destino: "CDS" }
    ];
    generarBotonesFechasDinámicos(totalRecords_Raw);
    ejecutarFiltrosCombinados();
}

window.evtToggleSubmenu = function (event) {
    event.preventDefault();
    event.stopPropagation();
    const currentGroup = event.currentTarget.closest('.menu-item-group');
    document.querySelectorAll('.menu-item-group').forEach(group => {
        if (group !== currentGroup) group.classList.remove('open');
    });
    if (currentGroup) currentGroup.classList.toggle('open');
};
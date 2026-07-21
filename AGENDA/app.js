const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0";

let supabaseClient = null;
let totalRecords_Raw = [];
let records_FilteredByHeader = [];

let chartLinea = null;
let chartMedidor = null;
let chartHorasProv = null;

let filtroOrigenGrafico = null;
let filtroProveedorGrafico = null;

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
            loadFallbackData();
        }
    } catch (error) {
        loadFallbackData();
    }

    const btnLimpiarAll = document.getElementById('btn-clear-filters');
    if (btnLimpiarAll) {
        btnLimpiarAll.addEventListener('click', resetearTodosLosFiltros);
    }

    window.addEventListener('click', (e) => {
        if (!e.target.matches('.dropdown-btn') && !e.target.closest('.dropdown-content-list') && !e.target.closest('.filter-icon') && !e.target.closest('.popover-content')) {
            cerrarTodosLosDropdowns();
            cerrarTodosLosPopovers();
        }
    });

    document.querySelectorAll('.filter-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = icon.getAttribute('data-popover');
            const popover = document.getElementById(targetId);
            const wasVisible = popover.classList.contains('show');

            cerrarTodosLosPopovers();
            if (!wasVisible) {
                popover.classList.add('show');
            }
        });
    });
});

async function descargarTodosLosDatosSupabase() {
    actualizarMensajeTabla("Estableciendo enlace de alta velocidad con Supabase...");
    try {
        if (!supabaseClient) throw new Error("Cliente de Supabase no inicializado.");

        let todosLosDatos = [];
        let desde = 0;
        const paso = 1000;
        let trayendo = true;

        while (trayendo) {
            actualizarMensajeTabla(`Descargando registros ${desde} a ${desde + paso}...`);
            const { data, error } = await supabaseClient
                .from('agenda_b100')
                .select('id_cita, fecha, proveedor, puerta, hora_inicio, hora_fin, cant_sku, cant_cajas, personal_requerido, estado, tipo_destino')
                .range(desde, desde + paso - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                todosLosDatos = todosLosDatos.concat(data);
                desde += paso;
            } else {
                trayendo = false;
            }

            if (data.length < paso) {
                trayendo = false;
            }
        }

        totalRecords_Raw = todosLosDatos;
        actualizarMensajeTabla(`Sincronización completa: ${totalRecords_Raw.length} registros cargados.`);

        poblarDropdownsDeFiltros(totalRecords_Raw);
        ejecutarFiltrosCombinados();

    } catch (err) {
        actualizarMensajeTabla(`Fallo de conexión: ${err.message}. Cargando modo demostrativo...`);
        loadFallbackData();
    }
}

function poblarDropdownsDeFiltros(data) {
    if (!data || data.length === 0) return;

    const aniosMap = data.map(r => r.fecha ? r.fecha.substring(0, 4) : null).filter(Boolean);
    const aniosUnicos = [...new Set(aniosMap)].sort((a, b) => b - a);

    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mesesMap = data.map(r => r.fecha ? parseInt(r.fecha.substring(5, 7)) : null).filter(Boolean);
    const mesesUnicos = [...new Set(mesesMap)].sort((a, b) => a - b);

    const semanasUnicas = ["1", "2", "3", "4", "5"];

    inyectarCheckboxes('drop-ano', 'chk-ano', aniosUnicos, true);
    inyectarCheckboxes('drop-mes', 'chk-mes', mesesUnicos.map(m => { return { val: m.toString().padStart(2, '0'), label: nombresMeses[m - 1] } }), true, true);
    inyectarCheckboxes('drop-semana', 'chk-semana', semanasUnicas, true);

    inyectarCheckboxes('popover-mes-tabla-content', 'chk-tbl-mes', mesesUnicos.map(m => { return { val: m.toString().padStart(2, '0'), label: nombresMeses[m - 1] } }), true, true);
}

function inyectarCheckboxes(containerId, claseCheck, items, checkedDefault, isMesComplex = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const toggleBtn = container.querySelector('.btn-toggle-all');
    container.innerHTML = '';
    if (toggleBtn) container.appendChild(toggleBtn);

    items.forEach(item => {
        const val = isMesComplex ? item.val : item;
        const labelText = isMesComplex ? item.label : item;

        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" value="${val}" class="${claseCheck}" ${checkedDefault ? 'checked' : ''} onchange="ejecutarFiltrosCombinados()">
            ${labelText}
        `;
        container.appendChild(label);
    });
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
    const aniosSel = obtenerValoresChecks('chk-ano');
    const mesesSel = obtenerValoresChecks('chk-mes');
    const semanasSel = obtenerValoresChecks('chk-semana');

    records_FilteredByHeader = totalRecords_Raw.filter(r => {
        if (!r.fecha) return false;
        const partes = r.fecha.split('-');
        const anioRow = partes[0];
        const mesRow = partes[1];
        const diaRow = parseInt(partes[2]);
        const semanaRow = Math.ceil(diaRow / 7).toString();

        const matchAnio = aniosSel.length === 0 || aniosSel.includes(anioRow);
        const matchMes = mesesSel.length === 0 || mesesSel.includes(mesRow);
        const matchSemana = semanasSel.length === 0 || semanasSel.includes(semanaRow);

        return matchAnio && matchMes && matchSemana;
    });

    ejecutarFiltrosInternos();
}

let ordenSkuActual = null;
let ordenLpnActual = null;

function ejecutarFiltrosInternos() {
    const buscadorProv = (document.getElementById('input-search-prov')?.value || "").toLowerCase().trim();
    const origenesSel = obtenerValoresChecks('chk-origen');
    const estadosSel = obtenerValoresChecks('chk-estado');
    const mesesTablaSel = obtenerValoresChecks('chk-tbl-mes');

    let recordsFinales = records_FilteredByHeader.filter(r => {
        if (!r.fecha) return false;
        const mesRow = r.fecha.split('-')[1];

        const r_origen = r.tipo_destino || "CDS";
        const r_prov = r.proveedor || "";

        const matchBuscador = buscadorProv === "" || r_prov.toLowerCase().includes(buscadorProv);
        const matchOrigen = origenesSel.length === 0 || origenesSel.includes(r_origen);
        const matchEstado = estadosSel.length === 0 || estadosSel.includes(r.estado || "Agendado");
        const matchMesTabla = mesesTablaSel.length === 0 || mesesTablaSel.includes(mesRow);

        const matchFiltroOrigenGrafico = !filtroOrigenGrafico || r_origen === filtroOrigenGrafico;
        const matchFiltroProveedorGrafico = !filtroProveedorGrafico || r_prov === filtroProveedorGrafico;

        return matchBuscador && matchOrigen && matchEstado && matchMesTabla && matchFiltroOrigenGrafico && matchFiltroProveedorGrafico;
    });

    if (ordenSkuActual === 'desc') {
        recordsFinales.sort((a, b) => (b.cant_sku || 0) - (a.cant_sku || 0));
    } else if (ordenSkuActual === 'asc') {
        recordsFinales.sort((a, b) => (a.cant_sku || 0) - (b.cant_sku || 0));
    }

    if (ordenLpnActual === 'desc') {
        recordsFinales.sort((a, b) => (b.cant_cajas || 0) - (a.cant_cajas || 0));
    } else if (ordenLpnActual === 'asc') {
        recordsFinales.sort((a, b) => (a.cant_cajas || 0) - (b.cant_cajas || 0));
    }

    const badgeStatus = document.getElementById('active-graph-filters');
    if (badgeStatus) {
        if (filtroOrigenGrafico || filtroProveedorGrafico) {
            badgeStatus.style.display = 'inline-block';
            let labelText = "Filtro gráfico: ";
            if (filtroOrigenGrafico) labelText += `[Origen: ${filtroOrigenGrafico}] `;
            if (filtroProveedorGrafico) labelText += `[Prov: ${filtroProveedorGrafico.substring(0, 10)}...]`;
            badgeStatus.innerHTML = `<i class="fa-solid fa-filter"></i> ${labelText}`;
        } else {
            badgeStatus.style.display = 'none';
        }
    }

    calcularYMostrarKPIs_DAX(recordsFinales);
    actualizarTablaYContadores(recordsFinales);
    renderizarGraficosDinamicamente(recordsFinales);
}

function alternarOrdenSku() {
    ordenLpnActual = null;
    ordenSkuActual = (!ordenSkuActual || ordenSkuActual === 'asc') ? 'desc' : 'asc';
    ejecutarFiltrosInternos();
}

function alternarOrdenLpn() {
    ordenSkuActual = null;
    ordenLpnActual = (!ordenLpnActual || ordenLpnActual === 'asc') ? 'desc' : 'asc';
    ejecutarFiltrosInternos();
}

function obtenerValoresChecks(clase) {
    return Array.from(document.querySelectorAll(`.${clase}:checked`)).map(cb => cb.value);
}

function calcularYMostrarKPIs_DAX(dataContext) {
    if (!dataContext || dataContext.length === 0) {
        actualizarVistasKPI(0, 0, 0, 0, 0);
        return;
    }

    const proveedoresValidos = dataContext.map(r => r.proveedor).filter(Boolean);
    const totalProveedores = [...new Set(proveedoresValidos)].length;

    let horasPlanificadas = 0;
    let horasEjecutadas = 0;
    let citasCompletadas = 0;
    const fechasConMovimiento = new Set();

    dataContext.forEach(r => {
        const duracion = parseTimeToDecimal(r.hora_fin) - parseTimeToDecimal(r.hora_inicio);
        if (duracion > 0) {
            horasPlanificadas += duracion;
            if (r.fecha) fechasConMovimiento.add(r.fecha);

            if (r.estado === "Recepcionado" || r.estado === "Finalizado") {
                horasEjecutadas += duracion;
                citasCompletadas++;
            }
        }
    });

    const cumplimientoPorcentaje = dataContext.length > 0
        ? Math.round((citasCompletadas / dataContext.length) * 100)
        : 0;

    const diasConMovimiento = fechasConMovimiento.size || 1;
    const capacidadTotalPeriodo = diasConMovimiento * CAPACIDAD_FIJA_DIARIA;
    const ocupacionPorcentaje = Math.min(Math.round((horasPlanificadas / capacidadTotalPeriodo) * 100), 100);

    actualizarVistasKPI(totalProveedores, horasPlanificadas, horasEjecutadas, cumplimientoPorcentaje, ocupacionPorcentaje);
}

function actualizarVistasKPI(prov, hPlan, hEjec, cumplimiento, ocupacion) {
    seguraInyeccionHTML('val-prov-total', prov.toLocaleString());
    seguraInyeccionHTML('val-horas-plan', `${hPlan.toFixed(1)}h`);
    seguraInyeccionHTML('val-horas-ejec', `${hEjec.toFixed(1)}h`);
    seguraInyeccionHTML('val-cumplimiento', `${cumplimiento}%`);
    seguraInyeccionHTML('val-ocupacion', `${ocupacion}%`);
}

function actualizarTablaYContadores(recordsFinales) {
    seguraInyeccionHTML('table-counter', `${recordsFinales.length} / ${records_FilteredByHeader.length} Registros`);
    pintarTablaOperativa(recordsFinales);
}

function pintarTablaOperativa(records) {
    const tbody = document.querySelector('#data-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-td">No se encontraron registros activos.</td></tr>`;
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
        const origen = r.tipo_destino || 'CDS';
        const estado = r.estado || 'Agendado';

        tr.innerHTML = `
            <td><strong>${fecha}</strong></td>
            <td>${prov}</td>
            <td>${h_inicio}</td>
            <td>${h_fin}</td>
            <td><strong>${sku.toLocaleString()}</strong></td>
            <td><strong>${lpn.toLocaleString()}</strong></td>
            <td><span class="origen-badge">${origen}</span></td>
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
                diasMap[r.fecha] = { planificadas: 0, ejecutadas: 0 };
            }
            const duracion = parseTimeToDecimal(r.hora_fin) - parseTimeToDecimal(r.hora_inicio);
            if (duracion > 0) {
                diasMap[r.fecha].planificadas += duracion;
                if (r.estado === "Recepcionado" || r.estado === "Finalizado") {
                    diasMap[r.fecha].ejecutadas += duracion;
                }
            }
        }
    });

    const diasLabels = Object.keys(diasMap).sort();
    const dataCapacidad = diasLabels.map(() => CAPACIDAD_FIJA_DIARIA);
    const dataPlanificadas = diasLabels.map(lbl => parseFloat(diasMap[lbl].planificadas.toFixed(1)));
    const dataEjecutadas = diasLabels.map(lbl => parseFloat(diasMap[lbl].ejecutadas.toFixed(1)));

    if (chartLinea) chartLinea.destroy();
    const ctxLinea = document.getElementById('chart-linea-historico')?.getContext('2d');
    if (ctxLinea) {
        chartLinea = new Chart(ctxLinea, {
            type: 'line',
            data: {
                labels: diasLabels,
                datasets: [
                    {
                        label: 'Capacidad Fija (77h)',
                        data: dataCapacidad,
                        borderColor: '#EF4444',
                        borderWidth: 2,
                        borderDash: [6, 6],
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'Horas Planificadas',
                        data: dataPlanificadas,
                        borderColor: '#00A3E0',
                        backgroundColor: 'rgba(0, 163, 224, 0.05)',
                        tension: 0.25,
                        fill: true
                    },
                    {
                        label: 'Horas Ejecutadas',
                        data: dataEjecutadas,
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        tension: 0.25,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Horas Operacionales' }
                    }
                }
            }
        });
    }

    let totalCDS = 0;
    let totalDP = 0;
    records.forEach(r => {
        if ((r.tipo_destino || "CDS") === "CDS") totalCDS++;
        else totalDP++;
    });
    const totalVisitas = totalCDS + totalDP || 1;
    const pctCDS = Math.round((totalCDS / totalVisitas) * 100);
    const pctDP = Math.round((totalDP / totalVisitas) * 100);

    if (chartMedidor) chartMedidor.destroy();
    const ctxMedidor = document.getElementById('chart-medidor-almacen')?.getContext('2d');
    if (ctxMedidor) {
        chartMedidor = new Chart(ctxMedidor, {
            type: 'doughnut',
            data: {
                labels: [`CDS (${pctCDS}%)`, `DP (${pctDP}%)`],
                datasets: [{
                    data: [totalCDS, totalDP],
                    backgroundColor: [
                        filtroOrigenGrafico === 'DP' ? 'rgba(0, 163, 224, 0.15)' : '#00A3E0',
                        filtroOrigenGrafico === 'CDS' ? 'rgba(10, 37, 64, 0.15)' : '#0A2540'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                rotation: -90,
                circumference: 180,
                plugins: {
                    legend: { position: 'bottom' }
                },
                onClick: (e, activeElements) => {
                    if (activeElements && activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const labelSeleccionado = index === 0 ? "CDS" : "DP";

                        if (filtroOrigenGrafico === labelSeleccionado) {
                            filtroOrigenGrafico = null;
                        } else {
                            filtroOrigenGrafico = labelSeleccionado;
                        }
                        ejecutarFiltrosInternos();
                    } else {
                        filtroOrigenGrafico = null;
                        ejecutarFiltrosInternos();
                    }
                }
            }
        });
    }

    const provHorasMap = {};
    records.forEach(r => {
        if (r.proveedor) {
            const duracion = parseTimeToDecimal(r.hora_fin) - parseTimeToDecimal(r.hora_inicio);
            if (duracion > 0) {
                provHorasMap[r.proveedor] = (provHorasMap[r.proveedor] || 0) + duracion;
            }
        }
    });

    const proveedoresOrdenados = Object.keys(provHorasMap)
        .map(prov => ({ prov, horas: provHorasMap[prov] }))
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 5);

    if (chartHorasProv) chartHorasProv.destroy();
    const ctxHorasProv = document.getElementById('chart-barras-proveedor')?.getContext('2d');
    if (ctxHorasProv) {
        chartHorasProv = new Chart(ctxHorasProv, {
            type: 'bar',
            data: {
                labels: proveedoresOrdenados.map(item => item.prov.substring(0, 15) + '...'),
                datasets: [{
                    label: 'Horas Totales',
                    data: proveedoresOrdenados.map(item => parseFloat(item.horas.toFixed(1))),
                    backgroundColor: proveedoresOrdenados.map(item =>
                        filtroProveedorGrafico && filtroProveedorGrafico !== item.prov
                            ? 'rgba(0, 163, 224, 0.15)'
                            : '#00A3E0'
                    ),
                    borderRadius: 4
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
                    x: { grid: { display: false } },
                    y: { grid: { display: false } }
                },
                onClick: (e, activeElements) => {
                    if (activeElements && activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const proveedorSeleccionado = proveedoresOrdenados[index].prov;

                        if (filtroProveedorGrafico === proveedorSeleccionado) {
                            filtroProveedorGrafico = null;
                        } else {
                            filtroProveedorGrafico = proveedorSeleccionado;
                        }
                        ejecutarFiltrosInternos();
                    } else {
                        filtroProveedorGrafico = null;
                        ejecutarFiltrosInternos();
                    }
                }
            }
        });
    }
}

function resetearTodosLosFiltros() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    const buscador = document.getElementById('input-search-prov');
    if (buscador) buscador.value = "";

    document.querySelectorAll('.btn-toggle-all').forEach(btn => {
        btn.innerText = "Desmarcar todo";
    });

    ordenSkuActual = null;
    ordenLpnActual = null;
    filtroOrigenGrafico = null;
    filtroProveedorGrafico = null;

    ejecutarFiltrosCombinados();
}

function alternarSeleccionRapida(claseCheckboxes, buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const checkboxes = document.querySelectorAll(`.${claseCheckboxes}`);
    const algunoDesmarcado = Array.from(checkboxes).some(cb => !cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = algunoDesmarcado;
    });

    btn.innerText = algunoDesmarcado ? "Desmarcar todo" : "Seleccionar todo";
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

function toggleDropdownMenu(id) {
    const element = document.getElementById(id);
    const wasOpen = element.classList.contains('open');
    cerrarTodosLosDropdowns();
    if (!wasOpen) {
        element.style.display = 'flex';
        element.classList.add('open');
    }
}

function cerrarTodosLosDropdowns() {
    document.querySelectorAll('.dropdown-content-list').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('open');
    });
}

function cerrarTodosLosPopovers() {
    document.querySelectorAll('.popover-content').forEach(el => {
        el.classList.remove('show');
    });
}

function manejarCambioFechaSuperior() {
    ejecutarFiltrosCombinados();
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
        { id_cita: 101, fecha: "2026-04-27", proveedor: "CAMSA S.A.", puerta: "Puerta 1", hora_inicio: "08:30:00", hora_fin: "14:30:00", cant_sku: 37, cant_cajas: 40, personal_requerido: 1, estado: "Agendado", tipo_destino: "CDS" },
        { id_cita: 102, fecha: "2026-04-01", proveedor: "ELITE BRANDS S.R.L.", puerta: "Puerta 2", hora_inicio: "08:00:00", hora_fin: "17:30:00", cant_sku: 328, cant_cajas: 210, personal_requerido: 2, estado: "Recepcionado", tipo_destino: "CDS" }
    ];
    poblarDropdownsDeFiltros(totalRecords_Raw);
    ejecutarFiltrosCombinados();
}
// Función idéntica al Centro de Control para desplegar los submenús
window.evtToggleSubmenu = function (event) {
    event.preventDefault(); // Evita cualquier comportamiento de navegación
    event.stopPropagation(); // Evita que el click se propague a otros elementos

    // Conseguimos el contenedor del grupo ('menu-item-group')
    const currentGroup = event.currentTarget.closest('.menu-item-group');

    // Cierra los otros menús abiertos para que actúe como acordeón (opcional, igual al portal)
    document.querySelectorAll('.menu-item-group').forEach(group => {
        if (group !== currentGroup) {
            group.classList.remove('open');
        }
    });

    // Alterna la clase 'open' en el menú al que le hiciste click
    if (currentGroup) {
        currentGroup.classList.toggle('open');
    }
};
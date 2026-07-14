const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let dataTotalBase = [];
let ordenColumna = null;
let ordenAscendente = true;

let chartLinea = null, chartDona = null, chartBarras = null;

// Variables de control exclusivo para la función "Toggle" (on/off) de los gráficos interactivos
let ultimoTipoSeleccionado = null;
let ultimoOrigenSeleccionado = null;

// Objeto para conservar estados de análisis interactivos calculados por el motor diario
let mapaDetallesPorDia = {};

// CONTROL EXCLUSIVO: Manejo total de cierres automáticos de Dropdowns superiores y Popovers
document.addEventListener('click', function (event) {
    // 1. Alternar y cerrar menús flotantes internos de la tabla
    const popoverContainer = event.target.closest('.search-popover-container');
    const filterIcon = event.target.closest('.filter-icon');

    if (!popoverContainer) {
        document.querySelectorAll('.popover-content').forEach(p => p.classList.remove('show'));
    } else if (filterIcon) {
        const targetId = filterIcon.getAttribute('data-popover');
        const targetPopover = document.getElementById(targetId);
        const isOpen = targetPopover.classList.contains('show');

        document.querySelectorAll('.popover-content').forEach(p => p.classList.remove('show'));
        if (!isOpen) targetPopover.classList.add('show');
        event.stopPropagation();
    }

    // 2. Alternar y cerrar dropdowns de fechas superiores (Año, Mes, Semana)
    const dropdownContainer = event.target.closest('.dropdown-container');
    if (!dropdownContainer) {
        document.querySelectorAll('.dropdown-content-list').forEach(d => d.classList.remove('open'));
    }
});

// Prevenir el cierre abrupto al seleccionar checkboxes dentro de cualquier menú
document.querySelectorAll('.popover-content, .dropdown-content-list').forEach(elem => {
    elem.addEventListener('click', (e) => e.stopPropagation());
});

// MECANISMO DE CONTROL SIDEBAR (OCULTAR / MOSTRAR)
document.getElementById('btn-toggle-sidebar').addEventListener('click', function () {
    const sidebar = document.getElementById('sidebarMenu');
    sidebar.classList.toggle('hidden');
});

// ALIMENTAR Y SINCRONIZAR DATOS DESDE EL ENTRORNO SUPABASE
async function inicializarDashboard() {
    const tbody = document.querySelector('#data-table tbody');
    tbody.innerHTML = `<tr><td colspan="8" class="loading-td"><i class="fa-solid fa-sync fa-spin"></i> Cargando base de datos logística...</td></tr>`;

    try {
        let desdeFila = 0, tamanoPagina = 1000, consultando = true;
        dataTotalBase = [];

        while (consultando) {
            const { data, error } = await _supabase
                .from('historico_recepcion')
                .select('*')
                .range(desdeFila, desdeFila + tamanoPagina - 1);

            if (error) throw error;
            if (data && data.length > 0) {
                dataTotalBase = dataTotalBase.concat(data);
                desdeFila += tamanoPagina;
            } else { consultando = false; }
            if (data.length < tamanoPagina) consultando = false;
        }

        construirFiltroFechasAgrupadoTabla();
        calcularSemanasDinamicasPorMes(); // Correlación inicial
        ejecutarFiltrosInternos();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="8" class="loading-td" style="color:red;">⚠️ Error de Conexión: ${err.message}</td></tr>`;
    }
}

// CONTROLADOR DE LLAMADO EXCLUSIVO PARA LOS DROPDOWNS SUPERIORES
function toggleDropdownMenu(id) {
    const menu = document.getElementById(id);
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.dropdown-content-list').forEach(d => d.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
}

// FUNCIÓN SUTIL PARA MARCAR / DESMARCAR TODO MEDIANTE UN ENLACE PEQUEÑO
function alternarSeleccionGrupo(claseCheckboxes, elementoBoton) {
    const checkboxes = document.querySelectorAll(`.${claseCheckboxes}`);
    const todosMarcados = Array.from(checkboxes).every(chk => chk.checked);

    checkboxes.forEach(chk => {
        chk.checked = !todosMarcados;
    });

    elementoBoton.innerText = todosMarcados ? "Seleccionar todo" : "Desmarcar todo";

    if (claseCheckboxes === 'chk-header-mes') {
        calcularSemanasDinamicasPorMes();
    }
    ejecutarFiltrosInternos();
}

// CORRELACIÓN EXACTA: Calcular y dibujar semanas en base a la cantidad de meses tildados
function calcularSemanasDinamicasPorMes() {
    const mesesTildados = Array.from(document.querySelectorAll('.chk-header-mes:checked')).map(c => parseInt(c.value));
    const contenedorSemana = document.getElementById('drop-semana');
    contenedorSemana.innerHTML = '';

    // Botón sutil e inteligente para la Semana
    let btnMaster = document.createElement('button');
    btnMaster.className = "btn-toggle-all";
    btnMaster.innerText = "Desmarcar todo";
    btnMaster.onclick = () => alternarSeleccionGrupo('chk-header-semana', btnMaster);
    contenedorSemana.appendChild(btnMaster);

    let maxSemanas = 4;
    const mesesLargos = [1, 3, 5, 7, 8, 10, 12];
    let tieneMesLargo = mesesTildados.some(m => mesesLargos.includes(m));
    if (tieneMesLargo || mesesTildados.length > 1) {
        maxSemanas = 5;
    }

    for (let i = 1; i <= maxSemanas; i++) {
        let label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${i}" class="chk-header-semana" checked onchange="ejecutarFiltrosInternos()"> Semana ${i}`;
        contenedorSemana.appendChild(label);
    }
}

function manejarCambioFechaSuperior() {
    calcularSemanasDinamicasPorMes();
    ejecutarFiltrosInternos();
}

function construirFiltroFechasAgrupadoTabla() {
    const contenedor = document.getElementById('popover-fecha');
    let fechasUnicas = [...new Set(dataTotalBase.map(f => f["Fecha de Agenda"]))].filter(Boolean).sort();

    // Botón sutil e inteligente para Fecha de Agenda
    let html = `<button class="btn-toggle-all" onclick="alternarSeleccionGrupo('chk-fecha', this)">Desmarcar todo</button>`;
    let mesesAgrupados = {};

    fechasUnicas.forEach(fecha => {
        let mes = fecha.substring(5, 7);
        let nombreMes = obtenerNombreMes(mes);
        if (!mesesAgrupados[nombreMes]) mesesAgrupados[nombreMes] = [];
        mesesAgrupados[nombreMes].push(fecha);
    });

    for (let mes in mesesAgrupados) {
        html += `<div style="margin-top:6px; font-weight:700; color:#0A2540; font-size:11px;">${mes}</div>`;
        mesesAgrupados[mes].forEach(f => {
            html += `<label style="padding-left:10px;"><input type="checkbox" value="${f}" class="chk-fecha" checked onchange="ejecutarFiltrosInternos()"> ${f.substring(8, 10)}</label>`;
        });
    }
    contenedor.innerHTML = html;
}

function obtenerNombreMes(numMes) {
    const meses = { "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre" };
    return meses[numMes] || "Otros";
}

// MOTOR CENTRAL DE FILTRADO CRUZADO MULTISELECCIONABLE
function ejecutarFiltrosInternos() {
    const anosValidos = Array.from(document.querySelectorAll('.chk-header-ano:checked')).map(c => c.value);
    const mesesValidos = Array.from(document.querySelectorAll('.chk-header-mes:checked')).map(c => c.value);
    const semanasValidas = Array.from(document.querySelectorAll('.chk-header-semana:checked')).map(c => parseInt(c.value));

    const buscarAsn = document.getElementById('input-search-asn').value.toLowerCase();
    const buscarProv = document.getElementById('input-search-prov').value.toLowerCase();
    const buscarOc = document.getElementById('input-search-oc').value.toLowerCase();

    const tiposValidos = Array.from(document.querySelectorAll('.chk-tipo:checked')).map(c => c.value);
    const origenesValidos = Array.from(document.querySelectorAll('.chk-origen:checked')).map(c => c.value);
    const fechasValidas = Array.from(document.querySelectorAll('.chk-fecha:checked')).map(c => c.value);

    const datosFiltrados = dataTotalBase.filter(fila => {
        let fAgenda = fila["Fecha de Agenda"] || "";
        if (!fAgenda) return false;

        let anoFila = fAgenda.substring(0, 4);
        let mesFila = fAgenda.substring(5, 7);
        let diaFila = parseInt(fAgenda.substring(8, 10)) || 1;

        let semanaCalculada = Math.ceil(diaFila / 7);
        if (semanaCalculada > 5) semanaCalculada = 5;

        if (anosValidos.length > 0 && !anosValidos.includes(anoFila)) return false;
        if (mesesValidos.length > 0 && !mesesValidos.includes(mesFila)) return false;
        if (semanasValidas.length > 0 && !semanasValidas.includes(semanaCalculada)) return false;

        if (buscarAsn && !(fila["Nro ASN"] || "").toLowerCase().includes(buscarAsn)) return false;
        if (buscarProv && !(fila["Nombre de proveedor"] || "").toLowerCase().includes(buscarProv)) return false;
        if (buscarOc && !(fila["Números de OC"] || "").toLowerCase().includes(buscarOc)) return false;

        if (!tiposValidos.includes(fila["Tipo ASN"])) return false;
        if (!origenesValidos.includes(fila["Informacion de origen"])) return false;
        if (fechasValidas.length > 0 && !fechasValidas.includes(fAgenda)) return false;

        return true;
    });

    if (ordenColumna) {
        datosFiltrados.sort((a, b) => {
            let valA = parseInt(a[ordenColumna]) || 0;
            let valB = parseInt(b[ordenColumna]) || 0;
            return ordenAscendente ? valA - valB : valB - valA;
        });
    }

    renderizarComponentesVisuales(datosFiltrados);
}

function renderizarComponentesVisuales(datos) {
    let totalAsns = datos.length, totalLpns = 0, totalSkus = 0;
    let proveedoresUnicos = new Set();
    let conteoTipos = { "EC": 0, "ET": 0, "RF": 0 };
    let conteoOrigen = { "CDS": 0, "DP": 0 };

    mapaDetallesPorDia = {};

    datos.forEach(fila => {
        let lpns = parseInt(fila["Nro LPN"]) || 0;
        let skus = parseInt(fila["Número de artículos"]) || 0;
        let prov = fila["Nombre de proveedor"] || "";

        totalLpns += lpns;
        totalSkus += skus;
        if (prov) proveedoresUnicos.add(prov);

        let tipo = fila["Tipo ASN"] || "EC";
        if (conteoTipos[tipo] !== undefined) conteoTipos[tipo] += lpns;

        let orig = fila["Informacion de origen"] || "CDS";
        if (conteoOrigen[orig] !== undefined) conteoOrigen[orig] += lpns;

        let f = fila["Fecha de Agenda"] || "Sin Fecha";
        if (!mapaDetallesPorDia[f]) {
            mapaDetallesPorDia[f] = { lpns: 0, skus: 0, provs: new Set() };
        }
        mapaDetallesPorDia[f].lpns += lpns;
        mapaDetallesPorDia[f].skus += skus;
        if (prov) mapaDetallesPorDia[f].provs.add(prov);
    });

    document.getElementById('val-total-asn').innerText = totalAsns.toLocaleString();
    document.getElementById('val-lpn-plan').innerText = totalLpns.toLocaleString();
    document.getElementById('val-sku-total').innerText = totalSkus.toLocaleString();
    document.getElementById('val-prov-total').innerText = proveedoresUnicos.size.toLocaleString();
    document.getElementById('table-counter').innerText = `${totalAsns} / ${dataTotalBase.length} Registros`;
    document.getElementById('doughnut-center-text').innerText = totalLpns.toLocaleString();

    generarGraficoLinea();
    generarGraficoDona(conteoTipos);
    generarGraficoBarrasFijasConNumerosArriba(conteoOrigen);
    construirTablaHTML(datos);
}

function generarGraficoLinea() {
    const ctx = document.getElementById('chart-linea-historico').getContext('2d');
    const fechasOrdenadas = Object.keys(mapaDetallesPorDia).sort();
    if (chartLinea) chartLinea.destroy();

    chartLinea = new Chart(ctx, {
        type: 'line',
        data: {
            labels: fechasOrdenadas,
            datasets: [
                { label: 'SKU', data: fechasOrdenadas.map(f => mapaDetallesPorDia[f].skus), borderColor: '#00A3E0', backgroundColor: 'transparent', borderWidth: 2.5, tensor: 0.1 },
                { label: 'LPN', data: fechasOrdenadas.map(f => mapaDetallesPorDia[f].lpns), borderColor: '#E06B00', backgroundColor: 'transparent', borderWidth: 2.5, tensor: 0.1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    enabled: false, // Inyección del cuadro flotante avanzado completo al posar el mouse
                    external: function (context) {
                        let tooltipEl = document.getElementById('chartjs-tooltip-advanced');
                        if (!tooltipEl) {
                            tooltipEl = document.createElement('div');
                            tooltipEl.id = 'chartjs-tooltip-advanced';
                            tooltipEl.style.background = '#FFFFFF';
                            tooltipEl.style.borderRadius = '8px';
                            tooltipEl.style.border = '1px solid #E2E8F0';
                            tooltipEl.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.15)';
                            tooltipEl.style.padding = '14px';
                            tooltipEl.style.position = 'absolute';
                            tooltipEl.style.zIndex = '1000';
                            tooltipEl.style.pointerEvents = 'none';
                            tooltipEl.style.fontFamily = 'Segoe UI, sans-serif';
                            tooltipEl.style.transition = 'all 0.1s ease';
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = 0;
                            return;
                        }

                        if (tooltipModel.body) {
                            const index = tooltipModel.dataPoints[0].dataIndex;
                            const fechaActual = fechasOrdenadas[index];
                            const dataDia = mapaDetallesPorDia[fechaActual];

                            let porcentajeStr = "0.0%";
                            let esPositivo = true;
                            if (index > 0) {
                                let lpnAnterior = mapaDetallesPorDia[fechasOrdenadas[index - 1]].lpns;
                                if (lpnAnterior > 0) {
                                    let cambio = ((dataDia.lpns - lpnAnterior) / lpnAnterior) * 100;
                                    esPositivo = cambio >= 0;
                                    porcentajeStr = `${esPositivo ? '+' : ''}${cambio.toFixed(1)}%`;
                                }
                            }

                            tooltipEl.innerHTML = `
                                <div style="font-size: 12px; font-weight: 800; color: #0A2540; border-bottom: 1px solid #F1F5F9; padding-bottom: 4px; margin-bottom: 6px;">
                                    📅 FECHA: ${fechaActual}
                                </div>
                                <div style="font-size: 12px; color: #475569; display:flex; flex-direction:column; gap:4px;">
                                    <div>📦 <b>LPNs:</b> ${dataDia.lpns.toLocaleString()}</div>
                                    <div>🔢 <b>SKUs:</b> ${dataDia.skus.toLocaleString()}</div>
                                    <div>🏢 <b>Proveedores:</b> ${dataDia.provs.size}</div>
                                    <div style="margin-top: 4px; font-weight: 700; color: ${esPositivo ? '#10B981' : '#EF4444'}; display: flex; align-items: center; gap: 2px;">
                                        ${esPositivo ? '▲' : '▼'} Variación LPN: ${porcentajeStr}
                                    </div>
                                </div>
                            `;
                        }

                        const position = context.chart.canvas.getBoundingClientRect();
                        tooltipEl.style.opacity = 1;
                        tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 15 + 'px';
                        tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY - 40 + 'px';
                    }
                }
            }
        }
    });
}

function generarGraficoDona(objetoTipos) {
    const ctx = document.getElementById('chart-dona-tipo').getContext('2d');
    if (chartDona) chartDona.destroy();

    chartDona = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['EC', 'ET', 'RF'],
            datasets: [{ data: [objetoTipos["EC"], objetoTipos["ET"], objetoTipos["RF"]], backgroundColor: ['#0A2540', '#00A3E0', '#E06B00'] }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { position: 'bottom' } },
            // INTERACTIVIDAD AVANZADA CON DOBLE FUNCIÓN (TOGGLE)
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const tipoSeleccionado = ['EC', 'ET', 'RF'][index];

                    if (ultimoTipoSeleccionado === tipoSeleccionado) {
                        // SI YA ESTABA SELECCIONADO: Deshacer el filtro (Marcar todos)
                        document.querySelectorAll('.chk-tipo').forEach(chk => chk.checked = true);
                        ultimoTipoSeleccionado = null;
                    } else {
                        // SI ES NUEVO CLIC: Aplicar filtro exclusivo por este Tipo
                        document.querySelectorAll('.chk-tipo').forEach(chk => {
                            chk.checked = (chk.value === tipoSeleccionado);
                        });
                        ultimoTipoSeleccionado = tipoSeleccionado;
                    }
                    ejecutarFiltrosInternos();
                }
            }
        }
    });
}

function generarGraficoBarrasFijasConNumerosArriba(objetoOrigen) {
    const ctx = document.getElementById('chart-barras-origen').getContext('2d');
    if (chartBarras) chartBarras.destroy();

    const maxValor = Math.max(objetoOrigen["CDS"], objetoOrigen["DP"]);

    chartBarras = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['CDS', 'DP'],
            datasets: [{
                data: [objetoOrigen["CDS"], objetoOrigen["DP"]],
                backgroundColor: ['#0A2540', '#00A3E0'],
                barPercentage: 0.65
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    // SOLUCIÓN MATEMÁTICA DEFINITIVA: 15% de holgura real para que las etiquetas jamás corten la cabecera
                    max: Math.ceil(maxValor > 0 ? maxValor * 1.15 : 100)
                }
            },
            // INTERACTIVIDAD AVANZADA CON DOBLE FUNCIÓN (TOGGLE)
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const origenSeleccionado = ['CDS', 'DP'][index];

                    if (ultimoOrigenSeleccionado === origenSeleccionado) {
                        // SI YA ESTABA SELECCIONADO: Deshacer el filtro (Marcar todos)
                        document.querySelectorAll('.chk-origen').forEach(chk => chk.checked = true);
                        ultimoOrigenSeleccionado = null;
                    } else {
                        // SI ES NUEVO CLIC: Aplicar filtro exclusivo por este Origen
                        document.querySelectorAll('.chk-origen').forEach(chk => {
                            chk.checked = (chk.value === origenSeleccionado);
                        });
                        ultimoOrigenSeleccionado = origenSeleccionado;
                    }
                    ejecutarFiltrosInternos();
                }
            }
        },
        plugins: [{
            id: 'valoresSuperioresBars',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart;
                ctx.save();
                ctx.font = 'bold 12px Arial';
                ctx.fillStyle = '#0A2540';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                chart.getDatasetMeta(0).data.forEach((bar, index) => {
                    const valor = data.datasets[0].data[index];
                    ctx.fillText(valor.toLocaleString(), bar.x, bar.y - 6);
                });
                ctx.restore();
            }
        }]
    });
}

function construirTablaHTML(datosTabla) {
    const tbody = document.querySelector('#data-table tbody');
    tbody.innerHTML = '';

    datosTabla.slice(0, 60).forEach(fila => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${fila["Nro ASN"] || '-'}</strong></td>
            <td>${fila["Nombre de proveedor"] || '-'}</td>
            <td>${fila["Números de OC"] || '-'}</td>
            <td>${(fila["Número de artículos"] || 0).toLocaleString()}</td>
            <td>${(fila["Nro LPN"] || 0).toLocaleString()}</td>
            <td>${fila["Tipo ASN"] || '-'}</td>
            <td>${fila["Fecha de Agenda"] || '-'}</td>
            <td><strong>${fila["Informacion de origen"] || '-'}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

function alternarOrdenNumero(columna) {
    if (ordenColumna === columna) { ordenAscendente = !ordenAscendente; }
    else { ordenColumna = columna; ordenAscendente = false; }
    ejecutarFiltrosInternos();
}

document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('input-search-asn').value = '';
    document.getElementById('input-search-prov').value = '';
    document.getElementById('input-search-oc').value = '';
    document.querySelectorAll('.chk-tipo, .chk-origen, .chk-fecha, .chk-header-ano, .chk-header-mes').forEach(c => c.checked = true);

    document.querySelectorAll('.btn-toggle-all').forEach(b => b.innerText = "Desmarcar todo");

    ultimoTipoSeleccionado = null;
    ultimoOrigenSeleccionado = null;

    calcularSemanasDinamicasPorMes();
    ejecutarFiltrosInternos();
});

window.onload = inicializarDashboard;
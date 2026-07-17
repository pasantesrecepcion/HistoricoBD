// CONFIGURACIÓN DE LA INSTANCIA DE SUPABASE (Versión 2.x CDN)
const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Arreglos de Memoria Global
let dataTotalBase = [];
let ordenColumna = null;
let ordenAscendente = true;

// Instancias persistentes de los Gráficos de Chart.js
let chartLpnHoraInstance = null;
let chartOrigenInstance = null;
let chartLpnSkuInstance = null;

const MESES_NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Almacén de Flags de Filtros Activos
let seleccionadosAnio = [];
let seleccionadosMes = [];
let seleccionadosSemana = [];
let seleccionadosOperadores = [];

// Interceptor de menú lateral
document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
    document.getElementById('sidebarMenu')?.classList.toggle('hidden');
});

// Manejo dinámico de Dropdowns
function toggleDropdown(id) {
    document.querySelectorAll('.dropdown-content').forEach(el => {
        if (el.id !== id) el.classList.remove('show');
    });
    document.getElementById(id)?.classList.toggle('show');
}

// Cerrar dropdowns haciendo clic fuera de ellos
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-filter')) {
        document.querySelectorAll('.dropdown-content').forEach(el => el.classList.remove('show'));
    }
});

// Registrar explícitamente el plugin global de etiquetas de datos para Chart.js
Chart.register(ChartDataLabels);

// 1. CARGADOR RECURSIVO AVANZADO
async function inicializarDashboard() {
    const tbody = document.getElementById('table-body');
    try {
        let desdeFila = 0;
        const tamanoLote = 1000;
        let consultando = true;
        dataTotalBase = [];

        while (consultando) {
            const { data, error } = await _supabase
                .from('productividad_recepcion')
                .select('fecha, hora, usuario_recepcion, total_lpn, total_asn, total_sku, total_proveedores, recibidos_cds, recibidos_dp')
                .range(desdeFila, desdeFila + tamanoLote - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                const procesados = data.map(item => {
                    const partesFecha = item.fecha.split('-');
                    const anio = parseInt(partesFecha[0]);
                    const mesIndex = parseInt(partesFecha[1]) - 1;
                    const mes = MESES_NOMBRES[mesIndex] || "Desconocido";
                    const dia = parseInt(partesFecha[2]);

                    let semana = Math.ceil(dia / 7);
                    if (semana > 5) semana = 5;

                    return {
                        ...item,
                        calculated_anio: anio,
                        calculated_mes: mes,
                        calculated_semana: semana,
                        calculated_hora: (item.hora || "").substring(0, 5)
                    };
                });

                dataTotalBase = dataTotalBase.concat(procesados);

                const counterEl = document.getElementById('table-counter');
                if (counterEl) {
                    counterEl.innerText = `Indexando registros logísticos: ${dataTotalBase.length.toLocaleString()} filas...`;
                }

                if (data.length < tamanoLote) {
                    consultando = false;
                } else {
                    desdeFila += tamanoLote;
                }
            } else {
                consultando = false;
            }
        }

        inicializarOpcionesFiltros();
        ejecutarFiltrosInternos();

    } catch (err) {
        console.error("Error en motor recursivo:", err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-td" style="color:#EF4444;">⚠️ Falla de origen: ${err.message}</td></tr>`;
        }
    }
}

// 2. CONSTRUCCIÓN DINÁMICA DE LOS CASILLEROS DE OPERADORES
function inicializarOpcionesFiltros() {
    const anios = [...new Set(dataTotalBase.map(item => item.calculated_anio).filter(Boolean))].sort((a, b) => b - a);
    const mesesExistentes = [...new Set(dataTotalBase.map(item => item.calculated_mes))];
    const mesesOrdenados = MESES_NOMBRES.filter(m => mesesExistentes.includes(m));
    const semanas = [1, 2, 3, 4, 5];
    const operadores = [...new Set(dataTotalBase.map(item => item.usuario_recepcion ? item.usuario_recepcion.trim() : "Desconocido").filter(Boolean))].sort();

    seleccionadosAnio = [...anios];
    seleccionadosMes = [...mesesOrdenados];
    seleccionadosSemana = [...semanas];
    seleccionadosOperadores = [...operadores];

    renderDropdownOptions('options-anio', anios, 'anio');
    renderDropdownOptions('options-mes', mesesOrdenados, 'mes');
    renderDropdownOptions('options-semana', semanas, 'semana');
    renderDropdownOptions('options-operadores', operadores, 'operadores');
}

function renderDropdownOptions(containerId, values, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    values.forEach(val => {
        const item = document.createElement('div');
        item.className = 'option-item';

        let labelText = val;
        if (type === 'semana') labelText = `Semana ${val}`;

        const safeId = `chk-${type}-${val.toString().replace(/\s+/g, '_')}`;
        item.innerHTML = `
            <input type="checkbox" id="${safeId}" value="${val}" checked onchange="handleCheckboxChange('${type}', this)">
            <label for="${safeId}">${labelText}</label>
        `;
        container.appendChild(item);
    });
}

function handleCheckboxChange(type, checkbox) {
    let val = checkbox.value;
    if (type === 'anio' || type === 'semana') val = Number(checkbox.value);

    let arr = type === 'anio' ? seleccionadosAnio :
        (type === 'mes' ? seleccionadosMes :
            (type === 'semana' ? seleccionadosSemana : seleccionadosOperadores));

    if (checkbox.checked) {
        if (!arr.includes(val)) arr.push(val);
    } else {
        const index = arr.indexOf(val);
        if (index > -1) arr.splice(index, 1);
    }
    ejecutarFiltrosInternos();
}

function toggleSelectAll(type, btn) {
    const optionsContainer = document.getElementById(`options-${type}`);
    if (!optionsContainer) return;
    const checkboxes = optionsContainer.querySelectorAll('input[type="checkbox"]');
    let todosMarcados = true;

    checkboxes.forEach(chk => { if (!chk.checked) todosMarcados = false; });
    const nuevoEstado = !todosMarcados;

    let arr = type === 'anio' ? seleccionadosAnio :
        (type === 'mes' ? seleccionadosMes :
            (type === 'semana' ? seleccionadosSemana : seleccionadosOperadores));

    arr.length = 0;

    checkboxes.forEach(chk => {
        chk.checked = nuevoEstado;
        if (nuevoEstado) {
            let val = chk.value;
            if (type === 'anio' || type === 'semana') val = Number(chk.value);
            arr.push(val);
        }
    });

    btn.innerText = nuevoEstado ? "Desmarcar Todo" : "Seleccionar Todo";
    ejecutarFiltrosInternos();
}

// 3. MOTOR CENTRALIZADO DE FILTRADO Y MÉTRICAS
function ejecutarFiltrosInternos() {
    let datosFiltrados = dataTotalBase.filter(item => {
        const userClean = item.usuario_recepcion ? item.usuario_recepcion.trim() : "Desconocido";
        const matchAnio = seleccionadosAnio.includes(item.calculated_anio);
        const matchMes = seleccionadosMes.includes(item.calculated_mes);
        const matchSemana = seleccionadosSemana.includes(item.calculated_semana);
        const matchOp = seleccionadosOperadores.includes(userClean);

        return matchAnio && matchMes && matchSemana && matchOp;
    });

    let granTotalSku = 0;
    let granTotalLpn = 0;
    let granTotalAsn = 0;

    datosFiltrados.forEach(f => {
        granTotalSku += parseInt(f.total_sku) || 0;
        granTotalLpn += parseInt(f.total_lpn) || 0;
        granTotalAsn += parseInt(f.total_asn) || 0;
    });

    let agrupado = {};
    datosFiltrados.forEach(fila => {
        let user = fila.usuario_recepcion ? fila.usuario_recepcion.trim() : "Desconocido";
        if (!agrupado[user]) {
            agrupado[user] = {
                usuario: user,
                total_sku: 0,
                total_lpn: 0,
                total_proveedores: 0,
                recibidos_cds: 0,
                recibidos_dp: 0
            };
        }
        agrupado[user].total_sku += parseInt(fila.total_sku) || 0;
        agrupado[user].total_lpn += parseInt(fila.total_lpn) || 0;
        agrupado[user].total_proveedores += parseInt(fila.total_proveedores) || 0;
        agrupado[user].recibidos_cds += parseInt(fila.recibidos_cds) || 0;
        agrupado[user].recibidos_dp += parseInt(fila.recibidos_dp) || 0;
    });

    let listaAgrupada = Object.values(agrupado);

    listaAgrupada.forEach(op => {
        let pesoSku = granTotalSku > 0 ? (op.total_sku / granTotalSku) : 0;
        let pesoLpn = granTotalLpn > 0 ? (op.total_lpn / granTotalLpn) : 0;
        op.rendimiento_combinado = ((pesoSku + pesoLpn) / 2) * 100;
    });

    const selectOrden = document.getElementById('select-orden-grafico');
    const criterio = selectOrden ? selectOrden.value : 'sku';

    if (criterio === 'sku') {
        listaAgrupada.sort((a, b) => b.total_sku - a.total_sku);
    } else if (criterio === 'lpn') {
        listaAgrupada.sort((a, b) => b.total_lpn - a.total_lpn);
    }

    if (ordenColumna) {
        listaAgrupada.sort((a, b) => {
            let valA = a[ordenColumna];
            let valB = b[ordenColumna];
            return ordenAscendente ? valA - valB : valB - valA;
        });
    }

    renderizarInterfaz(listaAgrupada, datosFiltrados, granTotalSku, granTotalLpn, granTotalAsn);
}

// 4. RENDERS DE INTERFAZ Y RECONSTRUCCIÓN DE KPIs
function renderizarInterfaz(datosTabla, datosCrudos, globalSku, globalLpn, globalAsn) {
    let totalUsuarios = datosTabla.length;
    let totalProveedores = datosTabla.reduce((acc, el) => acc + el.total_proveedores, 0);

    const valUsuarios = document.getElementById('val-total-usuarios');
    const valSku = document.getElementById('val-total-sku');
    const valLpn = document.getElementById('val-total-lpn');
    const valAsn = document.getElementById('val-total-asn');
    const valProv = document.getElementById('val-total-proveedores');
    const valRend = document.getElementById('val-rendimiento-total');
    const tableCounter = document.getElementById('table-counter');

    if (valUsuarios) valUsuarios.innerText = totalUsuarios.toLocaleString();
    if (valSku) valSku.innerText = globalSku.toLocaleString();
    if (valLpn) valLpn.innerText = globalLpn.toLocaleString();
    if (valAsn) valAsn.innerText = globalAsn.toLocaleString();
    if (valProv) valProv.innerText = totalProveedores.toLocaleString();

    let sumaRendimientos = datosTabla.reduce((acc, el) => acc + el.rendimiento_combinado, 0);
    let promedioGlobal = totalUsuarios > 0 ? (sumaRendimientos / totalUsuarios) : 0;
    if (valRend) valRend.innerText = `${promedioGlobal.toFixed(2)}%`;

    if (tableCounter) tableCounter.innerText = `${totalUsuarios} Operadores / ${datosCrudos.length.toLocaleString()} Registros`;

    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (datosTabla.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-td">No existen transacciones con los criterios seleccionados.</td></tr>`;
    } else {
        datosTabla.forEach(fila => {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong style="color: #0A192F;">${fila.usuario}</strong></td>
                <td>${fila.total_sku.toLocaleString()}</td>
                <td>${fila.total_lpn.toLocaleString()}</td>
                <td>${fila.recibidos_cds.toLocaleString()}</td>
                <td>${fila.recibidos_dp.toLocaleString()}</td>
                <td><span class="badge-rendimiento-tabla">${fila.rendimiento_combinado.toFixed(4)}%</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    actualizarGraficos(datosCrudos, datosTabla);
}

// 5. GRÁFICOS CON NÚMEROS INTEGRADOS (DATALABELS EN PRODUCTIVIDAD)
function actualizarGraficos(datosCrudos, datosOperadoresAgrupados) {
    const horasEje = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
    let lpnsCds = Array(horasEje.length).fill(0);
    let lpnsDp = Array(horasEje.length).fill(0);
    let sumaCds = 0, sumaDp = 0;

    datosCrudos.forEach(row => {
        let hr = row.calculated_hora;
        let idx = horasEje.indexOf(hr);
        let cdsVal = parseInt(row.recibidos_cds) || 0;
        let dpVal = parseInt(row.recibidos_dp) || 0;

        if (idx !== -1) {
            lpnsCds[idx] += cdsVal;
            lpnsDp[idx] += dpVal;
        }
        sumaCds += cdsVal;
        sumaDp += dpVal;
    });

    // Gráfico 1: LPN x Hora
    const canvasLpn = document.getElementById('chartLpnHora');
    if (canvasLpn) {
        if (chartLpnHoraInstance) chartLpnHoraInstance.destroy();
        chartLpnHoraInstance = new Chart(canvasLpn.getContext('2d'), {
            type: 'line',
            data: {
                labels: horasEje,
                datasets: [
                    { label: 'CDS', data: lpnsCds, borderColor: '#0284C7', backgroundColor: 'rgba(2, 132, 199, 0.05)', tension: 0.2, fill: true, borderWidth: 3 },
                    { label: 'DP', data: lpnsDp, borderColor: '#0A192F', backgroundColor: 'rgba(10, 25, 47, 0.05)', tension: 0.2, fill: true, borderWidth: 3 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { datalabels: { display: false }, legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Gráfico 2: Origen (Donut)
    const canvasOrigen = document.getElementById('chartOrigen');
    if (canvasOrigen) {
        if (chartOrigenInstance) chartOrigenInstance.destroy();
        let total = sumaCds + sumaDp;
        let pctCDS = total > 0 ? ((sumaCds / total) * 100).toFixed(1) : 0;
        let pctDP = total > 0 ? ((sumaDp / total) * 100).toFixed(1) : 0;

        chartOrigenInstance = new Chart(canvasOrigen.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: [`CDS (${pctCDS}%)`, `DP (${pctDP}%)`],
                datasets: [{ data: [sumaCds, sumaDp], backgroundColor: ['#0284C7', '#0A192F'], borderWidth: 2 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { datalabels: { display: false }, legend: { position: 'bottom' } }
            }
        });
    }

    // Gráfico 3: Barras de Productividad (Con números integrados a los lados)
    let nombresOps = datosOperadoresAgrupados.map(op => op.usuario);
    let skusPorOp = datosOperadoresAgrupados.map(op => op.total_sku);
    let lpnsPorOp = datosOperadoresAgrupados.map(op => op.total_lpn);

    const boxProductividad = document.getElementById('box-productividad-op');
    const wrapperProductividad = document.getElementById('wrapper-productividad-op');
    const esVerticalExpandido = boxProductividad?.classList.contains('expanded-vertical-mode') || false;

    let grosorBarrasMaximo = 12;

    if (esVerticalExpandido && wrapperProductividad) {
        let altoCalculado = Math.max(700, datosOperadoresAgrupados.length * 45);
        wrapperProductividad.style.height = `${altoCalculado}px`;
        grosorBarrasMaximo = 20;
    } else if (wrapperProductividad) {
        wrapperProductividad.style.height = "340px";
    }

    const canvasBar = document.getElementById('chartLpnSkuHorizontal');
    if (canvasBar) {
        if (chartLpnSkuInstance) chartLpnSkuInstance.destroy();
        chartLpnSkuInstance = new Chart(canvasBar.getContext('2d'), {
            type: 'bar',
            data: {
                labels: nombresOps,
                datasets: [
                    { label: 'SKUs', data: skusPorOp, backgroundColor: '#0A192F', maxBarThickness: grosorBarrasMaximo },
                    { label: 'LPNs', data: '#0284C7', backgroundColor: '#0284C7', data: lpnsPorOp, maxBarThickness: grosorBarrasMaximo }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    datalabels: {
                        display: true,
                        align: 'end',
                        anchor: 'end',
                        color: '#475569',
                        font: { weight: 'bold', size: 10 },
                        formatter: (val) => val > 0 ? val.toLocaleString() : ''
                    }
                },
                scales: {
                    x: { beginAtZero: true, grace: '8%' },
                    y: { ticks: { font: { weight: 'bold', size: 11 } } }
                }
            }
        });
    }
}

// 6. CONTROLADORES INTERACTIVOS DE EXPANSIÓN REVISADOS (FLUIDOS)
function toggleExpandirHorizontal(id) {
    const contenedor = document.getElementById(id);
    const splitLayout = document.getElementById('topSplitLayout');

    if (!contenedor || !splitLayout) return;

    contenedor.classList.toggle('expanded-inplace');
    splitLayout.classList.toggle('has-expanded-child');

    // Forzar redibujado instantáneo de gráficos sin trabas de layout
    setTimeout(() => {
        if (chartLpnHoraInstance) chartLpnHoraInstance.resize();
        if (chartOrigenInstance) chartOrigenInstance.resize();
        ejecutarFiltrosInternos();
    }, 50);
}

function toggleExpandirVertical(id) {
    document.getElementById(id)?.classList.toggle('expanded-vertical-mode');
    setTimeout(() => {
        if (chartLpnSkuInstance) chartLpnSkuInstance.resize();
        ejecutarFiltrosInternos();
    }, 50);
}

// 7. ALTERNAR ORDENACIÓN DE TABLA
function alternarOrden(columna) {
    if (ordenColumna === columna) {
        ordenAscendente = !ordenAscendente;
    } else {
        ordenColumna = columna;
        ordenAscendente = false;
    }
    ejecutarFiltrosInternos();
}

// 8. ACCIÓN REINICIAR FILTROS
document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
    ordenColumna = null;
    ordenAscendente = true;
    const selectOrden = document.getElementById('select-orden-grafico');
    if (selectOrden) selectOrden.value = 'sku';

    document.querySelectorAll('.dropdown-actions button').forEach(b => b.innerText = "Desmarcar Todo");
    inicializarOpcionesFiltros();
    ejecutarFiltrosInternos();
});

window.onload = inicializarDashboard;
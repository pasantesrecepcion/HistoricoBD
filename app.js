document.addEventListener("DOMContentLoaded", () => {
    console.log("Antigravity Centro de Control Inicializado");

    // Control de colapso de la barra lateral completa
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebarMenu');

    if (btnToggle && sidebar) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
        });
    }
});

// Control interactivo para abrir y cerrar submenús desplegables
function evtToggleSubmenu(event) {
    event.preventDefault(); // Detiene la navegación vacía del '#'

    const itemGroup = event.currentTarget.closest('.menu-item-group');
    if (itemGroup) {
        itemGroup.classList.toggle('open');
    }
}
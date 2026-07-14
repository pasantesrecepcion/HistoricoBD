document.addEventListener("DOMContentLoaded", () => {
    console.log("Antigravity Centro de Control Inicializado");

    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebarMenu');

    if (btnToggle && sidebar) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
        });
    }
});
<header class="top-bar">
    <button class="btn btn-ghost" id="mobileMenuBtn" style="display: none;">
        <i class="fa-solid fa-bars"></i>
    </button>
    <style>@media(max-width: 768px){ #mobileMenuBtn { display: inline-flex !important; margin-right: 10px; } }</style>

    <div class="search-bar">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" placeholder="Pesquisar na nuvem...">
    </div>

    <div style="display: flex; gap: 15px; align-items: center;">
        <button class="btn btn-primary"><i class="fa-solid fa-cloud-arrow-up"></i> <span style="display:none; @media(min-width:768px){display:inline;}">Upload</span></button>
        <div style="width: 35px; height: 35px; background: #e0e7ff; color: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">U</div>
        <a href="?logout=true" class="btn btn-ghost" title="Sair"><i class="fa-solid fa-right-from-bracket"></i></a>
    </div>
</header>
import { showToast } from './main.js';
import { servicesData, addToCart } from './cart.js';

// Избранное в localStorage
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

// Обновление UI избранного (счетчик в шапке)
export function updateFavUI() {
    const badge = document.getElementById('favCountBadge');
    if (badge) badge.textContent = favorites.length;
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

// Проверка, находится ли услуга в избранном
export function isFavorite(serviceId) {
    return favorites.includes(serviceId);
}

// Добавление/удаление из избранного
export function toggleFavorite(serviceId) {
    const index = favorites.indexOf(serviceId);
    const service = servicesData.find(s => s.id === serviceId);
    
    if (index === -1) {
        favorites.push(serviceId);
        showToast(`${service?.name || 'Услуга'} добавлена в избранное`, 'success');
    } else {
        favorites.splice(index, 1);
        showToast(`${service?.name || 'Услуга'} удалена из избранного`, 'warning');
    }
    
    updateFavUI();
    
    // Обновляем страницу избранного если она открыта
    if (typeof renderFavoritesPage === 'function') {
        renderFavoritesPage();
    }
}

// Очистка всего избранного
export function clearFavorites() {
    favorites = [];
    updateFavUI();
    if (typeof renderFavoritesPage === 'function') {
        renderFavoritesPage();
    }
    showToast('Избранное очищено', 'warning');
}

// Получение услуг из избранного
export function getFavoriteServices() {
    return servicesData.filter(s => favorites.includes(s.id));
}

// Рендер страницы избранного
export function renderFavoritesPage() {
    const container = document.getElementById('favoritesGrid');
    if (!container) return;
    
    const favoriteServices = getFavoriteServices();
    
    if (favoriteServices.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-heart"></i>
                Избранное пусто
                <br>
                <small>Добавляйте услуги в избранное, чтобы не потерять их</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = favoriteServices.map(service => `
        <div class="fav-card">
            <div class="fav-card-info">
                <h4>${service.name}</h4>
                <p>${service.price} ₽</p>
                <small style="color:var(--muted)">${service.desc.substring(0, 60)}...</small>
                <div class="svc-tags" style="margin-top:8px">
                    ${service.tags.map(tag => `<span class="svc-tag">${tag}</span>`).join('')}
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px">
                <button class="add-btn" onclick="addToCartFromFav(${service.id})" title="В корзину">
                    <i class="fas fa-cart-plus"></i>
                </button>
                <button class="fav-remove" onclick="toggleFavorite(${service.id})" title="Удалить">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Добавление в корзину из избранного
export function addToCartFromFav(serviceId) {
    addToCart(serviceId, 1);
}

// Глобальные функции для HTML
window.toggleFavorite = toggleFavorite;
window.clearFavorites = clearFavorites;
window.addToCartFromFav = addToCartFromFav;

// Экспорт
export { favorites };

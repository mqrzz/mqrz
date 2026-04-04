import { showToast } from './main.js';
import { db, doc, getDoc, collection, query, where, getDocs, Timestamp, addDoc, updateDoc } from './firebase-config.js';
import { auth } from './firebase-config.js';

// Корзина в localStorage
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let appliedPromo = null;
let promoDiscount = 0;

// Данные услуг (полностью из твоего кода)
export const servicesData = [
    {id:1, name:"Wildberries инфографика", price:200, badge:"Хит", desc:"Готовые макеты карточек товара с акцентами на преимущества. Формат PNG/PSD.", icon:"fab fa-wpforms", tags:["WB","PNG/PSD","48ч"], benefits:["Увеличение CTR до +40%","Адаптация под требования WB","2 формата на выбор"]},
    {id:2, name:"OZON инфографика", price:200, badge:"Популярное", desc:"Адаптация под требования OZON. Увеличение кликабельности карточки.", icon:"fas fa-chart-simple", tags:["OZON","PNG","Гайдлайны"], benefits:["Соблюдение гайдлайнов OZON","Высокое качество при сжатии","Быстрая загрузка"]},
    {id:3, name:"Яндекс.Маркет инфографика", price:200, badge:"", desc:"Дизайн для DBS и FBS селлеров, визуал под стандарты Яндекса.", icon:"fas fa-chart-line", tags:["Яндекс","DBS/FBS"], benefits:["Адаптация под DBS/FBS","Читаемость на любом фоне","SEO-оптимизация"]},
    {id:4, name:"Сезонный редизайн", price:99, badge:"Выгодно", desc:"Обновление карточек под праздники, акции, распродажи.", icon:"fas fa-gift", tags:["Праздники","4-8ч"], benefits:["Готовые шаблоны под праздники","Скидка 30% от 5 карточек","Срок 4–8 часов"]},
    {id:5, name:"Рекламный креатив", price:600, badge:"", desc:"Баннеры для таргета, сторис, outdoor — яркий дизайн под ключ.", icon:"fas fa-bullhorn", tags:["Баннер","3 варианта"], benefits:["3 варианта макета","Адаптация под все форматы","Готов к запуску"]},
    {id:6, name:"Дизайн визиток", price:300, badge:"", desc:"Фирменные визитки для офлайн-встреч и упаковки заказов.", icon:"fas fa-id-card", tags:["Печать","2 варианта"], benefits:["2 варианта дизайна","Макет для печати","Правки до утверждения"]},
    {id:7, name:"Слайд-презентация (ИИ)", price:99, badge:"Быстро", desc:"1 слайд в современном стиле, готовый для защиты бренда.", icon:"fas fa-chalkboard-user", tags:["1 слайд","AI","PPTX"], benefits:["AI-генерация","Анимация по желанию","Формат PPTX/PDF"]},
    {id:8, name:"Полная презентация", price:799, badge:"Премиум", desc:"Презентация 8–12 слайдов с инфографикой и анимацией.", icon:"fas fa-file-powerpoint", tags:["8-12 слайдов","Анимация"], benefits:["Уникальный дизайн","Анимация переходов","Гайд по использованию"]},
    {id:9, name:"Статический сайт под ключ", price:15000, badge:"Новинка", desc:"Полноценный статический сайт с уникальным дизайном и адаптацией.", icon:"fas fa-globe", tags:["Адаптив","SEO","5-7 дней"], benefits:["Уникальный дизайн","Адаптация под все устройства","Оптимизация для поисковых систем"]}
];

// Обновление UI корзины (счетчик в шапке)
export function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.getElementById('cartCountBadge');
    if (badge) badge.textContent = count;
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Добавление в корзину
export function addToCart(serviceId, quantity = 1) {
    const service = servicesData.find(s => s.id === serviceId);
    if (!service) return;
    
    const existing = cart.find(item => item.id === serviceId);
    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({ ...service, quantity: quantity });
    }
    
    updateCartUI();
    showToast(`${service.name} добавлен в корзину`, 'success');
}

// Удаление из корзины
export function removeFromCart(index) {
    const removed = cart[index];
    cart.splice(index, 1);
    updateCartUI();
    if (typeof renderCartPage === 'function') renderCartPage();
    showToast(`${removed.name} удален из корзины`, 'warning');
}

// Очистка корзины
export function clearCart() {
    cart = [];
    updateCartUI();
    if (typeof renderCartPage === 'function') renderCartPage();
}

// Получение суммы корзины
export function getCartTotal() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = promoDiscount;
    const total = Math.max(0, subtotal - discount);
    return { subtotal, discount, total };
}

// Применение промокода
export async function applyPromoCode(code) {
    if (!code) {
        showToast('Введите промокод', 'error');
        return false;
    }
    
    try {
        const promosRef = collection(db, 'promocodes');
        const q = query(promosRef, where('code', '==', code.toUpperCase()), where('isActive', '==', true));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            showToast('Промокод не найден или неактивен', 'error');
            return false;
        }
        
        const promoDoc = snapshot.docs[0];
        const promo = promoDoc.data();
        const now = new Date();
        const expiresAt = promo.expiresAt?.toDate();
        
        if (expiresAt && expiresAt < now) {
            showToast('Промокод истек', 'error');
            return false;
        }
        
        const { subtotal } = getCartTotal();
        
        if (promo.type === 'percentage') {
            promoDiscount = Math.min(subtotal * promo.value / 100, subtotal);
        } else {
            promoDiscount = Math.min(promo.value, subtotal);
        }
        
        appliedPromo = { id: promoDoc.id, ...promo };
        showToast(`Промокод ${code} применен! Скидка ${promo.type === 'percentage' ? promo.value + '%' : promo.value + ' ₽'}`, 'success');
        
        if (typeof renderCartPage === 'function') renderCartPage();
        return true;
        
    } catch (error) {
        console.error('Promo error:', error);
        showToast('Ошибка проверки промокода', 'error');
        return false;
    }
}

// Очистка промокода
export function clearPromo() {
    appliedPromo = null;
    promoDiscount = 0;
    if (typeof renderCartPage === 'function') renderCartPage();
    showToast('Промокод удален', 'warning');
}

// Сохранение заказа в Firestore
export async function saveOrder(orderData) {
    try {
        const user = auth.currentUser;
        const order = {
            userId: user?.uid || null,
            userEmail: user?.email || orderData.email,
            clientName: orderData.name,
            telegram: orderData.telegram,
            phone: orderData.phone || '',
            comment: orderData.comment || '',
            items: cart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                total: item.price * item.quantity
            })),
            subtotal: orderData.subtotal,
            discount: promoDiscount,
            promoCode: appliedPromo?.code || null,
            total: orderData.total,
            status: 'pending',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        
        const docRef = await addDoc(collection(db, 'orders'), order);
        
        // Очищаем корзину и промокод после успешного заказа
        cart = [];
        promoDiscount = 0;
        appliedPromo = null;
        updateCartUI();
        
        return { success: true, orderId: docRef.id };
        
    } catch (error) {
        console.error('Save order error:', error);
        return { success: false, error: error.message };
    }
}

// Получение заказов пользователя
export async function getUserOrders(userId) {
    try {
        const q = query(collection(db, 'orders'), where('userId', '==', userId), where('createdAt', '!=', null));
        const snapshot = await getDocs(q);
        const orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });
        // Сортировка по дате (новые сверху)
        orders.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });
        return orders;
    } catch (error) {
        console.error('Get orders error:', error);
        return [];
    }
}

// Получение всех заказов (для админа)
export async function getAllOrders() {
    try {
        const snapshot = await getDocs(collection(db, 'orders'));
        const orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });
        orders.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });
        return orders;
    } catch (error) {
        console.error('Get all orders error:', error);
        return [];
    }
}

// Обновление статуса заказа (для админа)
export async function updateOrderStatus(orderId, status) {
    try {
        await updateDoc(doc(db, 'orders', orderId), {
            status: status,
            updatedAt: Timestamp.now()
        });
        
        // Получаем заказ для отправки email уведомления
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        const order = orderDoc.data();
        
        if (order && order.userEmail) {
            const statusText = {
                'pending': 'Ожидает обработки',
                'processing': 'В работе',
                'completed': 'Выполнен',
                'cancelled': 'Отменен'
            };
            
            // Отправляем email уведомление (через Cloudflare Worker)
            try {
                await fetch('https://твой-воркер.workers.dev/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: order.userEmail,
                        subject: `Статус заказа #${orderId.slice(-6)} изменен`,
                        body: `Здравствуйте, ${order.clientName || order.userEmail}!\n\nСтатус вашего заказа #${orderId.slice(-6)} изменен на: ${statusText[status] || status}\n\nСпасибо, что выбрали Design Antviz!`
                    })
                }).catch(e => console.log('Email error:', e));
            } catch (emailError) {
                console.log('Email send error:', emailError);
            }
        }
        
        return true;
    } catch (error) {
        console.error('Update order status error:', error);
        return false;
    }
}

// Глобальные функции для HTML
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.applyPromoCode = applyPromoCode;
window.clearPromo = clearPromo;

// Рендер страницы корзины (будет вызван из order.html)
window.renderCartPage = function() {
    const container = document.getElementById('cartItemsList');
    const totalBlock = document.getElementById('cartTotalBlock');
    const promoSection = document.getElementById('promoSection');
    
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-bag"></i>Корзина пуста<br><small>Добавьте услуги из каталога</small></div>';
        if (totalBlock) totalBlock.style.display = 'none';
        if (promoSection) promoSection.style.display = 'none';
        return;
    }
    
    const { subtotal, discount, total } = getCartTotal();
    
    container.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-meta">${item.price} ₽ × ${item.quantity}</div>
            </div>
            <div class="cart-item-right">
                <span class="cart-item-price">${item.price * item.quantity} ₽</span>
                <button class="remove-btn" onclick="removeFromCart(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
    
    if (totalBlock) {
        let discountHtml = '';
        if (discount > 0) {
            discountHtml = `<div class="promo-discount">Скидка по промокоду: -${discount} ₽</div>`;
        }
        totalBlock.innerHTML = `
            <div>
                <div class="cart-total-label">Сумма</div>
                <div id="cartSubtotalVal" style="font-size:1.2rem">${subtotal} ₽</div>
                ${discountHtml}
            </div>
            <div class="cart-total-val" id="cartTotalVal">${total} ₽</div>
        `;
        totalBlock.style.display = 'flex';
        if (promoSection) promoSection.style.display = 'block';
    }
};

// Экспорт
export { cart, appliedPromo, promoDiscount };

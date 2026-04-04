import { 
    db, auth, collection, getDocs, doc, updateDoc, deleteDoc, 
    addDoc, query, where, orderBy, Timestamp, getDoc, writeBatch,
    onSnapshot
} from './firebase-config.js';
import { showToast, showLoading, checkIsAdmin, sendEmailNotification } from './main.js';
import { getAllOrders, updateOrderStatus } from './cart.js';
import { getAllChats, adminReplyToChat, closeChat } from './chat.js';

let currentAdminView = 'orders';
let currentReplyChatId = null;

// Проверка прав админа
export async function requireAdmin() {
    const user = auth.currentUser;
    if (!user) {
        showToast('Требуется авторизация', 'error');
        setTimeout(() => { window.location.href = '/index.html'; }, 1500);
        return false;
    }
    
    const isAdmin = await checkIsAdmin(user);
    if (!isAdmin) {
        showToast('Доступ запрещен. Требуются права администратора.', 'error');
        setTimeout(() => { window.location.href = '/index.html'; }, 1500);
        return false;
    }
    
    const statusDiv = document.getElementById('adminStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<span style="color:var(--success)">✅ Вы вошли как администратор</span>';
    }
    
    return true;
}

// Загрузка всех заказов
export async function loadAllOrders() {
    const container = document.getElementById('adminOrdersList');
    if (!container) return;
    
    showLoading(true);
    try {
        const snapshot = await getDocs(collection(db, 'orders'));
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-cart">📦 Заказов пока нет</div>';
            return;
        }
        
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
        
        container.innerHTML = orders.map(order => {
            const statusText = {
                'pending': 'Ожидает',
                'processing': 'В работе',
                'completed': 'Выполнен',
                'cancelled': 'Отменен'
            };
            
            return `
                <div class="admin-order-item">
                    <div class="admin-order-header">
                        <strong>📋 Заказ #${order.id.slice(-8)}</strong>
                        <select class="order-status-select" data-order-id="${order.id}">
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>🟡 Ожидает</option>
                            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>🔵 В работе</option>
                            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>🟢 Выполнен</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>🔴 Отменен</option>
                        </select>
                    </div>
                    <div><strong>👤 Клиент:</strong> ${order.clientName || order.userEmail}</div>
                    <div><strong>📱 Telegram:</strong> ${order.telegram || '-'}</div>
                    <div><strong>📧 Email:</strong> ${order.userEmail || order.email || '-'}</div>
                    <div><strong>💰 Сумма:</strong> ${order.total} ₽</div>
                    <div><strong>📅 Дата:</strong> ${order.createdAt?.toDate().toLocaleString() || 'неизвестно'}</div>
                    <div><strong>🛒 Состав:</strong> ${order.items?.map(i => `${i.name} x${i.quantity}`).join(', ') || '-'}</div>
                    <div><strong>💬 Комментарий:</strong> ${order.comment || '-'}</div>
                    ${order.promoCode ? `<div><strong>🎫 Промокод:</strong> ${order.promoCode} (скидка: ${order.discount || 0} ₽)</div>` : ''}
                </div>
            `;
        }).join('');
        
        // Добавляем обработчики для селектов статуса
        document.querySelectorAll('.order-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const orderId = select.dataset.orderId;
                const newStatus = e.target.value;
                await updateOrderStatus(orderId, newStatus);
                showToast(`Статус заказа изменен на ${newStatus}`, 'success');
                await loadAllOrders();
            });
        });
        
    } catch (error) {
        console.error('Load orders error:', error);
        container.innerHTML = '<div class="empty-cart">❌ Ошибка загрузки заказов</div>';
    } finally {
        showLoading(false);
    }
}

// Загрузка всех пользователей
export async function loadAllUsers() {
    const container = document.getElementById('adminUsersList');
    if (!container) return;
    
    showLoading(true);
    try {
        const snapshot = await getDocs(collection(db, 'users'));
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-cart">👥 Пользователей пока нет</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="user-list">
                ${snapshot.docs.map(doc => {
                    const user = doc.data();
                    const isBlocked = user.isBlocked || false;
                    const isDeleted = user.isDeleted || false;
                    
                    return `
                        <div class="user-item">
                            <div>
                                <div class="user-email">${user.email}</div>
                                <div class="user-role">${user.role === 'admin' ? '👑 Администратор' : '👤 Пользователь'}</div>
                                <div>📅 Регистрация: ${user.createdAt?.toDate().toLocaleDateString() || 'неизвестно'}</div>
                                <div>📱 Telegram: ${user.telegram || '-'}</div>
                                <div>📞 Телефон: ${user.phone || '-'}</div>
                                ${isDeleted ? '<div style="color:var(--error)">⚠️ Аккаунт удален</div>' : ''}
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap">
                                <select class="user-role-select" data-user-id="${doc.id}">
                                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                                </select>
                                ${!isDeleted ? `
                                    <button class="${isBlocked ? 'unblock-btn' : 'block-btn'}" onclick="window.toggleBlockUser('${doc.id}', ${isBlocked})">
                                        ${isBlocked ? '🔓 Разблокировать' : '🔒 Заблокировать'}
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        // Обработчики смены роли
        document.querySelectorAll('.user-role-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = select.dataset.userId;
                const newRole = e.target.value;
                await updateUserRole(userId, newRole);
                showToast(`Роль пользователя изменена на ${newRole}`, 'success');
                await loadAllUsers();
            });
        });
        
    } catch (error) {
        console.error('Load users error:', error);
        container.innerHTML = '<div class="empty-cart">❌ Ошибка загрузки пользователей</div>';
    } finally {
        showLoading(false);
    }
}

// Обновление роли пользователя
export async function updateUserRole(userId, role) {
    try {
        await updateDoc(doc(db, 'users', userId), { 
            role: role,
            updatedAt: Timestamp.now()
        });
        return true;
    } catch (error) {
        console.error('Update role error:', error);
        showToast('Ошибка изменения роли', 'error');
        return false;
    }
}

// Блокировка/разблокировка пользователя
window.toggleBlockUser = async (userId, isBlocked) => {
    showLoading(true);
    try {
        const newBlockStatus = !isBlocked;
        await updateDoc(doc(db, 'users', userId), { 
            isBlocked: newBlockStatus,
            blockedAt: newBlockStatus ? Timestamp.now() : null,
            updatedAt: Timestamp.now()
        });
        
        const userDoc = await getDoc(doc(db, 'users', userId));
        const user = userDoc.data();
        
        if (user && user.email) {
            await sendEmailNotification(
                user.email,
                newBlockStatus ? 'Ваш аккаунт заблокирован' : 'Ваш аккаунт разблокирован',
                newBlockStatus 
                    ? `Здравствуйте!\n\nВаш аккаунт был заблокирован. Для выяснения причин свяжитесь с поддержкой: @DESIGNANTVIZ`
                    : `Здравствуйте!\n\nВаш аккаунт был разблокирован. Вы снова можете пользоваться сервисом.`
            );
        }
        
        showToast(newBlockStatus ? 'Пользователь заблокирован' : 'Пользователь разблокирован', 'success');
        await loadAllUsers();
    } catch (error) {
        console.error('Toggle block error:', error);
        showToast('Ошибка', 'error');
    } finally {
        showLoading(false);
    }
};

// Загрузка всех чатов
export async function loadAllChats() {
    const container = document.getElementById('adminChatsList');
    if (!container) return;
    
    showLoading(true);
    try {
        const chats = await getAllChats();
        
        if (chats.length === 0) {
            container.innerHTML = '<div class="empty-cart">💬 Чатов пока нет</div>';
            return;
        }
        
        container.innerHTML = chats.map(chat => {
            const statusText = chat.status === 'open' ? '🟢 Открыт' : '🔴 Закрыт';
            const statusClass = chat.status === 'open' ? 'status-pending' : 'status-cancelled';
            
            return `
                <div class="admin-order-item">
                    <div class="admin-order-header">
                        <strong>💬 Чат с: ${chat.userEmail}</strong>
                        <span class="admin-order-status ${statusClass}">${statusText}</span>
                    </div>
                    <div><strong>📋 Тема:</strong> ${chat.topic || 'general'}</div>
                    <div><strong>📝 Последнее сообщение:</strong> ${chat.lastMessage?.substring(0, 50) || '-'}</div>
                    <div><strong>🕐 Время:</strong> ${chat.lastMessageTime?.toDate().toLocaleString() || '-'}</div>
                    <div><strong>📅 Создан:</strong> ${chat.createdAt?.toDate().toLocaleString() || '-'}</div>
                    <div style="display:flex; gap:12px; margin-top:12px">
                        <button class="btn-primary" style="padding:8px 16px" onclick="window.openReplyChat('${chat.id}')">✏️ Ответить</button>
                        ${chat.status === 'open' ? `<button class="btn-ghost" style="padding:8px 16px" onclick="window.closeChatAdmin('${chat.id}')">🔒 Закрыть чат</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Load chats error:', error);
        container.innerHTML = '<div class="empty-cart">❌ Ошибка загрузки чатов</div>';
    } finally {
        showLoading(false);
    }
}

// Открыть окно ответа на чат
window.openReplyChat = async (chatId) => {
    currentReplyChatId = chatId;
    
    const modal = document.getElementById('replyChatModal');
    if (!modal) return;
    
    // Загружаем историю сообщений
    const messagesContainer = document.getElementById('chatMessagesPreview');
    if (messagesContainer) {
        showLoading(true);
        try {
            const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
            const snapshot = await getDocs(q);
            
            messagesContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isUser = msg.senderId !== auth.currentUser?.uid;
                const time = msg.timestamp?.toDate().toLocaleString();
                
                messagesContainer.innerHTML += `
                    <div style="margin-bottom:12px; padding:8px; background:${isUser ? 'var(--gold-dim)' : 'var(--surface)'}; border-radius:8px">
                        <strong>${isUser ? '👤 Пользователь' : '👨‍💼 Админ'}:</strong> ${msg.text}
                        ${msg.fileUrl ? `<div><a href="${msg.fileUrl}" target="_blank">📎 Вложение</a></div>` : ''}
                        <br><small style="color:var(--muted)">${time}</small>
                    </div>
                `;
            });
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } catch (error) {
            console.error('Load messages error:', error);
        } finally {
            showLoading(false);
        }
    }
    
    modal.classList.add('open');
};

// Закрыть модалку ответа
window.closeReplyChatModal = () => {
    const modal = document.getElementById('replyChatModal');
    if (modal) modal.classList.remove('open');
    currentReplyChatId = null;
    document.getElementById('replyMessageText').value = '';
};

// Отправить ответ в чат
window.sendAdminReply = async () => {
    const message = document.getElementById('replyMessageText')?.value.trim();
    if (!message) {
        showToast('Введите сообщение', 'error');
        return;
    }
    
    if (!currentReplyChatId) {
        showToast('Ошибка: чат не выбран', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const success = await adminReplyToChat(currentReplyChatId, message);
        if (success) {
            showToast('Ответ отправлен', 'success');
            document.getElementById('replyMessageText').value = '';
            window.closeReplyChatModal();
            await loadAllChats();
        } else {
            showToast('Ошибка отправки', 'error');
        }
    } catch (error) {
        showToast('Ошибка отправки', 'error');
    } finally {
        showLoading(false);
    }
};

// Закрыть чат из админки
window.closeChatAdmin = async (chatId) => {
    if (confirm('Закрыть чат? Пользователь не сможет отправлять новые сообщения.')) {
        await closeChat(chatId);
        await loadAllChats();
    }
};

// Загрузка промокодов
export async function loadPromoCodes() {
    const container = document.getElementById('adminPromoCodes');
    if (!container) return;
    
    showLoading(true);
    try {
        const snapshot = await getDocs(collection(db, 'promocodes'));
        
        container.innerHTML = `
            <div style="margin-bottom:20px">
                <button class="btn-primary" onclick="document.getElementById('createPromoModal').classList.add('open')">+ Создать промокод</button>
            </div>
            ${snapshot.empty ? '<div class="empty-cart">🎫 Промокодов пока нет</div>' : ''}
            ${snapshot.docs.map(doc => {
                const promo = doc.data();
                const expiresText = promo.expiresAt?.toDate().toLocaleDateString() || 'бессрочно';
                const isExpired = promo.expiresAt && promo.expiresAt.toDate() < new Date();
                
                return `
                    <div class="promo-item" style="${isExpired ? 'opacity:0.5' : ''}">
                        <div>
                            <strong>${promo.code}</strong><br>
                            <small>${promo.type === 'percentage' ? promo.value + '%' : promo.value + ' ₽'}</small><br>
                            <small>📅 Действует до: ${expiresText}</small><br>
                            <small>${promo.isActive ? '✅ Активен' : '❌ Неактивен'}</small>
                        </div>
                        <button class="btn-danger" onclick="window.deletePromo('${doc.id}')">🗑 Удалить</button>
                    </div>
                `;
            }).join('')}
        `;
        
    } catch (error) {
        console.error('Load promos error:', error);
        container.innerHTML = '<div class="empty-cart">❌ Ошибка загрузки промокодов</div>';
    } finally {
        showLoading(false);
    }
}

// Удаление промокода
window.deletePromo = async (promoId) => {
    if (confirm('Удалить промокод?')) {
        showLoading(true);
        try {
            await deleteDoc(doc(db, 'promocodes', promoId));
            showToast('Промокод удален', 'success');
            await loadPromoCodes();
        } catch (error) {
            showToast('Ошибка удаления', 'error');
        } finally {
            showLoading(false);
        }
    }
};

// Создание промокода
window.createPromoCode = async () => {
    const code = document.getElementById('promoCode')?.value.toUpperCase();
    const type = document.getElementById('promoType')?.value;
    const value = parseInt(document.getElementById('promoValue')?.value);
    const expiresAt = document.getElementById('promoExpires')?.value;
    
    if (!code || !value) {
        showToast('Заполните код и значение скидки', 'error');
        return;
    }
    
    if (value <= 0) {
        showToast('Значение скидки должно быть больше 0', 'error');
        return;
    }
    
    if (type === 'percentage' && value > 100) {
        showToast('Процент скидки не может превышать 100%', 'error');
        return;
    }
    
    showLoading(true);
    try {
        await addDoc(collection(db, 'promocodes'), {
            code: code,
            type: type,
            value: value,
            isActive: true,
            expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
            createdAt: Timestamp.now(),
            createdBy: auth.currentUser?.email || 'admin'
        });
        
        showToast('Промокод создан', 'success');
        document.getElementById('createPromoModal')?.classList.remove('open');
        document.getElementById('promoCode').value = '';
        document.getElementById('promoValue').value = '';
        document.getElementById('promoExpires').value = '';
        await loadPromoCodes();
        
    } catch (error) {
        console.error('Create promo error:', error);
        showToast('Ошибка создания промокода', 'error');
    } finally {
        showLoading(false);
    }
};

// Закрыть модалку создания промокода
window.closeCreatePromoModal = () => {
    document.getElementById('createPromoModal')?.classList.remove('open');
};

// Загрузка статистики
export async function loadStats() {
    const container = document.getElementById('adminStats');
    if (!container) return;
    
    showLoading(true);
    try {
        const ordersSnap = await getDocs(collection(db, 'orders'));
        const usersSnap = await getDocs(collection(db, 'users'));
        const chatsSnap = await getDocs(collection(db, 'chats'));
        
        let totalRevenue = 0;
        let pendingOrders = 0;
        let completedOrders = 0;
        
        ordersSnap.forEach(doc => {
            const order = doc.data();
            totalRevenue += order.total || 0;
            if (order.status === 'pending') pendingOrders++;
            if (order.status === 'completed') completedOrders++;
        });
        
        container.innerHTML = `
            <div class="counter-grid" style="margin-top:0">
                <div class="counter-card">
                    <span class="counter-val">${ordersSnap.size}</span>
                    <span class="counter-label">📦 Всего заказов</span>
                </div>
                <div class="counter-card">
                    <span class="counter-val">${pendingOrders}</span>
                    <span class="counter-label">⏳ Ожидают</span>
                </div>
                <div class="counter-card">
                    <span class="counter-val">${completedOrders}</span>
                    <span class="counter-label">✅ Выполнено</span>
                </div>
                <div class="counter-card">
                    <span class="counter-val">${usersSnap.size}</span>
                    <span class="counter-label">👥 Пользователей</span>
                </div>
                <div class="counter-card">
                    <span class="counter-val">${chatsSnap.size}</span>
                    <span class="counter-label">💬 Чатов</span>
                </div>
                <div class="counter-card">
                    <span class="counter-val">${totalRevenue.toLocaleString()} ₽</span>
                    <span class="counter-label">💰 Общая выручка</span>
                </div>
            </div>
            <div style="margin-top:32px; text-align:center; padding:24px; background:var(--surface2); border-radius:16px">
                <i class="fas fa-chart-line" style="font-size:2rem; color:var(--gold); margin-bottom:16px; display:block"></i>
                <p style="color:var(--muted)">📊 Детальная статистика с графиками будет доступна после настройки Cloudflare Worker</p>
            </div>
        `;
        
    } catch (error) {
        console.error('Load stats error:', error);
        container.innerHTML = '<div class="empty-cart">❌ Ошибка загрузки статистики</div>';
    } finally {
        showLoading(false);
    }
}

// Переключение вкладок админки
export function switchAdminTab(tab) {
    currentAdminView = tab;
    
    // Обновляем активную вкладку
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Показываем/скрываем контейнеры
    const ordersDiv = document.getElementById('adminOrdersList');
    const usersDiv = document.getElementById('adminUsersList');
    const chatsDiv = document.getElementById('adminChatsList');
    const promosDiv = document.getElementById('adminPromoCodes');
    const statsDiv = document.getElementById('adminStats');
    
    if (ordersDiv) ordersDiv.style.display = tab === 'orders' ? 'block' : 'none';
    if (usersDiv) usersDiv.style.display = tab === 'users' ? 'block' : 'none';
    if (chatsDiv) chatsDiv.style.display = tab === 'chats' ? 'block' : 'none';
    if (promosDiv) promosDiv.style.display = tab === 'promos' ? 'block' : 'none';
    if (statsDiv) statsDiv.style.display = tab === 'stats' ? 'block' : 'none';
    
    // Загружаем данные
    if (tab === 'orders') loadAllOrders();
    if (tab === 'users') loadAllUsers();
    if (tab === 'chats') loadAllChats();
    if (tab === 'promos') loadPromoCodes();
    if (tab === 'stats') loadStats();
}

// Инициализация админки
export async function initAdminPanel() {
    const isAdmin = await requireAdmin();
    if (!isAdmin) return;
    
    // Загружаем начальную вкладку
    loadAllOrders();
}

// Глобальные функции
window.switchAdminTab = switchAdminTab;
window.closeReplyChatModal = closeReplyChatModal;
window.sendAdminReply = sendAdminReply;
window.closeCreatePromoModal = closeCreatePromoModal;
window.createPromoCode = createPromoCode;
window.deletePromo = deletePromo;
window.openReplyChat = openReplyChat;
window.closeChatAdmin = closeChatAdmin;

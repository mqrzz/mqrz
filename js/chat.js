import { 
    db, auth, collection, addDoc, getDocs, query, where, orderBy, 
    onSnapshot, Timestamp, updateDoc, doc, getDoc, limit
} from './firebase-config.js';
import { showToast, showLoading, sendEmailNotification } from './main.js';

let currentChatId = null;
let messagesUnsubscribe = null;
let currentUser = null;

// Создание нового чата
export async function createChat(topic = 'general') {
    const user = auth.currentUser;
    if (!user) {
        showToast('Войдите в аккаунт для создания чата', 'error');
        return null;
    }
    
    showLoading(true);
    try {
        const chatRef = await addDoc(collection(db, 'chats'), {
            userId: user.uid,
            userEmail: user.email,
            userDisplayName: user.displayName || user.email.split('@')[0],
            topic: topic,
            status: 'open',
            createdAt: Timestamp.now(),
            lastMessage: '',
            lastMessageTime: Timestamp.now(),
            lastSenderId: null,
            operatorId: null,
            operatorName: null,
            unreadCount: 0
        });
        
        // Отправляем уведомление админам (через Cloudflare Worker)
        await notifyAdminsAboutNewChat(chatRef.id, user.email);
        
        return chatRef.id;
    } catch (error) {
        console.error('Create chat error:', error);
        showToast('Ошибка создания чата', 'error');
        return null;
    } finally {
        showLoading(false);
    }
}

// Получение или создание активного чата пользователя
export async function getOrCreateUserChat() {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
        // Ищем открытый чат пользователя
        const q = query(
            collection(db, 'chats'), 
            where('userId', '==', user.uid), 
            where('status', '==', 'open'),
            limit(1)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        } else {
            return await createChat();
        }
    } catch (error) {
        console.error('Get or create chat error:', error);
        return await createChat();
    }
}

// Отправка сообщения
export async function sendMessage(chatId, message, fileUrl = null) {
    const user = auth.currentUser;
    if (!user) {
        showToast('Войдите в аккаунт для отправки сообщений', 'error');
        return false;
    }
    
    if (!message.trim() && !fileUrl) {
        showToast('Введите сообщение', 'error');
        return false;
    }
    
    try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text: message.trim() || (fileUrl ? '📎 Отправил(а) файл' : ''),
            senderId: user.uid,
            senderName: user.displayName || user.email,
            senderEmail: user.email,
            timestamp: Timestamp.now(),
            read: false,
            fileUrl: fileUrl || null
        });
        
        // Обновляем информацию о последнем сообщении в чате
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: message.trim() || '📎 Файл',
            lastMessageTime: Timestamp.now(),
            lastSenderId: user.uid,
            unreadCount: admin ? 0 : (await getUnreadCount(chatId) + 1)
        });
        
        return true;
    } catch (error) {
        console.error('Send message error:', error);
        showToast('Ошибка отправки сообщения', 'error');
        return false;
    }
}

// Получение количества непрочитанных сообщений
async function getUnreadCount(chatId) {
    const user = auth.currentUser;
    if (!user) return 0;
    
    const q = query(
        collection(db, 'chats', chatId, 'messages'),
        where('read', '==', false),
        where('senderId', '!=', user.uid)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
}

// Загрузка сообщений чата с реальным временем
export function loadMessages(chatId, containerId) {
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
    }
    
    const q = query(
        collection(db, 'chats', chatId, 'messages'),
        orderBy('timestamp', 'asc')
    );
    
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isUser = msg.senderId === auth.currentUser?.uid;
            const date = msg.timestamp?.toDate();
            
            const timeStr = date ? date.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            }) : '';
            
            const dateStr = date ? date.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }) : '';
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${isUser ? 'user' : 'support'}`;
            
            let fileHtml = '';
            if (msg.fileUrl) {
                const isImage = msg.fileUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                if (isImage) {
                    fileHtml = `<a href="${msg.fileUrl}" target="_blank" style="display:block;margin-bottom:8px">
                        <img src="${msg.fileUrl}" style="max-width:200px;max-height:150px;border-radius:8px" alt="Вложение">
                    </a>`;
                } else {
                    fileHtml = `<a href="${msg.fileUrl}" target="_blank" style="display:block;margin-bottom:8px">📎 Скачать файл</a>`;
                }
            }
            
            messageDiv.innerHTML = `
                ${fileHtml}
                ${msg.text}
                <span class="chat-message-time">${dateStr} ${timeStr} ${!isUser && msg.read ? '✓✓' : isUser ? '✓' : ''}</span>
            `;
            
            container.appendChild(messageDiv);
        });
        
        container.scrollTop = container.scrollHeight;
    });
    
    // Отмечаем сообщения как прочитанные
    markMessagesAsRead(chatId);
}

// Отметить сообщения как прочитанные
export async function markMessagesAsRead(chatId) {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            where('read', '==', false),
            where('senderId', '!=', user.uid)
        );
        const snapshot = await getDocs(q);
        
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.update(doc.ref, { read: true });
        });
        await batch.commit();
        
        // Сбрасываем счетчик непрочитанных
        await updateDoc(doc(db, 'chats', chatId), {
            unreadCount: 0
        });
    } catch (error) {
        console.error('Mark messages as read error:', error);
    }
}

// Отправка сообщения с причиной обращения
export async function sendReasonMessage(chatId, reason, details) {
    const reasonMessages = {
        'order': '📦 Вопрос по заказу',
        'payment': '💰 Вопрос по оплате',
        'services': '🎨 Вопрос по услугам',
        'operator': '👨‍💼 Связаться с оператором'
    };
    
    const message = `${reasonMessages[reason] || reason}\n📝 Детали: ${details || 'Не указаны'}`;
    return await sendMessage(chatId, message);
}

// Уведомление админов о новом чате
async function notifyAdminsAboutNewChat(chatId, userEmail) {
    try {
        // Здесь будет вызов твоего Cloudflare Worker
        console.log(`Новый чат ${chatId} от пользователя ${userEmail}`);
    } catch (error) {
        console.error('Notify admins error:', error);
    }
}

// Получение всех чатов (для админа)
export async function getAllChats() {
    try {
        const q = query(collection(db, 'chats'), orderBy('lastMessageTime', 'desc'));
        const snapshot = await getDocs(q);
        const chats = [];
        snapshot.forEach(doc => {
            chats.push({ id: doc.id, ...doc.data() });
        });
        return chats;
    } catch (error) {
        console.error('Get all chats error:', error);
        return [];
    }
}

// Ответ на чат от админа
export async function adminReplyToChat(chatId, message) {
    const user = auth.currentUser;
    if (!user) return false;
    
    try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text: message,
            senderId: user.uid,
            senderName: 'Admin',
            senderEmail: user.email,
            timestamp: Timestamp.now(),
            read: false,
            fileUrl: null
        });
        
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: message,
            lastMessageTime: Timestamp.now(),
            lastSenderId: user.uid,
            operatorId: user.uid,
            operatorName: user.email
        });
        
        // Отправляем email уведомление пользователю
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        const chat = chatDoc.data();
        
        if (chat && chat.userEmail) {
            await sendEmailNotification(
                chat.userEmail,
                'Новый ответ в чате поддержки Design Antviz',
                `Здравствуйте!\n\nПоступил новый ответ от оператора в чате поддержки.\n\nСообщение: ${message}\n\nПерейдите в чат, чтобы продолжить общение.\n\nС уважением, команда Design Antviz.`
            );
        }
        
        return true;
    } catch (error) {
        console.error('Admin reply error:', error);
        return false;
    }
}

// Закрытие чата
export async function closeChat(chatId) {
    try {
        await updateDoc(doc(db, 'chats', chatId), {
            status: 'closed',
            closedAt: Timestamp.now()
        });
        showToast('Чат закрыт', 'success');
        return true;
    } catch (error) {
        console.error('Close chat error:', error);
        return false;
    }
}

// Кнопки быстрых действий для чата
export const quickActions = [
    { text: "📦 Вопрос по заказу", value: "order" },
    { text: "💰 Оплата", value: "payment" },
    { text: "🎨 Услуги и цены", value: "services" },
    { text: "👨‍💼 Связаться с оператором", value: "operator" }
];

// Рендер кнопок быстрых действий
export function renderQuickButtons(containerId, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = quickActions.map(action => `
        <button class="quick-btn" data-value="${action.value}">
            ${action.text}
        </button>
    `).join('');
    
    container.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const value = btn.dataset.value;
            if (onSelect) onSelect(value);
        });
    });
}

// Глобальные функции для HTML
window.sendChatMessage = async () => {
    const input = document.getElementById('chatMessageInput');
    const msg = input?.value.trim();
    if (!msg) return;
    
    if (!currentChatId) {
        currentChatId = await getOrCreateUserChat();
    }
    
    await sendMessage(currentChatId, msg);
    if (input) input.value = '';
};

window.sendReasonAndMessage = async (reason, details) => {
    if (!currentChatId) {
        currentChatId = await getOrCreateUserChat();
    }
    await sendReasonMessage(currentChatId, reason, details);
};

// Экспорт
export { currentChatId, messagesUnsubscribe };

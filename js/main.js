import { auth, onAuthStateChanged, signOut, doc, getDoc, db, Timestamp, updateDoc } from './firebase-config.js';

// Глобальные переменные
let currentUser = null;
let isAdmin = false;

// Показать уведомление
export function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const textSpan = document.getElementById('toastText');
    if (!toast) return;
    
    textSpan.textContent = message;
    
    // Меняем цвет в зависимости от типа
    if (type === 'error') {
        toast.style.background = '#EF4444';
        toast.style.color = '#fff';
    } else if (type === 'warning') {
        toast.style.background = '#F59E0B';
        toast.style.color = '#fff';
    } else {
        toast.style.background = 'var(--surface)';
        toast.style.color = 'var(--gold)';
    }
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Показать/скрыть глобальный лоадер
export function showLoading(show) {
    let loader = document.getElementById('global-loader');
    if (!loader && show) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center';
        loader.innerHTML = '<div style="width:50px;height:50px;border:3px solid var(--gold);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>';
        document.body.appendChild(loader);
        
        // Добавляем анимацию, если её нет
        if (!document.querySelector('#loader-style')) {
            const style = document.createElement('style');
            style.id = 'loader-style';
            style.textContent = '@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
    }
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// Проверка, является ли пользователь админом (через custom claims)
export async function checkIsAdmin(user) {
    if (!user) return false;
    try {
        const idTokenResult = await user.getIdTokenResult();
        return idTokenResult.claims.admin === true;
    } catch (error) {
        console.error('Ошибка проверки прав админа:', error);
        return false;
    }
}

// Обновление навигации в зависимости от авторизации
export function updateNavAuth(user) {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;
    
    if (user) {
        // Пользователь авторизован - показываем аватар
        authContainer.innerHTML = `
            <div class="user-avatar" onclick="window.location.href='/profile.html'">
                <i class="fas fa-user"></i>
            </div>
        `;
        
        // Показываем ссылку на админку если пользователь админ
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) {
            checkIsAdmin(user).then(isAdmin => {
                adminLink.style.display = isAdmin ? 'block' : 'none';
            });
        }
    } else {
        // Пользователь не авторизован - показываем кнопку входа
        authContainer.innerHTML = `<button class="auth-btn" onclick="window.showAuthModal && window.showAuthModal()">Войти / Регистрация</button>`;
    }
}

// Показать модалку авторизации
export function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('open');
}

// Закрыть модалку авторизации
export function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('open');
}

// Звездное поле (твой оригинал)
export function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let stars = [];
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    for (let i = 0; i < 180; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.2 + 0.2,
            alpha: Math.random()
        });
    }
    
    function drawStars() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => {
            s.alpha += 0.008 * (Math.random() > 0.5 ? 1 : -1);
            s.alpha = Math.max(0.05, Math.min(1, s.alpha));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(232,197,71,${s.alpha * 0.4})`;
            ctx.fill();
        });
        requestAnimationFrame(drawStars);
    }
    
    drawStars();
}

// Кастомный курсор (твой оригинал)
export function initCursor() {
    const cur = document.getElementById('cursor');
    const trail = document.getElementById('cursorTrail');
    if (!cur || !trail) return;
    
    let tx = 0, ty = 0, cx = 0, cy = 0;
    
    document.addEventListener('mousemove', e => {
        tx = e.clientX;
        ty = e.clientY;
        cur.style.left = tx + 'px';
        cur.style.top = ty + 'px';
    });
    
    function animTrail() {
        cx += (tx - cx) * 0.15;
        cy += (ty - cy) * 0.15;
        trail.style.left = cx + 'px';
        trail.style.top = cy + 'px';
        requestAnimationFrame(animTrail);
    }
    
    animTrail();
    
    // Эффекты при наведении на кликабельные элементы
    const clickableElements = document.querySelectorAll('button, a, .service-card, .faq-q, .add-btn, .nav-cta, .auth-btn, .quick-btn, .admin-tab');
    clickableElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cur.style.width = '20px';
            cur.style.height = '20px';
            cur.style.background = 'transparent';
            cur.style.border = '2px solid var(--gold)';
        });
        el.addEventListener('mouseleave', () => {
            cur.style.width = '10px';
            cur.style.height = '10px';
            cur.style.background = 'var(--gold)';
            cur.style.border = 'none';
        });
    });
}

// Scroll reveal анимация (твой оригинал)
export function initReveal() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                observer.unobserve(e.target);
            }
        });
    }, { threshold: 0.15 });
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// Navbar скролл эффект (твой оригинал)
export function initNavbar() {
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('navbar');
        if (nav) {
            nav.classList.toggle('scrolled', window.scrollY > 60);
        }
    });
}

// Отправка email уведомления через Cloudflare Worker
export async function sendEmailNotification(to, subject, body) {
    try {
        // Здесь будет вызов твоего Cloudflare Worker для отправки email
        // Пока просто логируем в консоль
        console.log(`Email уведомление: ${to} - ${subject} - ${body}`);
        
        // Когда настроишь Cloudflare Worker, раскомментируй:
        // const response = await fetch('https://твой-воркер.workers.dev/send-email', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ to, subject, body })
        // });
        // return response.ok;
        
        return true;
    } catch (error) {
        console.error('Ошибка отправки email:', error);
        return false;
    }
}

// Получить текущего пользователя
export function getCurrentUser() {
    return currentUser;
}

// Установить текущего пользователя
export function setCurrentUser(user) {
    currentUser = user;
}

// Получить статус админа
export function getIsAdmin() {
    return isAdmin;
}

// Инициализация auth listener
export function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateNavAuth(user);
        
        if (user) {
            isAdmin = await checkIsAdmin(user);
            
            // Обновляем профиль пользователя в Firestore при входе
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) {
                await setDoc(userRef, {
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    role: isAdmin ? 'admin' : 'user',
                    createdAt: Timestamp.now(),
                    lastLogin: Timestamp.now(),
                    isBlocked: false,
                    telegram: '',
                    phone: '',
                    emailVerified: user.emailVerified
                });
            } else {
                await updateDoc(userRef, {
                    lastLogin: Timestamp.now(),
                    emailVerified: user.emailVerified
                });
            }
        }
    });
}

// Инициализация всего
export function initApp() {
    initStarfield();
    initCursor();
    initReveal();
    initNavbar();
    initAuthListener();
}

// Запускаем инициализацию при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Экспортируем функции в глобальный объект window для использования в HTML
window.showToast = showToast;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.getCurrentUser = getCurrentUser;

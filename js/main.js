// ========== ИМПОРТЫ FIREBASE ==========
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, googleProvider, signInWithPopup, doc, setDoc, getDoc, Timestamp, updateDoc, onAuthStateChanged, signOut, db } from './firebase-config.js';

// ========== УВЕДОМЛЕНИЯ ==========
export function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const textSpan = document.getElementById('toastText');
    if (!toast) return;
    textSpan.textContent = message;
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

export function showLoading(show) {
    let loader = document.getElementById('global-loader');
    if (!loader && show) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center';
        loader.innerHTML = '<div style="width:50px;height:50px;border:3px solid var(--gold);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>';
        document.body.appendChild(loader);
        if (!document.querySelector('#loader-style')) {
            const style = document.createElement('style');
            style.id = 'loader-style';
            style.textContent = '@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
    }
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// ========== ЗВЕЗДНОЕ ПОЛЕ (ТВОЙ ОРИГИНАЛ) ==========
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

// ========== КАСТОМНЫЙ КУРСОР (ТВОЙ ОРИГИНАЛ) ==========
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
    function updateHoverEffects() {
        const elements = document.querySelectorAll('button, a, .service-card, .faq-q, .add-btn, .nav-cta, .auth-btn, .quick-btn, .admin-tab, .fav-icon, .cart-icon, .user-avatar');
        elements.forEach(el => {
            el.removeEventListener('mouseenter', handleMouseEnter);
            el.removeEventListener('mouseleave', handleMouseLeave);
            el.addEventListener('mouseenter', handleMouseEnter);
            el.addEventListener('mouseleave', handleMouseLeave);
        });
    }
    function handleMouseEnter() {
        cur.style.width = '20px';
        cur.style.height = '20px';
        cur.style.background = 'transparent';
        cur.style.border = '2px solid var(--gold)';
    }
    function handleMouseLeave() {
        cur.style.width = '10px';
        cur.style.height = '10px';
        cur.style.background = 'var(--gold)';
        cur.style.border = 'none';
    }
    updateHoverEffects();
    const observer = new MutationObserver(updateHoverEffects);
    observer.observe(document.body, { childList: true, subtree: true });
}

// ========== SCROLL REVEAL (ТВОЙ ОРИГИНАЛ) ==========
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

// ========== НАВБАР ПРИ СКРОЛЛЕ ==========
export function initNavbar() {
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('navbar');
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
    });
}

// ========== АНИМАЦИЯ СЧЕТЧИКОВ ==========
export function initCounters() {
    const counters = document.querySelectorAll('.counter, .counter2');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.target);
                if (!target || isNaN(target)) return;
                let current = 0;
                const step = target / 60;
                const timer = setInterval(() => {
                    current = Math.min(current + step, target);
                    el.textContent = Math.floor(current);
                    if (current >= target) clearInterval(timer);
                }, 16);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });
    counters.forEach(counter => observer.observe(counter));
}

// ========== АНИМАЦИЯ БАРОВ ==========
export function initBars() {
    const bars = document.querySelectorAll('.bar-fill');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    bars.forEach(bar => observer.observe(bar));
}

// ========== FAQ TOGGLE ==========
export function initFaq() {
    window.toggleFaq = function(el) {
        const item = el.parentElement;
        const ans = item.querySelector('.faq-a');
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(i => {
            i.classList.remove('open');
            const a = i.querySelector('.faq-a');
            if (a) a.classList.remove('open');
        });
        if (!wasOpen) {
            item.classList.add('open');
            if (ans) ans.classList.add('open');
        }
    };
}

// ========== КАЛЬКУЛЯТОР ROI ==========
export function initROICalculator() {
    window.calcROI = function() {
        const price = +document.getElementById('ri-price')?.value || 0;
        const views = +document.getElementById('ri-views')?.value || 0;
        const ctr = +document.getElementById('ri-ctr')?.value || 0;
        const conv = +document.getElementById('ri-conv')?.value || 0;
        const margin = +document.getElementById('ri-margin')?.value || 0;
        const clicks = views * ctr / 100;
        const orders = clicks * conv / 100;
        const profit = orders * price * margin / 100;
        const newProfit = profit * 1.4;
        const delta = newProfit - profit;
        const payback = delta > 0 ? Math.ceil(200 / (delta / 30)) : 0;
        const fmt = (n) => n >= 1000 ? Math.round(n/100)/10 + 'к' : Math.round(n);
        const resNow = document.getElementById('res-now');
        const resAfter = document.getElementById('res-after');
        const resDelta = document.getElementById('res-delta');
        const resPayback = document.getElementById('res-payback');
        const resOrders = document.getElementById('res-orders');
        if (resNow) resNow.textContent = fmt(profit) + ' ₽';
        if (resAfter) resAfter.textContent = fmt(newProfit) + ' ₽';
        if (resDelta) resDelta.textContent = `+${fmt(delta)} ₽ / мес`;
        if (resPayback) resPayback.textContent = (payback > 0 && payback < 31) ? payback + ' дней' : '< мес';
        if (resOrders) resOrders.textContent = '+' + Math.round(orders * 0.4);
    };
    const calcBtn = document.getElementById('calcBtn');
    if (calcBtn) {
        calcBtn.addEventListener('click', () => {
            const roiSection = document.getElementById('roiCalc');
            if (roiSection) roiSection.scrollIntoView({ behavior: 'smooth' });
        });
    }
    if (document.getElementById('ri-price')) window.calcROI();
}

// ========== МОДАЛКИ ==========
export function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('open');
}
export function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('open');
}
document.addEventListener('click', function(e) {
    const modal = document.getElementById('authModal');
    if (e.target === modal) closeAuthModal();
    const serviceModal = document.getElementById('modalOv');
    if (e.target === serviceModal && window.closeModal) window.closeModal();
});

// ========== АВТОРИЗАЦИЯ ==========
export async function loginWithEmail(email, password) {
    if (!email || !password) { showToast('Заполните email и пароль', 'error'); return false; }
    showLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Вход выполнен', 'success');
        closeAuthModal();
        setTimeout(() => window.location.reload(), 500);
        return true;
    } catch (error) {
        let msg = 'Ошибка входа';
        if (error.code === 'auth/invalid-credential') msg = 'Неверный email или пароль';
        if (error.code === 'auth/user-not-found') msg = 'Пользователь не найден';
        showToast(msg, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}
export async function registerWithEmail(email, password) {
    if (!email || !password) { showToast('Заполните email и пароль', 'error'); return false; }
    if (password.length < 6) { showToast('Пароль должен быть не менее 6 символов', 'error'); return false; }
    showLoading(true);
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCred.user.uid), {
            email: email, displayName: email.split('@')[0], role: 'user',
            createdAt: Timestamp.now(), lastLogin: Timestamp.now(),
            isBlocked: false, isDeleted: false, telegram: '', phone: ''
        });
        showToast('Регистрация успешна!', 'success');
        closeAuthModal();
        setTimeout(() => window.location.reload(), 500);
        return true;
    } catch (error) {
        let msg = 'Ошибка регистрации';
        if (error.code === 'auth/email-already-in-use') msg = 'Email уже используется';
        if (error.code === 'auth/weak-password') msg = 'Слабый пароль';
        showToast(msg, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}
export async function loginWithGoogle() {
    showLoading(true);
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const userRef = doc(db, 'users', result.user.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            await setDoc(userRef, {
                email: result.user.email, displayName: result.user.displayName || result.user.email.split('@')[0],
                role: 'user', createdAt: Timestamp.now(), lastLogin: Timestamp.now(),
                isBlocked: false, isDeleted: false, telegram: '', phone: '', avatar: result.user.photoURL || ''
            });
        }
        showToast('Вход выполнен', 'success');
        closeAuthModal();
        setTimeout(() => window.location.reload(), 500);
        return true;
    } catch (error) {
        showToast('Ошибка входа через Google', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}
export async function resetPassword(email) {
    if (!email) { showToast('Введите email', 'error'); return false; }
    showLoading(true);
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Ссылка для сброса пароля отправлена', 'success');
        return true;
    } catch (error) {
        showToast('Пользователь не найден', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}
export async function logout() {
    showLoading(true);
    try {
        await signOut(auth);
        showToast('Вы вышли', 'success');
        setTimeout(() => window.location.href = '/index.html', 500);
    } catch (error) {
        showToast('Ошибка выхода', 'error');
    } finally {
        showLoading(false);
    }
}
export async function checkIsAdmin(user) {
    if (!user) return false;
    try {
        const idTokenResult = await user.getIdTokenResult();
        return idTokenResult.claims.admin === true;
    } catch (error) {
        return false;
    }
}
export function updateNavAuth(user) {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;
    if (user) {
        authContainer.innerHTML = `<div class="user-avatar" onclick="window.location.href='/profile.html'"><i class="fas fa-user"></i></div>`;
    } else {
        authContainer.innerHTML = `<button class="auth-btn" onclick="window.showAuthModal()">Войти / Регистрация</button>`;
    }
}

// ========== КОРЗИНА И ИЗБРАННОЕ ==========
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
export function updateCartUI() {
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    const badge = document.getElementById('cartCountBadge');
    if (badge) badge.textContent = count;
    localStorage.setItem('cart', JSON.stringify(cart));
}
export function updateFavUI() {
    const badge = document.getElementById('favCountBadge');
    if (badge) badge.textContent = favorites.length;
    localStorage.setItem('favorites', JSON.stringify(favorites));
}
export const servicesData = [
    {id:1, name:"Wildberries инфографика", price:200, badge:"Хит", desc:"Готовые макеты карточек товара", icon:"fab fa-wpforms", tags:["WB","48ч"], benefits:["Увеличение CTR до +40%","Адаптация под WB"]},
    {id:2, name:"OZON инфографика", price:200, badge:"Популярное", desc:"Адаптация под OZON", icon:"fas fa-chart-simple", tags:["OZON","48ч"], benefits:["Соблюдение гайдлайнов","Высокое качество"]},
    {id:3, name:"Яндекс.Маркет инфографика", price:200, badge:"", desc:"Дизайн для DBS и FBS", icon:"fas fa-chart-line", tags:["Яндекс","48ч"], benefits:["Адаптация под DBS/FBS","SEO-оптимизация"]},
    {id:4, name:"Сезонный редизайн", price:99, badge:"Выгодно", desc:"Обновление под праздники", icon:"fas fa-gift", tags:["Праздники","4-8ч"], benefits:["Готовые шаблоны","Скидка 30%"]},
    {id:5, name:"Рекламный креатив", price:600, badge:"", desc:"Баннеры для таргета", icon:"fas fa-bullhorn", tags:["Баннер","3 варианта"], benefits:["3 варианта макета","Адаптация под все форматы"]},
    {id:6, name:"Дизайн визиток", price:300, badge:"", desc:"Фирменные визитки", icon:"fas fa-id-card", tags:["Печать","2 варианта"], benefits:["2 варианта дизайна","Макет для печати"]},
    {id:7, name:"Слайд-презентация (ИИ)", price:99, badge:"Быстро", desc:"1 слайд в современном стиле", icon:"fas fa-chalkboard-user", tags:["1 слайд","AI"], benefits:["AI-генерация","Формат PPTX/PDF"]},
    {id:8, name:"Полная презентация", price:799, badge:"Премиум", desc:"Презентация 8-12 слайдов", icon:"fas fa-file-powerpoint", tags:["8-12 слайдов","Анимация"], benefits:["Уникальный дизайн","Анимация"]},
    {id:9, name:"Статический сайт под ключ", price:15000, badge:"Новинка", desc:"Полноценный статический сайт", icon:"fas fa-globe", tags:["Адаптив","SEO"], benefits:["Уникальный дизайн","Адаптация под все устройства"]}
];
export function addToCart(serviceId, quantity = 1) {
    const service = servicesData.find(s => s.id === serviceId);
    if (!service) return;
    const existing = cart.find(i => i.id === serviceId);
    if (existing) existing.quantity += quantity;
    else cart.push({ ...service, quantity });
    updateCartUI();
    showToast(`${service.name} добавлен в корзину`, 'success');
}
window.addToCart = addToCart;

// ========== ИНИЦИАЛИЗАЦИЯ ВСЕГО ==========
export function initApp() {
    initStarfield();
    initCursor();
    initNavbar();
    initReveal();
    initCounters();
    initBars();
    initFaq();
    initROICalculator();
    setTimeout(() => {
        if (document.querySelector('.bar-fill')) document.querySelectorAll('.bar-fill').forEach(b => b.classList.add('animate'));
    }, 500);
}

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML ==========
window.showToast = showToast;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.loginWithGoogle = loginWithGoogle;
window.resetPassword = resetPassword;
window.logout = logout;
window.updateCartUI = updateCartUI;
window.updateFavUI = updateFavUI;
window.addToCart = addToCart;

// ========== AUTH LISTENER ==========
onAuthStateChanged(auth, async (user) => {
    updateNavAuth(user);
    updateCartUI();
    updateFavUI();
    if (user) {
        const isAdmin = await checkIsAdmin(user);
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';
    } else {
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) adminLink.style.display = 'none';
    }
});

// ========== ЗАПУСК ==========
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

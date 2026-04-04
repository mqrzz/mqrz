// Импорты Firebase
import { auth, onAuthStateChanged, doc, getDoc, db } from './firebase-config.js';
import { updateNavAuth, checkIsAdmin } from './auth.js';

// Глобальные переменные
let currentUser = null;
let currentIsAdmin = false;

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
    
    function updateCursorOnHover(elements) {
        elements.forEach(el => {
            if (!el) return;
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
    
    // Обновляем курсор для динамических элементов
    const observer = new MutationObserver(() => {
        const elements = document.querySelectorAll('button, a, .service-card, .faq-q, .add-btn, .nav-cta, .auth-btn, .quick-btn, .admin-tab, .fav-icon, .cart-icon, .user-avatar');
        updateCursorOnHover(elements);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    const initialElements = document.querySelectorAll('button, a, .service-card, .faq-q, .add-btn, .nav-cta, .auth-btn, .quick-btn, .admin-tab, .fav-icon, .cart-icon, .user-avatar');
    updateCursorOnHover(initialElements);
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

// ========== NAVBAR СКРОЛЛ (ТВОЙ ОРИГИНАЛ) ==========
export function initNavbar() {
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('navbar');
        if (nav) {
            nav.classList.toggle('scrolled', window.scrollY > 60);
        }
    });
}

// ========== АНИМАЦИЯ СЧЕТЧИКОВ (ТВОЙ ОРИГИНАЛ) ==========
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

// ========== АНИМАЦИЯ БАРОВ (ТВОЙ ОРИГИНАЛ) ==========
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

// ========== FAQ TOGGLE (ТВОЙ ОРИГИНАЛ) ==========
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

// ========== КАЛЬКУЛЯТОР ROI (ТВОЙ ОРИГИНАЛ) ==========
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
        const designCost = 200;
        const payback = delta > 0 ? Math.ceil(designCost / (delta / 30)) : 0;
        
        const fmt = (n) => n >= 1000 ? Math.round(n/100)/10 + 'к' : Math.round(n);
        
        const resNow = document.getElementById('res-now');
        const resAfter = document.getElementById('res-after');
        const resDelta = document.getElementById('res-delta');
        const resPayback = document.getElementById('res-payback');
        const resOrders = document.getElementById('res-orders');
        
        if (resNow) resNow.textContent = fmt(profit) + ' ₽';
        if (resAfter) resAfter.textContent = fmt(newProfit) + ' ₽';
        if (resDelta) resDelta.textContent = `+${fmt(delta)} ₽ / мес дополнительно`;
        if (resPayback) resPayback.textContent = (payback > 0 && payback < 31) ? payback + ' дней' : '< мес';
        if (resOrders) resOrders.textContent = '+' + Math.round(newOrders - orders);
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

// Закрытие модалки по клику вне области
document.addEventListener('click', function(e) {
    const modal = document.getElementById('authModal');
    if (e.target === modal) closeAuthModal();
    
    const serviceModal = document.getElementById('modalOv');
    if (e.target === serviceModal && window.closeModal) window.closeModal();
});

// ========== ОБНОВЛЕНИЕ НАВИГАЦИИ ==========
export function updateNavAuthUI(user) {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;
    
    if (user) {
        authContainer.innerHTML = `
            <div class="user-avatar" onclick="window.location.href='/profile.html'">
                <i class="fas fa-user"></i>
            </div>
        `;
    } else {
        authContainer.innerHTML = `<button class="auth-btn" onclick="window.showAuthModal && window.showAuthModal()">Войти / Регистрация</button>`;
    }
}

// ========== ПРОВЕРКА АДМИНА ==========
export async function isUserAdmin(user) {
    if (!user) return false;
    try {
        const idTokenResult = await user.getIdTokenResult();
        return idTokenResult.claims.admin === true;
    } catch (error) {
        return false;
    }
}

// ========== ГЛОБАЛЬНЫЙ AUTH LISTENER ==========
export function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateNavAuthUI(user);
        
        if (user) {
            currentIsAdmin = await isUserAdmin(user);
            
            // Показываем/скрываем ссылку на админку
            const adminLink = document.querySelector('.admin-link');
            if (adminLink) {
                adminLink.style.display = currentIsAdmin ? 'block' : 'none';
            }
        } else {
            currentIsAdmin = false;
        }
        
        // Обновляем корзину и избранное
        if (window.updateCartUI) window.updateCartUI();
        if (window.updateFavUI) window.updateFavUI();
    });
}

// ========== ОТПРАВКА EMAIL УВЕДОМЛЕНИЙ (ЧЕРЕЗ CLOUDFLARE) ==========
export async function sendEmailNotification(to, subject, body) {
    try {
        // Здесь будет твой Cloudflare Worker
        console.log(`📧 Email: ${to} - ${subject}`);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

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
    initAuthListener();
}

// Запускаем при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Экспорт глобальных функций
window.showToast = showToast;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.sendEmailNotification = sendEmailNotification;

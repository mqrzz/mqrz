// ========== ИМПОРТЫ FIREBASE ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
  updateProfile, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, 
  addDoc, getDocs, query, where, orderBy, Timestamp 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ========== КОНФИГ FIREBASE ==========
const firebaseConfig = {
  apiKey: "AIzaSyDnZYDZ4O8SceE-YE5VQmvHrQp11xmOwww",
  authDomain: "aaaa-1a258.firebaseapp.com",
  projectId: "aaaa-1a258",
  storageBucket: "aaaa-1a258.firebasestorage.app",
  messagingSenderId: "133636868630",
  appId: "1:133636868630:web:20ab0b2dabae524b950337",
  measurementId: "G-Q7HPYSX4QW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// ========== ДАННЫЕ УСЛУГ ==========
export const servicesData = [
  {id:1, name:"Wildberries инфографика", price:200, badge:"Хит", desc:"Готовые макеты карточек товара с акцентами на преимущества.", icon:"fab fa-wpforms", tags:["WB","PNG/PSD","48ч"], benefits:["Увеличение CTR до +40%","Адаптация под требования WB","2 формата на выбор"]},
  {id:2, name:"OZON инфографика", price:200, badge:"Популярное", desc:"Адаптация под требования OZON. Увеличение кликабельности карточки.", icon:"fas fa-chart-simple", tags:["OZON","PNG","Гайдлайны"], benefits:["Соблюдение гайдлайнов OZON","Высокое качество при сжатии","Быстрая загрузка"]},
  {id:3, name:"Яндекс.Маркет инфографика", price:200, badge:"", desc:"Дизайн для DBS и FBS селлеров, визуал под стандарты Яндекса.", icon:"fas fa-chart-line", tags:["Яндекс","DBS/FBS"], benefits:["Адаптация под DBS/FBS","Читаемость на любом фоне","SEO-оптимизация"]},
  {id:4, name:"Сезонный редизайн", price:99, badge:"Выгодно", desc:"Обновление карточек под праздники, акции, распродажи.", icon:"fas fa-gift", tags:["Праздники","4-8ч"], benefits:["Готовые шаблоны под праздники","Скидка 30% от 5 карточек","Срок 4–8 часов"]},
  {id:5, name:"Рекламный креатив", price:600, badge:"", desc:"Баннеры для таргета, сторис, outdoor — яркий дизайн под ключ.", icon:"fas fa-bullhorn", tags:["Баннер","3 варианта"], benefits:["3 варианта макета","Адаптация под все форматы","Готов к запуску"]},
  {id:6, name:"Дизайн визиток", price:300, badge:"", desc:"Фирменные визитки для офлайн-встреч и упаковки заказов.", icon:"fas fa-id-card", tags:["Печать","2 варианта"], benefits:["2 варианта дизайна","Макет для печати","Правки до утверждения"]},
  {id:7, name:"Слайд-презентация (ИИ)", price:99, badge:"Быстро", desc:"1 слайд в современном стиле, готовый для защиты бренда.", icon:"fas fa-chalkboard-user", tags:["1 слайд","AI","PPTX"], benefits:["AI-генерация","Анимация по желанию","Формат PPTX/PDF"]},
  {id:8, name:"Полная презентация", price:799, badge:"Премиум", desc:"Презентация 8–12 слайдов с инфографикой и анимацией.", icon:"fas fa-file-powerpoint", tags:["8-12 слайдов","Анимация"], benefits:["Уникальный дизайн","Анимация переходов","Гайд по использованию"]},
  {id:9, name:"Статический сайт под ключ", price:15000, badge:"Новинка", desc:"Полноценный статический сайт с уникальным дизайном и адаптацией.", icon:"fas fa-globe", tags:["Адаптив","SEO","5-7 дней"], benefits:["Уникальный дизайн","Адаптация под все устройства","Оптимизация для поисковых систем"]}
];

// ========== КОРЗИНА ==========
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
export function updateCartUI() {
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const badge = document.getElementById('cartCountBadge');
  if (badge) badge.textContent = count;
  localStorage.setItem('cart', JSON.stringify(cart));
}
export function addToCart(serviceId, quantity = 1) {
  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;
  const existing = cart.find(i => i.id === serviceId);
  if (existing) existing.quantity += quantity;
  else cart.push({ ...service, quantity: quantity });
  updateCartUI();
  showToast(`${service.name} добавлен в корзину`, 'success');
}
export function removeFromCart(index) { cart.splice(index, 1); updateCartUI(); if(window.renderCartPage) window.renderCartPage(); }
export function getCartTotal() { return cart.reduce((s, i) => s + i.price * i.quantity, 0); }

// ========== ИЗБРАННОЕ ==========
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
export function updateFavUI() {
  const badge = document.getElementById('favCountBadge');
  if (badge) badge.textContent = favorites.length;
  localStorage.setItem('favorites', JSON.stringify(favorites));
}
export function toggleFavorite(serviceId) {
  const index = favorites.indexOf(serviceId);
  if (index === -1) { favorites.push(serviceId); showToast('Добавлено в избранное', 'success'); }
  else { favorites.splice(index, 1); showToast('Удалено из избранного', 'warning'); }
  updateFavUI();
  if(window.renderFavoritesPage) window.renderFavoritesPage();
}
export function isFavorite(serviceId) { return favorites.includes(serviceId); }

// ========== УВЕДОМЛЕНИЯ ==========
export function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const textSpan = document.getElementById('toastText');
  if (!toast) return;
  textSpan.textContent = message;
  if (type === 'error') { toast.style.background = '#EF4444'; toast.style.color = '#fff'; }
  else if (type === 'warning') { toast.style.background = '#F59E0B'; toast.style.color = '#fff'; }
  else { toast.style.background = 'var(--surface)'; toast.style.color = 'var(--gold)'; }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========== ЗВЕЗДНОЕ ПОЛЕ ==========
export function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  for (let i = 0; i < 180; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.2 + 0.2, alpha: Math.random() });
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

// ========== КАСТОМНЫЙ КУРСОР ==========
export function initCursor() {
  const cur = document.getElementById('cursor');
  const trail = document.getElementById('cursorTrail');
  if (!cur || !trail) return;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  document.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; cur.style.left = tx + 'px'; cur.style.top = ty + 'px'; });
  function animTrail() { cx += (tx - cx) * 0.15; cy += (ty - cy) * 0.15; trail.style.left = cx + 'px'; trail.style.top = cy + 'px'; requestAnimationFrame(animTrail); }
  animTrail();
  function updateHover() {
    document.querySelectorAll('button, a, .service-card, .faq-q, .add-btn, .nav-cta, .auth-btn, .quick-btn, .admin-tab, .fav-icon, .cart-icon, .user-avatar').forEach(el => {
      el.addEventListener('mouseenter', () => { cur.style.width = '20px'; cur.style.height = '20px'; cur.style.background = 'transparent'; cur.style.border = '2px solid var(--gold)'; });
      el.addEventListener('mouseleave', () => { cur.style.width = '10px'; cur.style.height = '10px'; cur.style.background = 'var(--gold)'; cur.style.border = 'none'; });
    });
  }
  updateHover();
  new MutationObserver(updateHover).observe(document.body, { childList: true, subtree: true });
}

// ========== SCROLL REVEAL ==========
export function initReveal() {
  new IntersectionObserver(entries => entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }), { threshold: 0.15 })
    .observe = (el) => document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ========== НАВБАР ==========
export function initNavbar() { window.addEventListener('scroll', () => { const nav = document.getElementById('navbar'); if(nav) nav.classList.toggle('scrolled', window.scrollY > 60); }); }

// ========== АНИМАЦИЯ СЧЕТЧИКОВ ==========
export function initCounters() {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if(entry.isIntersecting) {
    const el = entry.target; const target = parseInt(el.dataset.target);
    if(!target || isNaN(target)) return;
    let current = 0; const step = target / 60;
    const timer = setInterval(() => { current = Math.min(current + step, target); el.textContent = Math.floor(current); if(current >= target) clearInterval(timer); }, 16);
    observer.unobserve(el);
  }}), { threshold: 0.5 });
  document.querySelectorAll('.counter, .counter2').forEach(counter => observer.observe(counter));
}

// ========== АНИМАЦИЯ БАРОВ ==========
export function initBars() {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if(entry.isIntersecting) { entry.target.classList.add('animate'); observer.unobserve(entry.target); } }), { threshold: 0.5 });
  document.querySelectorAll('.bar-fill').forEach(bar => observer.observe(bar));
}

// ========== FAQ ==========
export function initFaq() { window.toggleFaq = function(el) { const item = el.parentElement; const ans = item.querySelector('.faq-a'); const wasOpen = item.classList.contains('open'); document.querySelectorAll('.faq-item').forEach(i => { i.classList.remove('open'); i.querySelector('.faq-a')?.classList.remove('open'); }); if(!wasOpen) { item.classList.add('open'); if(ans) ans.classList.add('open'); } }; }

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
    if(document.getElementById('res-now')) document.getElementById('res-now').textContent = fmt(profit) + ' ₽';
    if(document.getElementById('res-after')) document.getElementById('res-after').textContent = fmt(newProfit) + ' ₽';
    if(document.getElementById('res-delta')) document.getElementById('res-delta').textContent = `+${fmt(delta)} ₽ / мес`;
    if(document.getElementById('res-payback')) document.getElementById('res-payback').textContent = (payback > 0 && payback < 31) ? payback + ' дней' : '< мес';
    if(document.getElementById('res-orders')) document.getElementById('res-orders').textContent = '+' + Math.round(orders * 0.4);
  };
  const calcBtn = document.getElementById('calcBtn');
  if(calcBtn) calcBtn.addEventListener('click', () => document.getElementById('roiCalc')?.scrollIntoView({ behavior: 'smooth' }));
  if(document.getElementById('ri-price')) window.calcROI();
}

// ========== МОДАЛКИ ==========
export function showAuthModal() { document.getElementById('authModal')?.classList.add('open'); }
export function closeAuthModal() { document.getElementById('authModal')?.classList.remove('open'); }
document.addEventListener('click', function(e) { if(e.target === document.getElementById('authModal')) closeAuthModal(); });

// ========== АВТОРИЗАЦИЯ ==========
export async function loginWithEmail(email, password) {
  if(!email || !password) { showToast('Заполните все поля', 'error'); return false; }
  try { await signInWithEmailAndPassword(auth, email, password); showToast('Вход выполнен', 'success'); closeAuthModal(); setTimeout(() => window.location.reload(), 500); return true; }
  catch(error) { showToast(error.code === 'auth/invalid-credential' ? 'Неверный email или пароль' : 'Ошибка входа', 'error'); return false; }
}
export async function registerWithEmail(email, password) {
  if(!email || !password) { showToast('Заполните все поля', 'error'); return false; }
  if(password.length < 6) { showToast('Пароль должен быть не менее 6 символов', 'error'); return false; }
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCred.user.uid), { email, displayName: email.split('@')[0], role: 'user', createdAt: Timestamp.now(), lastLogin: Timestamp.now(), isBlocked: false, telegram: '', phone: '' });
    showToast('Регистрация успешна!', 'success'); closeAuthModal(); setTimeout(() => window.location.reload(), 500); return true;
  } catch(error) { showToast(error.code === 'auth/email-already-in-use' ? 'Email уже используется' : 'Ошибка регистрации', 'error'); return false; }
}
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const userRef = doc(db, 'users', result.user.uid);
    if(!(await getDoc(userRef)).exists()) await setDoc(userRef, { email: result.user.email, displayName: result.user.displayName || result.user.email.split('@')[0], role: 'user', createdAt: Timestamp.now(), lastLogin: Timestamp.now(), isBlocked: false, telegram: '', phone: '', avatar: result.user.photoURL || '' });
    showToast('Вход выполнен', 'success'); closeAuthModal(); setTimeout(() => window.location.reload(), 500); return true;
  } catch(error) { showToast('Ошибка входа через Google', 'error'); return false; }
}
export async function resetPassword(email) {
  if(!email) { showToast('Введите email', 'error'); return false; }
  try { await sendPasswordResetEmail(auth, email); showToast('Ссылка для сброса пароля отправлена', 'success'); return true; }
  catch(error) { showToast('Пользователь не найден', 'error'); return false; }
}
export async function logout() { await signOut(auth); showToast('Вы вышли', 'success'); setTimeout(() => window.location.href = '/index.html', 500); }
export async function checkIsAdmin(user) { if(!user) return false; try { const idTokenResult = await user.getIdTokenResult(); return idTokenResult.claims.admin === true; } catch(e) { return false; } }
export function updateNavAuth(user) {
  const container = document.getElementById('authContainer');
  if(!container) return;
  if(user) container.innerHTML = `<div class="user-avatar" onclick="window.location.href='/profile.html'"><i class="fas fa-user"></i></div>`;
  else container.innerHTML = `<button class="auth-btn" onclick="showAuthModal()">Войти / Регистрация</button>`;
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
export function initApp() {
  initStarfield();
  initCursor();
  initNavbar();
  initCounters();
  initBars();
  initFaq();
  initROICalculator();
  // Scroll reveal
  const observer = new IntersectionObserver(entries => entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }), { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ========== AUTH LISTENER ==========
onAuthStateChanged(auth, async (user) => {
  updateNavAuth(user);
  updateCartUI();
  updateFavUI();
  const adminLink = document.querySelector('.admin-link');
  if(adminLink) adminLink.style.display = (user && await checkIsAdmin(user)) ? 'block' : 'none';
});

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==========
window.showToast = showToast;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.loginWithGoogle = loginWithGoogle;
window.resetPassword = resetPassword;
window.logout = logout;
window.addToCart = addToCart;
window.toggleFavorite = toggleFavorite;
window.initApp = initApp;
window.updateCartUI = updateCartUI;
window.updateFavUI = updateFavUI;

// ЗАПУСК ПРИ ЗАГРУЗКЕ
document.addEventListener('DOMContentLoaded', () => { initApp(); });

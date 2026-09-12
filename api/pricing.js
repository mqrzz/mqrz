// Раньше здесь были ЗАДУБЛИРОВАНЫ цены тарифов/допов/промо-логика — третья
// независимая копия той же формулы, что жила в order/index.html и в
// servv/utils/pricing.js. Это и было корнем бага "показывается одна цена,
// в ЮKассе другая": на каждый клик "Оплатить" сумма пересчитывалась заново,
// своей копией, и любое расхождение (забытая правка цены, протухший
// на полпути промокод) напрямую било по факту оплаты.
//
// Теперь единственный источник цен — сервер antviz-backend
// (servv/utils/pricing.js). Для support/ticket_once (плоские тарифы без
// промокода) мы просто спрашиваем актуальные цифры у GET /api/pricing.
// Для order/partial/remaining (заказы с тарифом+допами+промокодом)
// createPayment.js больше вообще не считает сумму сам — берёт уже готовые
// totalPrice/paidAmount/remainingAmount заказа, посчитанные один раз на
// сервере при создании заказа. См. createPayment.js.

const API_BASE = process.env.ANTVIZ_API_URL || 'https://antviz.ru/api';

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30_000; // серверлесс-инстанс может пожить между вызовами — не дёргаем бэк на каждый платёж

export async function getCanonicalPricing() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  const resp = await fetch(`${API_BASE}/pricing`);
  if (!resp.ok) {
    if (cache) return cache; // бэк на секунду прилёг — лучше отдать протухший кэш, чем упасть
    throw new Error(`GET /pricing failed: ${resp.status}`);
  }
  cache = await resp.json();
  cacheAt = Date.now();
  return cache;
}

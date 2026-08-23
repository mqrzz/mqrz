// Единый источник цен и логики расчёта суммы заказа.

export const TIER_PRICES = {
  'Старт':   2900,
  'Рост':    5900,
  'Масштаб': 11900,
  // Тарифы Telegram-ботов/мини-аппов — должны 1-в-1 совпадать с TIERS в order.html
  'Простой бот':   4900,
  'Бот с оплатой': 9900,
  'Mini App':      16900,
};
export const EXTRA_PRICES = {
  content: 2000, shop: 4900, // domain всегда бесплатно (рег.ру)
  bot_pay: 3000, bot_crm: 2500,
};

export const SUPPORT_TARIFFS = {
  basic:    { price: 500,  limit: 5 },
  priority: { price: 1200, limit: 20 },
};
export const DEFAULT_SUPPORT_TARIFF = 'basic';

export const ONE_OFF_TICKET_PRICE = 350;

// order здесь — объект заказа, как его отдаёт наш API (camelCase:
// package, extras, promoCode и т.д.), НЕ сырой Firestore-документ.
// apiAsUser передаём, чтобы сходить в /api/promo-codes/:code от лица
// того же юзера — так действуют те же правила (истёк/не для него),
// что и при обычной проверке промокода на форме заказа.
export async function calcOrderTotal(order, { apiAsUser, token } = {}) {
  const base = TIER_PRICES[order.package];
  if (base == null) throw new Error(`unknown package: ${order.package}`);

  let running = base;
  const extras = Array.isArray(order.extras) ? order.extras : [];
  for (const key of Object.keys(EXTRA_PRICES)) {
    if (extras.includes(key)) running += EXTRA_PRICES[key];
  }
  if (extras.includes('urgent')) {
    running += Math.round(running * 0.3);
  }

  let discount = 0;
  if (order.promoCode && apiAsUser && token) {
    try {
      const resp = await apiAsUser(`/promo-codes/${encodeURIComponent(order.promoCode)}`, token);
      if (resp.ok) {
        const p = await resp.json();
        discount = p.discountType === 'percent'
          ? Math.round(running * p.discountValue / 100)
          : Math.min(p.discountValue, running);
      }
      // Промокод невалиден/не найден/не для этого юзера — эндпоинт вернёт
      // не-ok, discount просто остаётся 0, как и было в исходной логике.
    } catch (e) {
      // Сеть недоступна и т.п. — считаем без скидки, не роняем весь расчёт цены
    }
  }

  return Math.max(0, running - discount);
}

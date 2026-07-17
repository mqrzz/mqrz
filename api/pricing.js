// Единый источник цен и логики расчёта суммы заказа.
// ВАЖНО: раньше createPayment.js и resultUrl.js считали сумму по-разному —
// createPayment.js всегда пересчитывал total из package/extras/promoCode,
// а resultUrl.js (вебхук) при type=partial брал готовое поле data.totalPrice,
// записанное клиентом ещё на этапе оформления заказа. Если промокод к моменту
// вебхука становился невалидным (истёк срок/деактивирован/предназначен другому
// uid), calcOrderTotal() в createPayment.js уже не давал скидку, а вебхук всё
// равно опирался на старое посчитанное с скидкой totalPrice — сумма "остатка",
// которую видел клиент в личном кабинете, переставала совпадать с суммой,
// которую реально спишет платёжный эндпоинт. Теперь оба места используют
// один и тот же calcOrderTotal(), так что расхождений быть не может

export const TIER_PRICES = {
  'Старт':   2900,
  'Рост':    5900,
  'Масштаб': 11900,
};
export const EXTRA_PRICES = { content: 2000, shop: 4900 }; // domain всегда бесплатно (рег.ру)
// Обслуживание НЕ продаётся как extra при оформлении заказа — это отдельная
// подписка (SUPPORT_TARIFFS ниже), которую можно купить только из
// profile/tickets.html после того, как заказ уже готов.

export const SUPPORT_TARIFFS = {
  basic:    { price: 500,  limit: 5 },
  priority: { price: 1200, limit: 20 },
};
export const DEFAULT_SUPPORT_TARIFF = 'basic';

export const ONE_OFF_TICKET_PRICE = 350;

export async function calcOrderTotal(db, order) {
  const base = TIER_PRICES[order.package];
  if (base == null) throw new Error(`unknown package: ${order.package}`);

  let running = base;
  const extras = Array.isArray(order.extras) ? order.extras : [];
  for (const key of ['content', 'shop']) {
    if (extras.includes(key)) running += EXTRA_PRICES[key];
  }
  if (extras.includes('urgent')) {
    running += Math.round(running * 0.3);
  }

  let discount = 0;
  if (order.promoCode) {
    const snap = await db.collection('promoCodes')
      .where('code', '==', order.promoCode)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (!snap.empty) {
      const p = snap.docs[0].data();
      const expired = p.expiresAt?.toDate ? p.expiresAt.toDate() < new Date() : false;
      const wrongUser = p.forUid && p.forUid !== order.uid;
      if (!expired && !wrongUser) {
        discount = p.discountType === 'percent'
          ? Math.round(running * p.discountValue / 100)
          : Math.min(p.discountValue, running);
      }
    }
  }

  return Math.max(0, running - discount);
}

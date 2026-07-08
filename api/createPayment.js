import { db } from './firebaseAdmin.js';

// Единый источник цен — те же цифры, что в order.html (TIERS/extras) и
// в profile/tickets.html (SUPPORT_PRICE). Если меняете цены на сайте —
// меняйте и здесь, иначе сервер будет отклонять реальные платежи.
const TIER_PRICES = {
  'Старт':   2900,
  'Рост':    5900,
  'Масштаб': 11900,
};
const EXTRA_PRICES = { support: 500, content: 2000, shop: 4900 }; // domain всегда бесплатно (рег.ру)
const SUPPORT_RENEWAL_PRICE = 500;

// Пересчитывает сумму заказа на сервере из package/extras/promoCode,
// которые лежат в самом документе Firestore — а не из amount, который
// прислал браузер. Так сумму в ЮКасса нельзя подделать через DevTools.
async function calcOrderTotal(order) {
  const base = TIER_PRICES[order.package];
  if (base == null) throw new Error(`unknown package: ${order.package}`);

  let running = base;
  const extras = Array.isArray(order.extras) ? order.extras : [];
  // domain_reg и domain_own — бесплатно, домен оплачивается на рег.ру
  for (const key of ['support', 'content', 'shop']) {
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

// Описания платежей для чека ЮКасса
const PAYMENT_DESCRIPTIONS = {
  order:     'Оплата заказа',
  partial:   'Предоплата 50% за заказ',
  remaining: 'Доплата остатка по заказу',
  support:   'Продление технического обслуживания',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, type } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  // type: 'order'     — полная оплата заказа (по умолчанию)
  //        'partial'  — первая оплата 50% (предоплата)
  //        'remaining'— доплата оставшихся 50%
  //        'support'  — продление обслуживания
  const paymentType = ['support', 'partial', 'remaining'].includes(type) ? type : 'order';

  let amount;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'order not found' });
    const data = snap.data();

    if (paymentType === 'support') {
      amount = SUPPORT_RENEWAL_PRICE;

    } else if (paymentType === 'partial') {
      if (data.paid) return res.status(400).json({ error: 'order already paid' });
      // Раньше тут не проверялось, не была ли предоплата уже внесена. Если
      // бы этот эндпоинт вызвали дважды с type=partial (повторный клик,
      // старая вкладка, случайный повтор запроса) — создавалась бы вторая
      // предоплата ещё на 50% от суммы, и заказ оказывался переплачен без
      // способа это увидеть на этом шаге.
      if (data.paidAmount > 0) return res.status(400).json({ error: 'partial payment already made, use type=remaining' });
      const total = await calcOrderTotal(data);
      amount = Math.ceil(total / 2);

    } else if (paymentType === 'remaining') {
      const paidAmount = data.paidAmount || 0;
      const total = await calcOrderTotal(data);
      amount = Math.max(0, total - paidAmount);
      if (amount === 0) return res.status(400).json({ error: 'already fully paid' });

    } else {
      if (data.paid) return res.status(400).json({ error: 'order already paid' });
      // Раньше здесь считалась полная сумма заказа с нуля, не глядя на то,
      // вносилась ли уже предоплата (data.paidAmount). Если бы этот путь
      // вызвался на заказе с уже принятой предоплатой (например, случайный
      // повторный вызов из старой вкладки на шаге оформления), клиента
      // отправили бы платить 100% суммы заново поверх уже оплаченных 50% —
      // реальная переплата. Теперь всегда считаем именно остаток к оплате,
      // как и в ветке 'remaining'.
      const total = await calcOrderTotal(data);
      const paidAmount = data.paidAmount || 0;
      amount = Math.max(0, total - paidAmount);
      if (amount === 0) return res.status(400).json({ error: 'already fully paid' });
    }
  } catch (err) {
    console.error('Не удалось посчитать сумму заказа:', err.message);
    return res.status(400).json({ error: 'could not calculate price' });
  }

  const shopId     = process.env.YUKASSA_SHOP_ID;
  const secretKey  = process.env.YUKASSA_SECRET_KEY;
  const returnUrl  = process.env.YUKASSA_RETURN_URL || 'https://mqrz.ru/profile/orders';

  // Idempotency-Key — уникален для каждой попытки платежа
  const idempotencyKey = `${orderId}-${paymentType}-${Date.now()}`;

  const outSum = Number(amount).toFixed(2);

  const body = {
    amount: {
      value: outSum,
      currency: 'RUB',
    },
    confirmation: {
      type: 'redirect',
      return_url: returnUrl,
    },
    capture: true,           // автоматическое подтверждение
    description: `${PAYMENT_DESCRIPTIONS[paymentType]} #${orderId}`,
    metadata: {
      orderId,
      type: paymentType,
    },
  };

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotencyKey,
        // Basic Auth: shopId:secretKey в base64
        'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('ЮКасса API error:', response.status, err);
      return res.status(502).json({ error: 'payment provider error' });
    }

    const payment = await response.json();
    const paymentUrl = payment.confirmation?.confirmation_url;

    if (!paymentUrl) {
      console.error('ЮКасса не вернула confirmation_url:', payment);
      return res.status(502).json({ error: 'no confirmation url' });
    }

    return res.status(200).json({
      paymentUrl,
      amount,
      paymentId: payment.id,   // можно сохранить для отладки
    });

  } catch (err) {
    console.error('Ошибка запроса к ЮКасса:', err.message);
    return res.status(502).json({ error: 'payment provider unavailable' });
  }
}

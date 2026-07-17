import { randomUUID } from 'crypto';
import { db, auth } from './firebaseAdmin.js';
import { SUPPORT_TARIFFS, DEFAULT_SUPPORT_TARIFF, ONE_OFF_TICKET_PRICE, calcOrderTotal } from './pricing.js';

// Описания платежей для чека ЮКасса.
const PAYMENT_DESCRIPTIONS = {
  order:      'Оплата заказа',
  partial:    'Предоплата 50% за заказ',
  remaining:  'Доплата остатка по заказу',
  support:    'Продление технического обслуживания',
  ticket_once:'Оплата разовой заявки на доработку',
};

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://antviz.ru';

export default async function handler(req, res) {
  // Раньше здесь стоял '*' — с любого сайта можно было дёргать этот
  // эндпоинт из браузера. Платёжный API сужаем до собственного домена.
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Раньше эндпоинт принимал orderId без проверки, кто его вызывает — зная
  // (или подобрав) orderId, можно было сгенерировать платёжную ссылку на
  // чужой заказ и получить в ответе его сумму. Теперь требуем Firebase ID
  // token и ниже сверяем, что вызывающий — владелец заказа.
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'auth required' });

  let callerUid;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired auth token' });
  }

  const { orderId, type, tariff, ticketId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  // type: 'order'      — полная оплата заказа (по умолчанию)
  //        'partial'   — первая оплата 50% (предоплата)
  //        'remaining' — доплата оставшихся 50%
  //        'support'   — подключение/продление обслуживания (см. tariff)
  //        'ticket_once' — разовая правка без подписки (см. ticketId)
  const paymentType = ['support', 'partial', 'remaining', 'ticket_once'].includes(type) ? type : 'order';

  let amount;
  let paymentMeta = {};
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'order not found' });
    const data = snap.data();

    if (data.uid !== callerUid) {
      return res.status(403).json({ error: 'not your order' });
    }

    if (paymentType === 'support') {
      // Ключ тарифа выбирает клиент, но цену и лимит берём только из
      // SUPPORT_TARIFFS на сервере. Неизвестный/отсутствующий ключ —
      // откатываемся на basic, а не на присланную цену.
      const tariffKey = Object.prototype.hasOwnProperty.call(SUPPORT_TARIFFS, tariff)
        ? tariff
        : DEFAULT_SUPPORT_TARIFF;
      amount = SUPPORT_TARIFFS[tariffKey].price;
      paymentMeta.tariff = tariffKey;

    } else if (paymentType === 'ticket_once') {
      if (!ticketId) return res.status(400).json({ error: 'ticketId required' });
      const ticketRef = db.collection('service_tickets').doc(ticketId);
      const ticketSnap = await ticketRef.get();
      if (!ticketSnap.exists) return res.status(404).json({ error: 'ticket not found' });
      const ticket = ticketSnap.data();
      // Тикет должен принадлежать вызывающему и относиться к тому же
      // заказу, что и orderId в запросе — иначе можно оплатить чужую
      // заявку по чужому orderId, подобрав ticketId.
      if (ticket.uid !== callerUid) return res.status(403).json({ error: 'not your ticket' });
      if (ticket.orderId !== orderId) return res.status(400).json({ error: 'ticket/order mismatch' });
      if (ticket.paid) return res.status(400).json({ error: 'ticket already paid' });
      amount = ONE_OFF_TICKET_PRICE;
      paymentMeta.ticketId = ticketId;

    } else if (paymentType === 'partial') {
      if (data.paid) return res.status(400).json({ error: 'order already paid' });
      // Раньше тут не проверялось, не была ли предоплата уже внесена. Если
      // бы этот эндпоинт вызвали дважды с type=partial (повторный клик,
      // старая вкладка, случайный повтор запроса) — создавалась бы вторая
      // предоплата ещё на 50% от суммы, и заказ оказывался переплачен без
      // способа это увидеть на этом шаге.
      if (data.paidAmount > 0) return res.status(400).json({ error: 'partial payment already made, use type=remaining' });
      const total = await calcOrderTotal(db, data);
      amount = Math.ceil(total / 2);

    } else if (paymentType === 'remaining') {
      const paidAmount = data.paidAmount || 0;
      const total = await calcOrderTotal(db, data);
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
      const total = await calcOrderTotal(db, data);
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
  const baseReturnUrl = process.env.YUKASSA_RETURN_URL || 'https://mqrz.ru/profile/orders';

  // Страница payment-success должна знать, какой именно платёж проверять
  // после редиректа — прикладываем orderId/type/ticketId к return_url.
  const returnParams = new URLSearchParams({ orderId, type: paymentType });
  if (ticketId) returnParams.set('ticketId', ticketId);
  const returnUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}${returnParams.toString()}`;

  // Idempotency-Key — уникален для каждой попытки платежа.
  // БАГ (найден и исправлен): раньше ключ собирался как
  // `${orderId}-${paymentType}-${ticketId || ''}-${Date.now()}`. Для обычных
  // платежей (без ticketId) он укладывался в лимит ЮКассы, но для
  // ticket_once добавлялся ещё и ticketId (~20 символов Firestore ID) —
  // итоговая строка превышала 64 символа, и ЮКасса отвечала 400
  // invalid_request: "Idempotence key is too long". UUID всегда короче
  // лимита и гарантированно уникален для каждой попытки.
  const idempotencyKey = randomUUID();

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
      ...paymentMeta,
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

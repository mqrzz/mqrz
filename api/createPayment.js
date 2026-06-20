import crypto from 'crypto';
import { db } from './firebaseAdmin.js';

// Единый источник цен — те же цифры, что в order.html (TIERS/extras) и
// в profile/tickets.html (SUPPORT_PRICE). Если меняете цены на сайте —
// меняйте и здесь, иначе сервер будет отклонять реальные платежи.
const TIER_PRICES = {
  'Старт': 3900,
  'Рост': 9900,
  'Масштаб': 19900,
};
const EXTRA_PRICES = { domain: 650, support: 500, content: 2000, shop: 4900 };
const SUPPORT_RENEWAL_PRICE = 500;

// Пересчитывает сумму заказа на сервере из package/extras/promoCode,
// которые лежат в самом документе Firestore — а не из amount, который
// прислал браузер. Так сумму в Робокассе нельзя подделать через DevTools:
// даже если price-поля в заказе подменены при создании, сервер всё равно
// считает по своей таблице цен на основе тарифа и реально выбранных опций.
async function calcOrderTotal(order) {
  const base = TIER_PRICES[order.package];
  if (base == null) throw new Error(`unknown package: ${order.package}`);

  let running = base;
  const extras = Array.isArray(order.extras) ? order.extras : [];
  for (const key of ['domain', 'support', 'content', 'shop']) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, type } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  // type различает, что именно оплачивается: 'order' — оплата заказа сайта
  // (по умолчанию, для обратной совместимости с уже работающим order.html),
  // 'support' — подключение/продление обслуживания сайта (500₽/мес)
  const paymentType = type === 'support' ? 'support' : 'order';

  let amount;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'order not found' });
    const data = snap.data();

    if (paymentType === 'support') {
      // Фиксированная цена продления — её не из чего "подделать" на клиенте,
      // но проверяем хотя бы что заказ реально существует.
      amount = SUPPORT_RENEWAL_PRICE;
    } else {
      if (data.paid) return res.status(400).json({ error: 'order already paid' });
      amount = await calcOrderTotal(data);
    }
  } catch (err) {
    console.error('Не удалось посчитать сумму заказа:', err.message);
    return res.status(400).json({ error: 'could not calculate price' });
  }

  const login = process.env.ROBO_LOGIN;
  const isTest = true; // поменяй на false когда активируют магазин
  const pass1 = isTest ? process.env.ROBO_PASS1_TEST : process.env.ROBO_PASS1;

  // Робокасса требует, чтобы InvId был ЦЕЛЫМ ЧИСЛОМ (до 2147483647).
  // orderId у нас — строковый ID документа Firestore, поэтому отдельно
  // генерируем числовой InvId на основе текущего времени.
  const invId = Math.floor(Date.now() / 1000) % 2147483647;

  // Сумма должна быть в формате с двумя знаками после точки (требование Робокассы)
  const outSum = Number(amount).toFixed(2);

  // Важно: регистр имени параметра Shp_* должен совпадать в самой подписи
  // и в передаваемых данных — Robokassa чувствительна к регистру. Также
  // параметры Shp_* должны идти в формуле строго по алфавиту:
  // Shp_orderId, затем Shp_type.
  // Формула подписи для Index.aspx с пользовательскими параметрами:
  // MerchantLogin:OutSum:InvId:Пароль#1:Shp_orderId=...:Shp_type=...
  const signature = crypto
    .createHash('md5')
    .update(`${login}:${outSum}:${invId}:${pass1}:Shp_orderId=${orderId}:Shp_type=${paymentType}`)
    .digest('hex')
    .toUpperCase();

  const params = new URLSearchParams({
    MerchantLogin: login,
    OutSum: outSum,
    InvId: String(invId),
    SignatureValue: signature,
    IsTest: isTest ? '1' : '0',
    // Кастомные параметры Робокассы: она сохранит их и вернёт обратно
    // без изменений на Result/Success/Fail URL. Так мы свяжем числовой
    // InvId со строковым orderId из Firestore и поймём тип платежа.
    // Регистр имён (Shp_orderId, Shp_type) должен точно совпадать с подписью.
    Shp_orderId: orderId,
    Shp_type: paymentType,
  });

  return res.status(200).json({
    paymentUrl: `https://auth.robokassa.ru/Merchant/Index.aspx?${params}`,
    amount,
  });
}

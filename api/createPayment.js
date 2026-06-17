import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, amount, type } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

  // type различает, что именно оплачивается: 'order' — оплата заказа сайта
  // (по умолчанию, для обратной совместимости с уже работающим order.html),
  // 'support' — подключение/продление обслуживания сайта (500₽/мес)
  const paymentType = type === 'support' ? 'support' : 'order';

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
  });
}

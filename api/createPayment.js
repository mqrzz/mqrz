import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, amount } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

  const login = process.env.ROBO_LOGIN;
  const isTest = true; // поменяй на false когда активируют магазин
  const pass1 = isTest ? process.env.ROBO_PASS1_TEST : process.env.ROBO_PASS1;

  // Робокасса требует, чтобы InvId был ЦЕЛЫМ ЧИСЛОМ (до 2147483647).
  // orderId у нас — строковый ID документа Firestore, поэтому отдельно
  // генерируем числовой InvId на основе текущего времени.
  const invId = Math.floor(Date.now() / 1000) % 2147483647;

  // Сумма должна быть в формате с двумя знаками после точки (требование Робокассы)
  const outSum = Number(amount).toFixed(2);

  // Важно: регистр имени параметра Shp_orderId должен совпадать
  // в самой подписи и в передаваемых данных — Robokassa чувствительна к регистру.
  // Формула подписи для Index.aspx с пользовательским параметром:
  // MerchantLogin:OutSum:InvId:Пароль#1:Shp_orderId=значение
  const signature = crypto
    .createHash('md5')
    .update(`${login}:${outSum}:${invId}:${pass1}:Shp_orderId=${orderId}`)
    .digest('hex')
    .toUpperCase();

  const params = new URLSearchParams({
    MerchantLogin: login,
    OutSum: outSum,
    InvId: String(invId),
    SignatureValue: signature,
    IsTest: isTest ? '1' : '0',
    // Кастомный параметр Робокассы: она сохранит его и вернёт обратно
    // без изменений на Result/Success/Fail URL. Так мы свяжем числовой
    // InvId со строковым orderId из Firestore. Регистр имени параметра
    // (Shp_orderId, не shp_orderId) должен точно совпадать с тем, что в подписи.
    Shp_orderId: orderId,
  });

  return res.status(200).json({
    paymentUrl: `https://auth.robokassa.ru/Merchant/Index.aspx?${params}`,
  });
}

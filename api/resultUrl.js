import crypto from 'crypto';
import { db } from './firebaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const { OutSum, InvId, SignatureValue, Shp_orderId } = req.body;

  // Робокасса присылает IsTest в теле запроса для тестовых платежей —
  // по нему понимаем, каким паролем проверять подпись.
  const isTest = req.body.IsTest === '1' || req.body.IsTest === 1;
  const pass2 = isTest ? process.env.ROBO_PASS2_TEST : process.env.ROBO_PASS2;

  // Формула подписи для Result URL: OutSum:InvId:Password2:Shp_orderId=значение
  // Пользовательские параметры Shp_* обязательно участвуют в подписи,
  // в алфавитном порядке (у нас он один, так что порядок не важен),
  // регистр имени параметра должен совпадать с тем, что прислала Robokassa.
  const signature = crypto
    .createHash('md5')
    .update(`${OutSum}:${InvId}:${pass2}:Shp_orderId=${Shp_orderId}`)
    .digest('hex')
    .toUpperCase();

  if (!SignatureValue || signature !== SignatureValue.toUpperCase()) {
    return res.status(400).send('bad sign');
  }

  // Обновляем статус заказа в Firestore по Shp_orderId (строковый ID
  // документа, который мы передали при создании платежа в createPayment.js).
  // Важно: используем поле "paid" (boolean), а не "status" — поле status
  // в этом проекте является числовым (0-5) и обозначает этап работы
  // над заказом в админке (Новая заявка → ... → Готово), и управляется
  // только вручную оттуда. Поле "paid" — отдельный флаг оплаты.
  if (Shp_orderId) {
    try {
      await db.collection('orders').doc(Shp_orderId).update({
        paid: true,
        paidAt: new Date().toISOString(),
        invId: InvId,
        outSum: OutSum,
      });
      console.log(`Заказ ${Shp_orderId} (InvId ${InvId}) оплачен на сумму ${OutSum}`);
    } catch (err) {
      // Если заказ не нашёлся или обновление не удалось — логируем,
      // но Робокассе всё равно отвечаем OK, чтобы она не повторяла запрос
      console.error(`Не удалось обновить заказ ${Shp_orderId}:`, err.message);
    }
  } else {
    console.warn(`Оплачен InvId ${InvId}, но Shp_orderId не пришёл`);
  }

  // Робокасса ожидает ответ строго в формате "OK{InvId}"
  return res.status(200).send(`OK${InvId}`);
}

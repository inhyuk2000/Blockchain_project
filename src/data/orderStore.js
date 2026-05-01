import db from "./db.js";

/**
 * 단일 트랜잭션: 판매 가능 이미지면 is_sold 갱신 후 PAID 주문 생성.
 * @returns {{ ok: true, orderId, imageId, price, orderStatus, purchasedAt } | { error: 'NOT_FOUND'|'SOLD'|'SELF' }}
 */
export function createPaidOrder({ buyerUserId, imageId, paymentMethod }) {
  const txn = db.transaction((buyerId, imgId, payMethod) => {
    const image = db
      .prepare(`SELECT id, user_id, price, is_sold FROM images WHERE id = ?`)
      .get(imgId);
    if (!image) {
      return { error: "NOT_FOUND" };
    }
    if (image.user_id === buyerId) {
      return { error: "SELF" };
    }
    if (image.is_sold) {
      return { error: "SOLD" };
    }
    const upd = db.prepare(`UPDATE images SET is_sold = 1 WHERE id = ? AND is_sold = 0`).run(imgId);
    if (upd.changes === 0) {
      return { error: "SOLD" };
    }
    const purchasedAt = new Date().toISOString();
    const ins = db
      .prepare(
        `
        INSERT INTO orders (buyer_user_id, image_id, price, payment_method, order_status, purchased_at)
        VALUES (?, ?, ?, ?, 'PAID', ?)
        `
      )
      .run(buyerId, imgId, image.price, payMethod, purchasedAt);

    return {
      ok: true,
      orderId: Number(ins.lastInsertRowid),
      imageId: imgId,
      price: image.price,
      orderStatus: "PAID",
      purchasedAt,
    };
  });

  return txn(buyerUserId, imageId, paymentMethod);
}

/**
 * 구매자 주문 목록 (최근 구매순). images 조인으로 제목·썸네일 포함.
 */
export function listOrdersByBuyerPaged(buyerUserId, page, pageSize) {
  const offset = page * pageSize;
  const rows = db
    .prepare(
      `
      SELECT
        o.id AS order_id,
        o.image_id,
        i.title,
        i.thumbnail_url,
        o.price,
        o.order_status,
        o.purchased_at
      FROM orders o
      INNER JOIN images i ON i.id = o.image_id
      WHERE o.buyer_user_id = ?
      ORDER BY datetime(o.purchased_at) DESC, o.id DESC
      LIMIT ? OFFSET ?
      `
    )
    .all(buyerUserId, pageSize, offset);

  return rows.map((row) => ({
    orderId: row.order_id,
    imageId: row.image_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    price: row.price,
    orderStatus: row.order_status,
    purchasedAt: row.purchased_at,
  }));
}

export function getOrderById(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) return null;
  const row = db
    .prepare(`SELECT id, buyer_user_id, image_id, order_status FROM orders WHERE id = ?`)
    .get(id);
  if (!row) return null;
  return {
    orderId: row.id,
    buyerUserId: row.buyer_user_id,
    imageId: row.image_id,
    orderStatus: row.order_status,
  };
}

/** 구매자가 해당 이미지에 대해 가진 첫 주문 id (상세 화면 다운로드 등) */
export function findFirstOrderIdForBuyerAndImage(buyerUserId, imageId) {
  const row = db
    .prepare(
      `
      SELECT id FROM orders
      WHERE buyer_user_id = ? AND image_id = ?
      ORDER BY id ASC
      LIMIT 1
      `
    )
    .get(buyerUserId, imageId);
  return row ? row.id : null;
}

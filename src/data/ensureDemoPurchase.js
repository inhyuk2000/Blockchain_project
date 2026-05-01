import db from "./db.js";
import { ensureUserByWalletAddress } from "./userStore.js";

const SEED_DEVICE = "SEED_DEMO";

/**
 * Hardhat / Anvil 기본 계정 #1 — 구매 내역 데모용.
 * 개인키는 로컬 개발에서 널리 쓰이는 Hardhat 기본값(계정 #1).
 */
export const DEMO_PURCHASE_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const HARDHAT_ACCOUNT_1_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

/**
 * 1) 데모 이미지에 걸린 DEMO_SEED 주문은 모두 Hardhat #1 구매자로 통일 (어느 지갑으로 시드됐든 표시되게).
 * 2) Hardhat #1에게 주문이 하나도 없으면, 주문이 없는 시드 이미지부터 하나 골라 DEMO_SEED 구매를 만든다.
 */
export function ensureDemoPurchase() {
  if (process.env.SEED_DUMMY_IMAGES === "false" || process.env.SEED_DEMO_PURCHASE === "false") {
    return;
  }

  const seedImages = db
    .prepare(`SELECT id FROM images WHERE device_id = ? ORDER BY id ASC`)
    .all(SEED_DEVICE);
  if (!seedImages.length) return;

  const buyer = ensureUserByWalletAddress(DEMO_PURCHASE_WALLET);

  const reassigned = db
    .prepare(
      `
      UPDATE orders SET buyer_user_id = ?
      WHERE payment_method = 'DEMO_SEED'
      AND image_id IN (SELECT id FROM images WHERE device_id = ?)
      `
    )
    .run(buyer.id, SEED_DEVICE).changes;

  let hardhatOrderCount = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE buyer_user_id = ?`).get(buyer.id).c;

  if (hardhatOrderCount === 0) {
    for (const { id: imageId } of seedImages) {
      const oc = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE image_id = ?`).get(imageId).c;
      if (oc > 0) continue;

      const purchasedAt = new Date().toISOString();
      db.prepare(`UPDATE images SET is_sold = 1 WHERE id = ?`).run(imageId);
      db.prepare(
        `
        INSERT INTO orders (buyer_user_id, image_id, price, payment_method, order_status, purchased_at)
        SELECT ?, id, price, 'DEMO_SEED', 'PAID', ?
        FROM images WHERE id = ?
        `
      ).run(buyer.id, purchasedAt, imageId);

      console.log(`[dummy] 데모 구매 신규 생성: image_id=${imageId}, buyer=Hardhat #1`);
      hardhatOrderCount += 1;
      break;
    }
  }

  if (reassigned > 0) {
    console.log(
      `[dummy] DEMO_SEED 주문 ${reassigned}건 구매자를 Hardhat #1 (${DEMO_PURCHASE_WALLET}) 로 통일했습니다.`
    );
  }

  hardhatOrderCount = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE buyer_user_id = ?`).get(buyer.id).c;

  console.log(`[dummy] ─── 구매 내역 데모 ───`);
  console.log(`[dummy] 반드시 아래 주소로 MetaMask 로그인해야 프로필에 구매 내역이 보입니다.`);
  console.log(`[dummy] 주소: ${DEMO_PURCHASE_WALLET}`);
  console.log(`[dummy] 개인키(import): ${HARDHAT_ACCOUNT_1_PRIVATE_KEY}`);
  console.log(`[dummy] Hardhat #1 구매 주문 수: ${hardhatOrderCount}`);
  if (hardhatOrderCount === 0) {
    console.log(
      `[dummy] 경고: 시드 이미지가 모두 다른 계정에게 팔린 상태입니다. data/app.db 초기화 또는 새 시드 이미지가 필요합니다.`
    );
  }
}

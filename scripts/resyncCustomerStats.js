/**
 * Re-sync customer_profiles cho TẤT CẢ customer đã có trong DB.
 * Áp dụng logic mới (loại đơn CANCELLED ra khỏi total_spent / total_paid_amount).
 *
 * Cách dùng:
 *   node scripts/resyncCustomerStats.js
 *
 * An toàn: script chỉ UPDATE bảng customer_profiles, không động vào orders.
 * Nếu muốn rollback, restore customer_profiles từ backup trước khi chạy.
 */

import { db, initDatabase } from '../src/database/db.js';
import { syncCustomerStats } from '../src/services/customerService.js';

initDatabase();

console.log('[RESYNC] Bắt đầu re-sync customer stats...');

const customers = db.prepare(`
    SELECT DISTINCT guild_id, customer_id
    FROM orders
    ORDER BY guild_id, customer_id
`).all();

console.log(`[RESYNC] Tìm thấy ${customers.length} unique customers cần sync.`);

let success = 0;
let failed = 0;

for (const c of customers) {
    try {
        syncCustomerStats(c.guild_id, c.customer_id);
        success++;
        if (success % 20 === 0) {
            console.log(`[RESYNC] Đã sync ${success}/${customers.length}...`);
        }
    } catch (e) {
        failed++;
        console.error(`[RESYNC] Lỗi sync ${c.guild_id}/${c.customer_id}:`, e.message);
    }
}

console.log(`\n[RESYNC] HOÀN THÀNH:`);
console.log(`  ✅ Thành công: ${success}`);
console.log(`  ❌ Thất bại:   ${failed}`);
console.log(`  📊 Tổng:       ${customers.length}`);

// Show top 5 sau khi sync để verify
console.log('\n[RESYNC] Top 5 customers sau khi sync:');
const top5 = db.prepare(`
    SELECT customer_id, total_orders, total_spent, total_paid_amount
    FROM customer_profiles
    ORDER BY total_spent DESC
    LIMIT 5
`).all();
top5.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.customer_id} - ${r.total_orders} đơn - đã chi ${r.total_spent.toLocaleString('vi-VN')}đ`);
});

process.exit(0);

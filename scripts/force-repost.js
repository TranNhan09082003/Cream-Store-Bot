// Script dùng REST API của Discord để bulk delete + post tin mới
// Chạy: ENV_FILE=.env node scripts/force-repost.js
import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const isBot1 = process.env.ENV_FILE !== '.env.store2';
const ANNOUNCE_ID = isBot1 ? '1514605939765874748' : '1070676180631568411';
const TERMS_ID    = isBot1 ? '1514605940982218763' : '1070676180631568410';
const STORE_NAME  = isBot1 ? 'Cenar Store 1' : 'Cenar Store 2';

const announcementText = `@everyone
<a:tsm_fire:1327553120842158111> **THÔNG BÁO QUAN TRỌNG VỀ CHÍNH SÁCH BẢO HÀNH & NGUỒN CUNG DỊCH VỤ** <a:tsm_fire:1327553120842158111>
<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>

Chào các bạn thành viên của **Cenar Store**, dưới đây là cập nhật mới nhất về quy định bảo hành, quy trình gia hạn dịch vụ Nitro, YouTube Premium cùng một số lưu ý quan trọng. Vui lòng đọc kỹ để đảm bảo quyền lợi tốt nhất khi mua sắm tại cửa hàng.

---

### <:verifybadge:1481127479702847646> 1. QUY ĐỊNH BẢO HÀNH & GIA HẠN DISCORD NITRO
* **Discord Nitro 2 tháng (Mua mới):**
  * <a:chamxanh:1481124932447371374> Shop chỉ chấp nhận bảo hành nếu Gmail của bạn **còn hoạt động bình thường**.
  * <a:chamxanh:1481124932447371374> Trường hợp bạn để Gmail bị khóa/chết, shop xin phép **miễn trừ trách nhiệm** (vì shop đã có hướng dẫn chi tiết cách bảo quản Gmail).
* **Discord Nitro 12 tháng (Gia hạn):**
  * <a:chamxanh:1481124932447371374> Bảo hành đầy đủ nếu tài khoản Gmail của bạn còn sống.
  * <a:chamxanh:1481124932447371374> Nếu Gmail bị mất/khóa, tùy vào mức độ cứu hộ Gmail mà thời gian bảo hành có thể bị khấu trừ từ **1 - 2 tháng**.
* **Quy trình Gia hạn Nitro:**
  * <a:chamxanh:1481124932447371374> **Gia hạn ngay lập tức:** Tỷ lệ hoàn thành **100% chỉ trong 5 - 10 phút**.
  * <a:chamxanh:1481124932447371374> **Quá hạn trên 1 tháng:** Gmail cũ sẽ không thể gia hạn tiếp. Bạn buộc phải chuyển sang **mua mới**.
* **Tình trạng Nitro 2 tháng mua mới:**
  * <a:chamxanh:1481124932447371374> Hiện tại nguồn cung Gmail đang cực kỳ khan hiếm. Đơn hàng sẽ cần **đợi cho đến khi có Gmail**. Mong các bạn thông cảm!

---

### <:verifybadge:1481127479702847646> 2. QUY ĐỊNH DỊCH VỤ YOUTUBE PREMIUM
* **YouTube Premium (Mua mới):**
  * <a:chamxanh:1481124932447371374> Bạn chỉ cần gửi địa chỉ Gmail, sau đó kiểm tra hòm thư và bấm đồng ý tham gia Family. Cam kết gia đình **riêng tư 100%**.
* **YouTube Premium (Bảo hành):**
  * <a:chamxanh:1481124932447371374> Vui lòng cung cấp: **Tên Gmail chủ Family** và **Địa chỉ Gmail của bạn**.

---

### <:verifybadge:1481127479702847646> 3. CHÍNH SÁCH BẢO HÀNH CHUNG & CAM KẾT CỦA CỬA HÀNG
* **Không out Server:** Khách hàng rời khỏi Server sau khi mua hàng sẽ bị **từ chối bảo hành hoàn toàn**.
* **Yêu cầu Feedback:** Bắt buộc gửi feedback sau khi mua. Không feedback sẽ **bị từ chối bảo hành**.
* **Cam kết tiến độ:** Cenar Store **không bao giờ giữ (hold) đơn hàng**. Spotify, YouTube, Netflix trả đơn cực nhanh!

<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>
<a:starxoay:1481141954346483845> **Chúc các bạn mua sắm vui vẻ cùng Cenar Store!** <a:starxoay:1481141954346483845>`;

const termsText = `<a:emoji:1327552040355762187> **ĐIỀU KHOẢN DỊCH VỤ & CHÍNH SÁCH BẢO HÀNH — CENAR STORE** <a:emoji:1327552040355762187>
<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>

### 🛡️ 1. CHÍNH SÁCH BẢO HÀNH CHUNG
* **Không out Server:** Rời Server sau khi mua → **từ chối bảo hành**.
* **Feedback bắt buộc:** Không feedback → **từ chối bảo hành**.
* **Bảo hành YouTube Premium:** Cần cung cấp Gmail chủ Family + Gmail cá nhân.

---

### 💎 2. CHÍNH SÁCH DISCORD NITRO
* **Nitro 2 tháng:** Chỉ bảo hành khi Gmail còn hoạt động. Gmail chết → miễn trừ trách nhiệm.
* **Nitro 12 tháng (Gia hạn):** Gmail còn → bảo hành đầy đủ. Gmail mất → khấu trừ 1-2 tháng.
* **Gia hạn ngay sau khi hết hạn:** Hoàn thành trong 5-10 phút. Quá 1 tháng → phải mua mới.

---

### 📺 3. YOUTUBE PREMIUM
* Chỉ cần cung cấp Gmail cá nhân, đồng ý gia nhập Family qua hòm thư.
* Cam kết gia đình **riêng tư 100%**.

---

### ⚙️ 4. CAM KẾT TRẢ ĐƠN
* **Không bao giờ hold đơn hàng.**
* Spotify, YouTube, Netflix trả đơn cực nhanh. Nitro 2 tháng đang chậm do khan hiếm Gmail.

<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>
-# *Điều khoản cập nhật theo thời gian. Cảm ơn sự tin tưởng của bạn!*`;

async function bulkDeleteAndSend(ch, text, label) {
  try {
    // Fetch tất cả tin nhắn và xóa bằng bulkDelete (xóa được tin của bất kỳ ai trong 14 ngày)
    const messages = await ch.messages.fetch({ limit: 100 });
    const ids = [...messages.keys()];
    if (ids.length > 0) {
      if (ids.length === 1) {
        await ch.messages.cache.get(ids[0])?.delete().catch(() => null);
      } else {
        await ch.bulkDelete(ids, true).catch(async (e) => {
          console.log(`bulkDelete failed (${e.message}), trying individual delete...`);
          for (const id of ids) {
            await ch.messages.cache.get(id)?.delete().catch(() => null);
          }
        });
      }
      console.log(`Cleared ${ids.length} messages in #${ch.name}`);
    }
    const sent = await ch.send({ content: text });
    console.log(`✅ Sent ${label} → Message ID: ${sent.id} in #${ch.name}`);
  } catch (err) {
    console.error(`❌ Error in ${label}:`, err.message);
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as: ${client.user.tag} (${client.user.id}) for ${STORE_NAME}`);
  
  const announceCh = await client.channels.fetch(ANNOUNCE_ID).catch(() => null);
  const termsCh    = await client.channels.fetch(TERMS_ID).catch(() => null);

  if (!announceCh) {
    console.error(`❌ Announce channel ${ANNOUNCE_ID} not found!`);
  } else {
    await bulkDeleteAndSend(announceCh, announcementText, 'ANNOUNCEMENT');
  }

  if (!termsCh) {
    console.error(`❌ Terms channel ${TERMS_ID} not found!`);
  } else {
    await bulkDeleteAndSend(termsCh, termsText, 'TERMS');
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);

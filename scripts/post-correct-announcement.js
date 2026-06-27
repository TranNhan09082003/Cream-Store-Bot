import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const isBot1 = process.env.ENV_FILE === '.env';

// Store 1 IDs
const STORE1_ANNOUNCE_ID = '1282637033814495249';
const STORE1_TERMS_ID = '1282637033814495248';

// Store 2 IDs
const STORE2_ANNOUNCE_ID = '1070676180631568411';
const STORE2_TERMS_ID = '1070676180631568410';

const announceChannelId = isBot1 ? STORE1_ANNOUNCE_ID : STORE2_ANNOUNCE_ID;
const termsChannelId = isBot1 ? STORE1_TERMS_ID : STORE2_TERMS_ID;
const storeName = isBot1 ? 'Cenar Store 1' : 'Cenar Store 2';

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
  * <a:chamxanh:1481124932447371374> **Gia hạn ngay lập tức:** Khách hàng thực hiện gia hạn ngay sau khi gói cũ vừa hết hạn. Tỷ lệ hoàn thành **100% chỉ trong 5 - 10 phút**.
  * <a:chamxanh:1481124932447371374> **Quá hạn trên 1 tháng:** Nếu gói Nitro đã hết hạn quá 1 tháng, Gmail cũ sẽ không thể gia hạn tiếp. Bạn buộc phải chuyển sang **mua mới**.
* **Tình trạng Nitro 2 tháng mua mới:**
  * <a:chamxanh:1481124932447371374> Hiện tại nguồn cung Gmail trên thị trường đang cực kỳ khan hiếm. Vì vậy, đơn hàng Nitro 2 tháng mua mới sẽ cần **đợi một khoảng thời gian đến khi có Gmail**. Mong các bạn thông cảm và lưu ý trước khi lên đơn.

---

### <:verifybadge:1481127479702847646> 2. QUY ĐỊNH DỊCH VỤ YOUTUBE PREMIUM
* **YouTube Premium (Mua mới):**
  * <a:chamxanh:1481124932447371374> Bạn chỉ cần gửi địa chỉ Gmail của mình cho shop, sau đó kiểm tra hòm thư và bấm đồng ý tham gia Family. Cam kết gia đình **riêng tư 100%**, không chia sẻ bất kỳ dữ liệu cá nhân nào của bạn.
* **YouTube Premium (Bảo hành):**
  * <a:chamxanh:1481124932447371374> Để được hỗ trợ nhanh nhất khi cần bảo hành, vui lòng cung cấp đầy đủ: **Tên Gmail chủ Family đang tham gia** và **Địa chỉ Gmail của bạn**.

---

### <:verifybadge:1481127479702847646> 3. CHÍNH SÁCH BẢO HÀNH CHUNG & CAM KẾT CỦA CỬA HÀNG
* **Điều kiện bắt buộc nhận bảo hành:**
  * <a:chamxanh:1481124932447371374> **Không out Server:** Khách hàng rời khỏi Server của chúng tôi sau khi mua hàng sẽ bị **từ chối bảo hành hoàn toàn**.
  * <a:chamxanh:1481124932447371374> **Yêu cầu phản hồi (Feedback):** Khách hàng mua hàng bắt buộc phải gửi feedback đánh giá. Những trường hợp không feedback (hoặc chỉ feedback khi cần bảo hành) sẽ **bị từ chối hỗ trợ bảo hành**.
* **Về tiến độ trả đơn hàng:**
  * <a:chamxanh:1481124932447371374> Cenar Store cam kết **không bao giờ giữ (hold) đơn hàng của khách**. Mọi sự chậm trễ hoàn toàn do tình trạng khan hiếm nguyên liệu chung của thị trường.
  * <a:chamxanh:1481124932447371374> Hiện tại ngoài dòng Nitro 2 tháng đang biến động, các dịch vụ khác như **Spotify, YouTube, Netflix** đang chạy rất mượt mà và trả đơn cực nhanh. Các bạn có thể yên tâm lên đơn nhé!

<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>
<a:starxoay:1481141954346483845> **Chúc các bạn mua sắm vui vẻ cùng Cenar Store!** <a:starxoay:1481141954346483845>`;

const termsText = `<a:emoji:1327552040355762187> **ĐIỀU KHOẢN DỊCH VỤ & CHÍNH SÁCH BẢO HÀNH — CENAR STORE** <a:emoji:1327552040355762187>
<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>

Chào mừng các bạn đến với **Cenar Store**. Dưới đây là các điều khoản sử dụng và chính sách bảo hành chính thức. Khi thực hiện giao dịch mua hàng, bạn mặc định đồng ý với các quy định sau:

---

### 🛡️ 1. CHÍNH SÁCH BẢO HÀNH CHUNG
* **Không out Server:** Khách hàng tự ý out (rời) khỏi Server Discord của shop sau khi mua hàng sẽ bị **từ chối hỗ trợ bảo hành** cho mọi đơn hàng trước đó.
* **Feedback đánh giá:** Việc gửi feedback sau khi hoàn tất đơn hàng là bắt buộc để kích hoạt quyền lợi bảo hành. Khách hàng không feedback (hoặc chỉ gửi feedback khi cần bảo hành) sẽ **bị từ chối bảo hành**.
* **Bảo hành YouTube Premium:** Khi cần hỗ trợ bảo hành, vui lòng cung cấp đầy đủ: **Tên Gmail chủ Family** và **Gmail cá nhân của bạn** để shop xử lý nhanh nhất.

---

### 💎 2. CHÍNH SÁCH ĐỐI VỚI DISCORD NITRO
* **Discord Nitro 2 tháng (Mua mới):**
  * <a:chamxanh:1481124932447371374> Chỉ bảo hành khi tài khoản Gmail liên kết còn hoạt động bình thường.
  * <a:chamxanh:1481124932447371374> Nếu bạn để Gmail bị khóa/chết, shop xin phép **miễn trừ trách nhiệm bảo hành**.
* **Discord Nitro 12 tháng (Gia hạn):**
  * <a:chamxanh:1481124932447371374> Bảo hành đầy đủ khi Gmail hoạt động tốt.
  * <a:chamxanh:1481124932447371374> Trường hợp mất/khóa Gmail, tùy thuộc vào khả năng cứu hộ Gmail mà thời gian bảo hành có thể bị **khấu trừ 1 - 2 tháng**.
* **Quy trình về việc Gia hạn:**
  * <a:chamxanh:1481124932447371374> Gia hạn nên được thực hiện ngay sau khi gói cũ vừa hết hạn (hoàn thành 100% trong 5 - 10 phút).
  * <a:chamxanh:1481124932447371374> Nếu quá hạn trên 1 tháng, tài khoản không thể gia hạn tiếp mà bắt buộc phải chuyển sang gói mua mới.

---

### 📺 3. CHÍNH SÁCH YOUTUBE PREMIUM
* **YouTube Premium mua mới:** Bạn chỉ cần cung cấp địa chỉ Gmail cá nhân, sau đó check hòm thư để đồng ý gia nhập Family.
* **Bảo mật thông tin:** Cam kết nhóm gia đình **riêng tư 100%**, tuyệt đối không chia sẻ bất kỳ dữ liệu cá nhân nào giữa các thành viên.

---

### ⚙️ 4. CAM KẾT TRẢ ĐƠN & TIẾN ĐỘ
* <a:chamxanh:1481124932447371374> Cenar Store cam kết **không bao giờ hold (giữ) đơn hàng** của khách.
* <a:chamxanh:1481124932447371374> Mọi sự chậm trễ giao hàng (đặc biệt đối với gói Nitro 2 tháng) hoàn toàn do tình trạng khan hiếm nguyên liệu chung của thị trường. Các gói dịch vụ khác như Spotify, YouTube, Netflix... trả đơn cực kỳ nhanh chóng.

<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>
-# *Điều khoản có thể được cập nhật theo thời gian để phù hợp với chính sách của các nhà cung cấp gốc. Cảm ơn sự tin tưởng của bạn!*`;

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag} for ${storeName}`);
  
  // 1. Post to announcement channel
  try {
    const announceCh = await client.channels.fetch(announceChannelId).catch(() => null);
    if (announceCh) {
      await announceCh.send({ content: announcementText });
      console.log(`Successfully sent announcement to channel ${announceChannelId} in ${storeName}`);
    } else {
      console.error(`Announce channel ${announceChannelId} not found in ${storeName}`);
    }
  } catch (err) {
    console.error(`Error sending to announce channel in ${storeName}:`, err);
  }

  // 2. Post to terms channel
  try {
    const termsCh = await client.channels.fetch(termsChannelId).catch(() => null);
    if (termsCh) {
      await termsCh.send({ content: termsText });
      console.log(`Successfully sent terms to channel ${termsChannelId} in ${storeName}`);
    } else {
      console.error(`Terms channel ${termsChannelId} not found in ${storeName}`);
    }
  } catch (err) {
    console.error(`Error sending to terms channel in ${storeName}:`, err);
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);

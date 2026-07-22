import { config } from '../src/config.js';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const isBot1 = process.env.ENV_FILE !== '.env.store2';

// Store 1 IDs
const STORE1_ANNOUNCE_CHAN_ID = '1514605939765874748';
const STORE1_TERMS_CHAN_ID = '1514597981666672691';

// Store 2 IDs
const STORE2_ANNOUNCE_CHAN_ID = '1514594182717640735';
const STORE2_TERMS_CHAN_ID = '1514594186828189858';

const announceChanId = isBot1 ? STORE1_ANNOUNCE_CHAN_ID : STORE2_ANNOUNCE_CHAN_ID;
const termsChanId = isBot1 ? STORE1_TERMS_CHAN_ID : STORE2_TERMS_CHAN_ID;
const storeName = isBot1 ? 'Cenar Store 1' : 'Cenar Store 2';

const announcementText = isBot1 ? `@everyone
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
<a:starxoay:1481141954346483845> **Chúc các bạn mua sắm vui vẻ cùng Cenar Store!** <a:starxoay:1481141954346483845>` 
: `Chào các bạn thành viên của **Cenar Store 2**, dưới đây là cập nhật mới nhất về quy định bảo hành, quy trình gia hạn dịch vụ Nitro, YouTube Premium cùng một số lưu ý quan trọng. Vui lòng đọc kỹ để đảm bảo quyền lợi tốt nhất khi mua sắm tại cửa hàng.

---

### 1. QUY ĐỊNH BẢO HÀNH & GIA HẠN DISCORD NITRO
* **Discord Nitro 2 tháng (Mua mới):**
  * Shop chỉ chấp nhận bảo hành nếu Gmail của bạn **còn hoạt động bình thường**.
  * Trường hợp bạn để Gmail bị khóa/chết, shop xin phép **miễn trừ trách nhiệm** (vì shop đã có hướng dẫn chi tiết cách bảo quản Gmail).
* **Discord Nitro 12 tháng (Gia hạn):**
  * Bảo hành đầy đủ nếu tài khoản Gmail của bạn còn sống.
  * Nếu Gmail bị mất/khóa, tùy vào mức độ cứu hộ Gmail mà thời gian bảo hành có thể bị khấu trừ từ **1 - 2 tháng**.
* **Quy trình Gia hạn Nitro:**
  * **Gia hạn ngay lập tức:** Khách hàng thực hiện gia hạn ngay sau khi gói cũ vừa hết hạn. Tỷ lệ hoàn thành **100% chỉ trong 5 - 10 phút**.
  * **Quá hạn trên 1 tháng:** Nếu gói Nitro đã hết hạn quá 1 tháng, Gmail cũ sẽ không thể gia hạn tiếp. Bạn buộc phải chuyển sang **mua mới**.
* **Tình trạng Nitro 2 tháng mua mới:**
  * Hiện tại nguồn cung Gmail trên thị trường đang cực kỳ khan hiếm. Vì vậy, đơn hàng Nitro 2 tháng mua mới sẽ cần **đợi một khoảng thời gian đến khi có Gmail**. Mong các bạn thông cảm và lưu ý trước khi lên đơn.

---

### 2. QUY ĐỊNH DỊCH VỤ YOUTUBE PREMIUM
* **YouTube Premium (Mua mới):**
  * Bạn chỉ cần gửi địa chỉ Gmail của mình cho shop, sau đó kiểm tra hòm thư và bấm đồng ý tham gia Family. Cam kết gia đình **riêng tư 100%**, không chia sẻ bất kỳ dữ liệu cá nhân nào của bạn.
* **YouTube Premium (Bảo hành):**
  * Để được hỗ trợ nhanh nhất khi cần bảo hành, vui lòng cung cấp đầy đủ: **Tên Gmail chủ Family đang tham gia** và **Địa chỉ Gmail của bạn**.

---

### 3. CHÍNH SÁCH BẢO HÀNH CHUNG & CAM KẾT CỦA CỬA HÀNG
* **Điều kiện bắt buộc nhận bảo hành:**
  * **Không out Server:** Khách hàng rời khỏi Server của chúng tôi sau khi mua hàng sẽ bị **từ chối bảo hành hoàn toàn**.
  * **Yêu cầu phản hồi (Feedback):** Khách hàng mua hàng bắt buộc phải gửi feedback đánh giá. Những trường hợp không feedback (hoặc chỉ feedback khi cần bảo hành) sẽ **bị từ chối hỗ trợ bảo hành**.
* **Về tiến độ trả đơn hàng:**
  * Cenar Store cam kết **không bao giờ giữ (hold) đơn hàng của khách**. Mọi sự chậm trễ hoàn toàn do tình trạng khan hiếm nguyên liệu chung của thị trường.
  * Hiện tại ngoài dòng Nitro 2 tháng đang biến động, các dịch vụ khác như **Spotify, YouTube, Netflix** đang chạy rất mượt mà và trả đơn cực nhanh. Các bạn có thể yên tâm lên đơn nhé!

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Chúc các bạn mua sắm vui vẻ cùng Cenar Store 2!`;

const termsText = isBot1 ? `<a:emoji:1327552040355762187> **ĐIỀU KHOẢN DỊCH VỤ & CHÍNH SÁCH BẢO HÀNH — CENAR STORE** <a:emoji:1327552040355762187>
<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>

Chào mừng các bạn đến với **Cenar Store**. Dưới đây là các điều khoản sử dụng và chính sách bảo hành chính thức. Khi thực hiện giao dịch mua hàng, bạn mặc định đồng ý với các quy định sau:

---

### <:verifybadge:1481127479702847646> 1. CHÍNH SÁCH BẢO HÀNH CHUNG
* **Không out Server:** Khách hàng tự ý out (rời) khỏi Server Discord của shop sau khi mua hàng sẽ bị **từ chối hỗ trợ bảo hành** cho mọi đơn hàng trước đó.
* **Feedback đánh giá:** Việc gửi feedback sau khi hoàn tất đơn hàng là bắt buộc để kích hoạt quyền lợi bảo hành. Khách hàng không feedback (hoặc chỉ gửi feedback khi cần bảo hành) sẽ **bị từ chối bảo hành**.
* **Bảo hành YouTube Premium:** Khi cần hỗ trợ bảo hành, vui lòng cung cấp đầy đủ: **Tên Gmail chủ Family** và **Gmail cá nhân của bạn** để shop xử lý nhanh nhất.

---

### <:verifybadge:1481127479702847646> 2. CHÍNH SÁCH ĐỐI VỚI DISCORD NITRO
* **Discord Nitro 2 tháng (Mua mới):**
  * <a:chamxanh:1481124932447371374> Chỉ bảo hành khi tài khoản Gmail liên kết còn hoạt động bình thường.
  * <a:chamxanh:1481124932447371374> Nếu bạn để Gmail bị khóa/chết, shop xin phép **miễn trừ trách nhiệm bảo hành**.
* **Discord Nitro 12 tháng (Gia hạn):**
  * <a:chamxanh:1481124932447371374> Bảo hành đầy đủ khi Gmail hoạt động tốt.
  * <a:chamxanh:1481124932447371374> Trường hợp mất/khóa Gmail, tùy thuộc vào khả năng cứu hộ Gmail mà thời gian bảo hành có thể bị **khấu trừ 1 - 2 tháng**.
* **Quy định về việc Gia hạn:**
  * <a:chamxanh:1481124932447371374> Gia hạn nên được thực hiện ngay sau khi gói cũ vừa hết hạn (hoàn thành 100% trong 5 - 10 phút).
  * <a:chamxanh:1481124932447371374> Nếu quá hạn trên 1 tháng, tài khoản không thể gia hạn tiếp mà bắt buộc phải chuyển sang gói mua mới.

---

### <:verifybadge:1481127479702847646> 3. CHÍNH SÁCH YOUTUBE PREMIUM
* **YouTube Premium mua mới:** Bạn chỉ cần cung cấp địa chỉ Gmail cá nhân, sau đó check hòm thư để đồng ý gia nhập Family.
* **Bảo mật thông tin:** Cam kết nhóm gia đình **riêng tư 100%**, tuyệt đối không chia sẻ bất kỳ dữ liệu cá nhân nào giữa các thành viên.

---

### <:Netflix:1481133651319328789> 4. CHÍNH SÁCH & QUY ĐỊNH NETFLIX
Để tài khoản dùng chung luôn ổn định và không bị lỗi truy cập, khách hàng vui lòng tuân thủ:
* <a:tick_red51:1384069065626222632> **KHÔNG ĐƯỢC:** Đổi mật khẩu tài khoản Netflix.
* <a:tick_red51:1384069065626222632> **KHÔNG ĐƯỢC:** Xóa, vào hoặc đổi tên profile của người khác.
* <a:tickgreen:1384069022831874169> **ĐƯỢC PHÉP:** Xem trên nhiều thiết bị, nhưng **chỉ được xem cùng lúc trên 1 thiết bị**.
* <a:tickgreen:1384069022831874169> **ĐƯỢC PHÉP:** Đổi tên profile và đặt mã PIN. Nếu đổi tên profile, vui lòng **gửi lại tên mới** cho shop để tiện quản lý.

---

### <:verifybadge:1481127479702847646> 5. CAM KẾT TRẢ ĐƠN & TIẾN ĐỘ
* <a:chamxanh:1481124932447371374> Cenar Store cam kết **không bao giờ hold (giữ) đơn hàng** của khách.
* <a:chamxanh:1481124932447371374> Mọi sự chậm trễ giao hàng (đặc biệt đối với gói Nitro 2 tháng) hoàn toàn do tình trạng khan hiếm nguyên liệu chung của thị trường. Các gói dịch vụ khác như Spotify, YouTube, Netflix... trả đơn cực kỳ nhanh chóng.

<a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059><a:ccjdeobt:1481142015994495059>
-# *Điều khoản có thể được cập nhật theo thời gian để phù hợp với chính sách của các nhà cung cấp gốc. Cảm ơn sự tin tưởng của bạn!*`
: `Chào mừng các bạn đến với **Cenar Store 2**. Dưới đây là các điều khoản sử dụng và chính sách bảo hành chính thức. Khi thực hiện giao dịch mua hàng, bạn mặc định đồng ý với các quy định sau:

---

### 1. CHÍNH SÁCH BẢO HÀNH CHUNG
* **Không out Server:** Khách hàng tự ý out (rời) khỏi Server Discord của shop sau khi mua hàng sẽ bị **từ chối hỗ trợ bảo hành** cho mọi đơn hàng trước đó.
* **Feedback đánh giá:** Việc gửi feedback sau khi hoàn tất đơn hàng là bắt buộc để kích hoạt quyền lợi bảo hành. Khách hàng không feedback (hoặc chỉ gửi feedback khi cần bảo hành) sẽ **bị từ chối bảo hành**.
* **Bảo hành YouTube Premium:** Khi cần hỗ trợ bảo hành, vui lòng cung cấp đầy đủ: **Tên Gmail chủ Family** và **Gmail cá nhân của bạn** để shop xử lý nhanh nhất.

---

### 2. CHÍNH SÁCH ĐỐI VỚI DISCORD NITRO
* **Discord Nitro 2 tháng (Mua mới):**
  * Chỉ bảo hành khi tài khoản Gmail liên kết còn hoạt động bình thường.
  * Nếu bạn để Gmail bị khóa/chết, shop xin phép **miễn trừ trách nhiệm bảo hành**.
* **Discord Nitro 12 tháng (Gia hạn):**
  * Bảo hành đầy đủ khi Gmail hoạt động tốt.
  * Trường hợp mất/khóa Gmail, tùy thuộc vào khả năng cứu hộ Gmail mà thời gian bảo hành có thể bị **khấu trừ 1 - 2 tháng**.
* **Quy định về việc Gia hạn:**
  * Gia hạn nên được thực hiện ngay sau khi gói cũ vừa hết hạn (hoàn thành 100% trong 5 - 10 phút).
  * Nếu quá hạn trên 1 tháng, tài khoản không thể gia hạn tiếp mà bắt buộc phải chuyển sang gói mua mới.

---

### 3. CHÍNH SÁCH YOUTUBE PREMIUM
* **YouTube Premium mua mới:** Bạn chỉ cần cung cấp địa chỉ Gmail cá nhân, sau đó check hòm thư để đồng ý gia nhập Family.
* **Bảo mật thông tin:** Cam kết nhóm gia đình **riêng tư 100%**, tuyệt đối không chia sẻ bất kỳ dữ liệu cá nhân nào giữa các thành viên.

---

### 4. CHÍNH SÁCH & QUY ĐỊNH NETFLIX
Để tài khoản dùng chung luôn ổn định và không bị lỗi truy cập, khách hàng vui lòng tuân thủ:
* **KHÔNG ĐƯỢC:** Đổi mật khẩu tài khoản Netflix.
* **KHÔNG ĐƯỢC:** Xóa, vào hoặc đổi tên profile của người khác.
* **ĐƯỢC PHÉP:** Xem trên nhiều thiết bị, nhưng **chỉ được xem cùng lúc trên 1 thiết bị**.
* **ĐƯỢC PHÉP:** Đổi tên profile và đặt mã PIN. Nếu đổi tên profile, vui lòng **gửi lại tên mới** cho shop để tiện quản lý.

---

### 5. CAM KẾT TRẢ ĐƠN & TIẾN ĐỘ
* Cenar Store cam kết **không bao giờ hold (giữ) đơn hàng** của khách.
* Mọi sự chậm trễ giao hàng (đặc biệt đối với gói Nitro 2 tháng) hoàn toàn do tình trạng khan hiếm nguyên liệu chung của thị trường. Các gói dịch vụ khác như Spotify, YouTube, Netflix... trả đơn cực kỳ nhanh chóng.

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*Điều khoản có thể được cập nhật theo thời gian để phù hợp với chính sách của các nhà cung cấp gốc. Cảm ơn sự tin tưởng của bạn!*`;

async function sendLongMessage(channel, text) {
  if (text.length <= 2000) {
    return await channel.send({ content: text });
  }
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', 2000);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', 2000);
    if (splitAt <= 0) splitAt = 2000;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  let lastSent = null;
  for (const chunk of chunks) {
    lastSent = await channel.send({ content: chunk });
    await new Promise(r => setTimeout(r, 200));
  }
  return lastSent;
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag} for ${storeName}`);
  
  // 1. Process announcement channel
  try {
    const announceCh = await client.channels.fetch(announceChanId).catch(() => null);
    if (announceCh) {
      console.log(`Clearing old messages in announce channel: ${announceChanId}...`);
      const fetched = await announceCh.messages.fetch({ limit: 100 }).catch(() => []);
      for (const [id, msg] of fetched) {
        await msg.delete().catch(e => console.error(`Failed to delete message ${id}:`, e.message));
      }
      
      let sent;
      if (isBot1) {
        sent = await sendLongMessage(announceCh, announcementText);
      } else {
        const embed = new EmbedBuilder()
          .setTitle('THÔNG BÁO QUAN TRỌNG VỀ CHÍNH SÁCH BẢO HÀNH & NGUỒN CUNG DỊCH VỤ')
          .setDescription(announcementText)
          .setColor('#5865F2')
          .setTimestamp();
        sent = await announceCh.send({ embeds: [embed] });
      }
      console.log(`Successfully reposted fresh announcement: ${sent?.id} in ${storeName}`);
    } else {
      console.error(`Announce channel ${announceChanId} not found in ${storeName}`);
    }
  } catch (err) {
    console.error(`Error in announce channel for ${storeName}:`, err);
  }

  // 2. Process terms channel
  try {
    const termsCh = await client.channels.fetch(termsChanId).catch(() => null);
    if (termsCh) {
      console.log(`Clearing old messages in terms channel: ${termsChanId}...`);
      const fetched = await termsCh.messages.fetch({ limit: 100 }).catch(() => []);
      for (const [id, msg] of fetched) {
        await msg.delete().catch(e => console.error(`Failed to delete message ${id}:`, e.message));
      }
      
      let sent;
      if (isBot1) {
        sent = await sendLongMessage(termsCh, termsText);
      } else {
        const embed = new EmbedBuilder()
          .setTitle('ĐIỀU KHOẢN DỊCH VỤ & CHÍNH SÁCH BẢO HÀNH')
          .setDescription(termsText)
          .setColor('#2ecc71')
          .setTimestamp();
        sent = await termsCh.send({ embeds: [embed] });
      }
      console.log(`Successfully reposted fresh terms: ${sent?.id} in ${storeName}`);
    } else {
      console.error(`Terms channel ${termsChanId} not found in ${storeName}`);
    }
  } catch (err) {
    console.error(`Error in terms channel for ${storeName}:`, err);
  }
  
  client.destroy();
  process.exit(0);
});

client.login(config.botToken);

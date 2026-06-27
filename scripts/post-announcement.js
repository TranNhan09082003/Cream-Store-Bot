import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const content = `<a:tsm_fire:1327553120842158111> **THÔNG BÁO QUAN TRỌNG VỀ CHÍNH SÁCH BẢO HÀNH & NGUỒN CUNG DỊCH VỤ** <a:tsm_fire:1327553120842158111>
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
<a:starxoay:1481141954346483845> **Chúc các bạn mua sắm vui vẻ cùng Cenar Store!** <a:starxoay:1481141954346483845>

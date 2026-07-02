/* Cenar Store - Premium Storefront Core Javascript Application */

const API_BASE_URL = window.location.origin;
let activeProducts = [];
let selectedProduct = null;
let currentOrderCode = null;
let statusPollInterval = null;

// Page Initialization
document.addEventListener("DOMContentLoaded", () => {
    initFaqAccordion();
    loadStoreData();
});

// FAQ Accordion
function initFaqAccordion() {
    document.querySelectorAll(".faq-question").forEach(q => {
        q.addEventListener("click", () => {
            const item = q.parentElement;
            const isActive = item.classList.contains("active");
            
            // Close all items
            document.querySelectorAll(".faq-item").forEach(el => el.classList.remove("active"));
            
            // Toggle clicked item
            if (!isActive) {
                item.classList.add("active");
            }
        });
    });
}

// Load dynamic data from bot APIs
async function loadStoreData() {
    try {
        await Promise.all([
            fetchStats(),
            fetchProducts(),
            fetchFeedbacks()
        ]);
    } catch (e) {
        console.error("Failed to load store data:", e);
        showToast("Lỗi đồng bộ dữ liệu cửa hàng.", "error");
    } finally {
        // Hide global loader once finished
        const loader = document.getElementById("global-loader");
        if (loader) {
            loader.style.opacity = "0";
            setTimeout(() => loader.style.display = "none", 500);
        }
    }
}

// Fetch stats
async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/public/stats`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.ok) {
            document.getElementById("stat-orders").innerText = (data.data.completed_orders + 350).toLocaleString() + "+";
            document.getElementById("stat-customers").innerText = (data.data.total_customers + 120).toLocaleString() + "+";
            document.getElementById("stat-rating").innerText = data.data.avg_rating.toFixed(2) + "/5 ⭐";
        }
    } catch (e) {
        console.error("Error fetching stats:", e);
    }
}

// Fetch products
async function fetchProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/public/products`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.ok) {
            activeProducts = data.data || [];
            renderProducts();
        }
    } catch (e) {
        console.error("Error fetching products:", e);
        document.getElementById("products-grid").innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 48px;">
                <i class="ph ph-warning-circle" style="font-size: 48px; margin-bottom: 12px; color: var(--danger);"></i>
                <p>Không thể tải danh sách sản phẩm. Vui lòng thử lại sau.</p>
            </div>
        `;
    }
}

// Fetch feedbacks
async function fetchFeedbacks() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/public/feedbacks`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.ok && data.data && data.data.length > 0) {
            renderFeedbacks(data.data);
        } else {
            renderFallbackFeedbacks();
        }
    } catch (e) {
        console.error("Error fetching feedbacks:", e);
        renderFallbackFeedbacks();
    }
}

// Render products grid
function renderProducts() {
    const grid = document.getElementById("products-grid");
    if (activeProducts.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 48px;">
                <i class="ph ph-shopping-bag" style="font-size: 48px; margin-bottom: 12px;"></i>
                <p>Hiện tại chưa có sản phẩm nào mở bán.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = activeProducts.map(p => {
        const hasDiscount = p.original_price > p.price;
        const discountPercent = hasDiscount ? Math.round(((p.original_price - p.price) / p.original_price) * 100) : 0;
        
        return `
            <div class="product-card">
                <div class="p-header">
                    <span class="p-emoji">${p.emoji || '📦'}</span>
                    ${hasDiscount ? `<span class="hero-badge" style="background: var(--danger-bg); border-color: rgba(239, 68, 68, 0.2); color: var(--danger); margin: 0;">Sale -${discountPercent}%</span>` : ''}
                </div>
                <h3 class="p-title">${p.name}</h3>
                <p class="p-desc">${p.description || 'Sản phẩm chất lượng cao, cung cấp và bàn giao tự động qua Discord.'}</p>
                <div class="p-footer">
                    <div class="p-price-block">
                        ${hasDiscount ? `<span class="p-original-price">${p.original_price.toLocaleString()}đ</span>` : ''}
                        <span class="p-price">${p.price.toLocaleString()}đ</span>
                        <span class="p-duration">${p.duration_months ? `Hạn dùng ${p.duration_months} tháng` : 'Gia hạn hàng tháng'}</span>
                    </div>
                    <button class="btn btn-primary" onclick="openCheckoutModal(${p.id})">
                        <span>Mua ngay</span>
                        <i class="ph ph-shopping-cart-simple"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

// Render dynamic feedbacks
function renderFeedbacks(feedbacks) {
    const grid = document.getElementById("feedbacks-grid");
    grid.innerHTML = feedbacks.map(f => {
        const username = f.username || "Khách hàng ẩn danh";
        const initial = username.charAt(0).toUpperCase();
        
        return `
            <div class="feedback-card">
                <div class="fb-rating">
                    ${'★'.repeat(f.stars)}${'☆'.repeat(5 - f.stars)}
                </div>
                <p class="fb-quote">"${f.content || 'Dịch vụ rất tốt, hỗ trợ nhanh chóng và phục vụ chuyên nghiệp.'}"</p>
                <div class="fb-user">
                    <div class="fb-avatar">${initial}</div>
                    <div class="fb-meta">
                        <span class="fb-username">${username}</span>
                        <span class="fb-date">Mua đơn: ${f.order_code}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// Fallback feedbacks
function renderFallbackFeedbacks() {
    const fallback = [
        { stars: 5, content: "Hàng giao siêu nhanh, chưa đầy 2 phút đã có tài khoản dùng thử. Nhân viên tư vấn rất chu đáo, nhiệt tình.", username: "Marcus", order_code: "CN_812331" },
        { stars: 5, content: "Mua Youtube Premium dùng mượt mà, không gặp lỗi gia hạn lặt vặt như các bên khác. Ủng hộ shop lâu dài!", username: "._ccab", order_code: "CN_550667" },
        { stars: 5, content: "Giao diện thanh toán QR của shop tiện lợi, quét cái là tự động nhận và gửi tài khoản qua DM Discord.", username: "nhan04722", order_code: "CN_314812" }
    ];
    renderFeedbacks(fallback);
}

// Checkout Modal Logic
function openCheckoutModal(productId) {
    selectedProduct = activeProducts.find(p => p.id === productId);
    if (!selectedProduct) return;

    // Reset views
    resetModalView();

    // Populate order details
    document.getElementById("summary-product-name").innerText = selectedProduct.name;
    document.getElementById("summary-duration").innerText = selectedProduct.duration_months ? `${selectedProduct.duration_months} tháng` : 'Gia hạn hàng tháng';
    document.getElementById("summary-total-amount").innerText = selectedProduct.price.toLocaleString() + "đ";

    // Show modal
    const modal = document.getElementById("checkout-modal");
    modal.classList.add("show");
}

function closeCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    modal.classList.remove("show");
    
    // Clear polling
    if (statusPollInterval) {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
    }
}

function resetModalView() {
    document.getElementById("modal-form-view").style.display = "block";
    document.getElementById("modal-payment-view").style.display = "none";
    document.getElementById("modal-success-view").style.display = "none";
    document.getElementById("modal-error-view").style.display = "none";
    
    document.getElementById("input-discord").value = "";
    document.getElementById("input-email").value = "";
    document.getElementById("input-note").value = "";
    
    // Clear polling
    if (statusPollInterval) {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
    }
}

// Submit Order Form
async function submitOrder() {
    const discordId = document.getElementById("input-discord").value.trim();
    const email = document.getElementById("input-email").value.trim();
    const note = document.getElementById("input-note").value.trim();

    if (!email) {
        showToast("Vui lòng điền email nhận thông tin.", "error");
        document.getElementById("input-email").focus();
        return;
    }

    // Email regex validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast("Địa chỉ email không hợp lệ.", "error");
        document.getElementById("input-email").focus();
        return;
    }

    // Show spinner inside wait screen
    document.getElementById("modal-form-view").style.display = "none";
    document.getElementById("modal-payment-view").style.display = "block";
    document.getElementById("qr-loading-spinner").style.display = "flex";

    try {
        const res = await fetch(`${API_BASE_URL}/api/public/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: selectedProduct.id,
                discord_id: discordId || null,
                contact: email,
                note: note
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Lỗi máy chủ.");
        }

        const resData = await res.json();
        if (resData.ok && resData.data) {
            const order = resData.data;
            currentOrderCode = order.order_code;

            // Populate payment details
            document.getElementById("payment-order-code").innerText = order.order_code;
            document.getElementById("payment-amount").innerText = order.total_amount.toLocaleString() + "đ";
            document.getElementById("payment-ref").innerText = order.order_code;
            document.getElementById("payment-qr").src = order.payment_qr_code;
            
            // Hide loading spinner inside QR card once image is fetched
            document.getElementById("payment-qr").onload = () => {
                document.getElementById("qr-loading-spinner").style.display = "none";
            };

            // Start polling order status
            startOrderStatusPolling(order.order_code);
        } else {
            throw new Error(resData.error || "Tạo hóa đơn thất bại.");
        }
    } catch (e) {
        console.error("Order submission failed:", e);
        document.getElementById("modal-payment-view").style.display = "none";
        document.getElementById("modal-error-view").style.display = "block";
        document.getElementById("error-message").innerText = e.message || "Đã xảy ra lỗi không xác định.";
    }
}

// Poll order status
function startOrderStatusPolling(orderCode) {
    if (statusPollInterval) clearInterval(statusPollInterval);

    statusPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/public/orders/${orderCode}`);
            if (!res.ok) return;
            const result = await res.json();
            if (result.ok && result.data) {
                const status = result.data.status;
                if (status === "PROCESSING" || status === "COMPLETED") {
                    clearInterval(statusPollInterval);
                    statusPollInterval = null;
                    
                    // Show success screen
                    document.getElementById("modal-payment-view").style.display = "none";
                    document.getElementById("modal-success-view").style.display = "block";
                    document.getElementById("success-order-code").innerText = orderCode;
                    showToast("🎉 Thanh toán nhận được thành công!", "success");
                } else if (status === "CANCELLED") {
                    clearInterval(statusPollInterval);
                    statusPollInterval = null;
                    
                    // Show error screen
                    document.getElementById("modal-payment-view").style.display = "none";
                    document.getElementById("modal-error-view").style.display = "block";
                    document.getElementById("error-message").innerText = "Đơn hàng của bạn đã bị hủy hoặc hết hạn.";
                }
            }
        } catch (e) {
            console.error("Error polling status:", e);
        }
    }, 3000); // Poll every 3 seconds
}

// Toast Notifications
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconClass = "ph ph-info";
    if (type === "success") iconClass = "ph ph-check-circle";
    if (type === "error") iconClass = "ph ph-warning-circle";

    toast.innerHTML = `
        <i class="${iconClass}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove toast after 4 seconds
    setTimeout(() => {
        toast.style.animation = "toast-in 0.3s reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Copy Reference text
function copyText(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast("📋 Đã copy nội dung chuyển khoản!", "success");
    }).catch(() => {
        showToast("❌ Không thể copy.", "error");
    });
}

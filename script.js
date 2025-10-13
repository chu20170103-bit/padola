// ========== 從 Google Sheets 載入資料 ==========
let girlsData = [];
const galleryContainer = document.getElementById('galleryContainer');
const scheduleTextTaoyuan = document.getElementById('scheduleTextTaoyuan');
const scheduleTextZhongli = document.getElementById('scheduleTextZhongli');
const updateTimeSpan = document.getElementById('updateTime');

// 自動刷新間隔（毫秒）
const SCHEDULE_REFRESH_INTERVAL = 60000;  // 時刻表：1 分鐘更新一次
const GIRLS_REFRESH_INTERVAL = 300000;    // 妹妹資料：5 分鐘更新一次

// 格式化時刻表文字
function formatScheduleText(text) {
    if (!text) return '暫無時刻表資料';
    
    let formatted = text;
    
    // 移除不需要顯示的內容
    formatted = formatted
        // 移除所有包含 drive.google.com 的整行
        .replace(/.*?https?:\/\/drive\.google\.com[^\n]*/gi, '')
        // 移除所有包含 line.me/ti/p 的整行
        .replace(/.*?https?:\/\/line\.me\/ti\/p[^\n]*/gi, '')
        // 移除「桃園中壢妹照影」相關文字
        .replace(/.*?桃園中壢妹照影.*?\n?/gi, '')
        // 移除「潘朵拉一線」相關文字
        .replace(/.*?潘朵拉一線.*?\n?/gi, '')
        // 移除 📷 符號後面的內容（通常是連結）
        .replace(/📷[^\n]*/g, '')
        // 移除多餘的空白和換行
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s+|\s+$/gm, '')
        .trim();
    
    // 替換特殊符號和關鍵字為 HTML 標籤
    formatted = formatted
        // 先處理地址&停車場官方輸入【A】或【B】 → 加上連結和雙換行
        .replace(/🚘地址&停車場輸入【([AB])】/g, (match, letter) => {
            return `🚘<a href="https://line.me/R/ti/p/@301jxtvh" target="_blank" class="sch-link">地址&停車場官方輸入<span class="sch-title-link">【${letter}】</span></a><br><br>`;
        })
        // 【桃園區】【中壢區】等區域標題
        .replace(/【(桃園區|中壢區)】/g, '<span class="sch-title">【$1】</span>')
        // 妹妹編號 B01, A01 等（不帶【】）
        .replace(/\b([AB]\d+)\b/g, '<span class="sch-code">$1</span>')
        // 🌸 符號高亮（新妹妹）
        .replace(/🌸/g, '<span class="sch-new">🌸</span>')
        // 🚘 符號高亮（如果還有單獨的）
        .replace(/🚘/g, '<span class="sch-icon">🚘</span>')
        // ❤️ 符號高亮
        .replace(/❤️/g, '<span class="sch-heart">❤️</span>')
        // 📷 符號高亮
        .replace(/📷/g, '<span class="sch-camera">📷</span>')
        // 狀態：現
        .replace(/(\s現)(?!\d)/g, '<span class="sch-available"> 現</span>')
        // 狀態：滿
        .replace(/(\s滿)/g, '<span class="sch-full"> 滿</span>')
        // 時間格式高亮（例如：2330, 2400）
        .replace(/(\d{4})(?![0-9])/g, '<span class="sch-time">$1</span>')
        // 換行
        .replace(/\n/g, '<br>');
    
    return formatted;
}

// 分割桃園和中壢的時刻表
function splitSchedule(text) {
    console.log('原始時刻表資料（前200字）:', text.substring(0, 200));
    
    // 找出【桃園區】的位置
    const taoyuanIndex = text.indexOf('【桃園區】');
    const zhongliIndex = text.indexOf('【中壢區】');
    
    let taoyuan = '';
    let zhongli = '';
    
    if (taoyuanIndex !== -1 && zhongliIndex !== -1) {
        // 兩個都找到
        taoyuan = text.substring(taoyuanIndex, zhongliIndex).trim();
        zhongli = text.substring(zhongliIndex).trim();
    } else if (taoyuanIndex !== -1) {
        // 只有桃園區
        taoyuan = text.substring(taoyuanIndex).trim();
    } else if (zhongliIndex !== -1) {
        // 只有中壢區
        zhongli = text.substring(zhongliIndex).trim();
    }
    
    console.log('桃園區資料（前100字）:', taoyuan.substring(0, 100));
    console.log('中壢區資料（前100字）:', zhongli.substring(0, 100));
    
    return {
        taoyuan: taoyuan || '暫無桃園區資料',
        zhongli: zhongli || '暫無中壢區資料'
    };
}

// 載入最新時刻表（E1 欄位）
async function loadSchedule() {
    try {
        const response = await fetch(SHEET_CONFIG.CSV_URL);
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        // 讀取 E1（第1行第5欄，索引[0][4]）
        if (rows && rows.length > 0 && rows[0].length > 4) {
            const scheduleData = rows[0][4] || '暫無時刻表資料';
            
            // 分割桃園和中壢
            const { taoyuan, zhongli } = splitSchedule(scheduleData);
            
            // 格式化並顯示
            scheduleTextTaoyuan.innerHTML = formatScheduleText(taoyuan);
            scheduleTextZhongli.innerHTML = formatScheduleText(zhongli);
            
            // 更新時間
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            updateTimeSpan.textContent = `最後更新：${timeStr}`;
            
            console.log('✅ 時刻表更新成功:', timeStr);
        } else {
            scheduleTextTaoyuan.innerHTML = '<p>⚠️ 無法載入資料</p>';
            scheduleTextZhongli.innerHTML = '<p>⚠️ 無法載入資料</p>';
        }
    } catch (error) {
        console.error('載入時刻表失敗:', error);
        scheduleTextTaoyuan.innerHTML = '<p>⚠️ 載入失敗</p>';
        scheduleTextZhongli.innerHTML = '<p>⚠️ 載入失敗</p>';
    }
}

// 載入資料（帶快取）
let cachedData = null;
let lastLoadTime = 0;
const CACHE_DURATION = 300000; // 快取 5 分鐘（減少重複載入）

async function loadGirlsData(forceReload = false) {
    try {
        // 如果有快取且未過期，直接使用快取
        const now = Date.now();
        if (!forceReload && cachedData && (now - lastLoadTime) < CACHE_DURATION) {
            console.log('✅ 使用快取資料');
            renderFromCache();
            return;
        }
        
        // 使用發布的 CSV 網址
        const response = await fetch(SHEET_CONFIG.CSV_URL);
        const csvText = await response.text();
        
        // 解析 CSV
        const rows = parseCSV(csvText);
        
        // 掃描整個表格尋找妹妹資料
        girlsData = [];
        console.log('CSV 總行數:', rows.length);
        console.log('第1行 (標題):', rows[0] ? rows[0].slice(0, 4) : '不存在');
        console.log('第2行 (第一筆資料):', rows[1] ? rows[1].slice(0, 4) : '不存在');
        
        // 從第13行開始掃描到第100行（或表格結束）
        const endRow = Math.min(SHEET_CONFIG.SCAN_END_ROW, rows.length);
        
        for (let i = SHEET_CONFIG.SCAN_START_ROW; i < endRow; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const regionName = row[SHEET_CONFIG.COLUMNS.REGION_NAME];
            const info = row[SHEET_CONFIG.COLUMNS.INFO];
            const download = row[SHEET_CONFIG.COLUMNS.DOWNLOAD];
            const image = row[SHEET_CONFIG.COLUMNS.IMAGE];
            const video = row[SHEET_CONFIG.COLUMNS.VIDEO];
            
            // 解析「【桃園區】可麗露」格式
            const parsed = parseRegionAndName(regionName);
            
            if (parsed) {
                console.log(`✓ 找到妹妹 [行${i+1}]:`, {
                    region: parsed.region,
                    name: parsed.name,
                    hasImage: !!image,
                    hasVideo: !!video,
                    hasDownload: !!download
                });
                
                girlsData.push({
                    keyword: `${parsed.region}${i}`,  // 生成唯一ID
                    name: parsed.name.trim(),
                    area: parsed.region,
                    image: image ? image.trim() : '',
                    video: video ? video.trim() : '',
                    info: info || '',
                    download: download ? download.trim() : '',
                    rowNumber: i + 1  // 實際行號（從1開始）
                });
            }
        }
        
        console.log('✅ 載入完成！總共找到:', girlsData.length, '位妹妹');
        
        // 儲存快取
        cachedData = girlsData;
        lastLoadTime = Date.now();
        
        // 渲染圖片
        renderGallery();
        updateTabCounts();
        
    } catch (error) {
        console.error('載入資料失敗:', error);
        galleryContainer.innerHTML = `
            <div class="error-message">
                <p>⚠️ 資料載入失敗</p>
                <p>請稍後再試或聯絡管理員</p>
                <button onclick="loadGirlsData(true)" class="retry-btn">重新載入</button>
            </div>
        `;
    }
}

// 從快取渲染
function renderFromCache() {
    girlsData = cachedData;
    renderGallery();
    updateTabCounts();
}

// 簡單的 CSV 解析器
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else if (char !== '\r') {
            currentField += char;
        }
    }
    
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    return rows;
}

// HTML 轉義函數
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 轉換 Google Drive 影片連結為嵌入格式
function convertDriveVideoUrl(url) {
    if (!url) return null;
    
    // 從 Google Drive 連結中提取 file ID
    const match = url.match(/\/file\/d\/([^\/]+)/);
    if (match) {
        const fileId = match[1];
        return `https://drive.google.com/file/d/${fileId}/preview`;
    }
    
    // 如果已經是 preview 格式，直接返回
    if (url.includes('/preview')) {
        return url;
    }
    
    return url;
}

// 渲染圖片展示
function renderGallery() {
    galleryContainer.innerHTML = '';
    
    if (girlsData.length === 0) {
        galleryContainer.innerHTML = `
            <div class="empty-message">
                <p>目前沒有在班妹妹</p>
            </div>
        `;
        return;
    }
    
    girlsData.forEach((girl, index) => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.setAttribute('data-category', girl.area);
        
        const imageUrl = girl.image || `https://via.placeholder.com/400x600/667eea/ffffff?text=${encodeURIComponent(girl.name)}`;
        const videoUrl = girl.video ? convertDriveVideoUrl(girl.video) : null;
        
        // 處理妹妹資訊文字（保留換行）
        const infoText = girl.info.replace(/\n/g, '<br>');
        
        galleryItem.innerHTML = `
            <div class="girl-media">
                ${videoUrl ? `
                    <div class="media-toggle">
                        <button class="toggle-btn active" data-type="photo">📷 照片</button>
                        <button class="toggle-btn" data-type="video">🎬 影片</button>
                    </div>
                ` : ''}
                <div class="girl-image ${videoUrl ? 'active' : ''}">
                    <img src="${imageUrl}" alt="${girl.name}" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x600/764ba2/ffffff?text=${encodeURIComponent(girl.name)}'">
                </div>
                ${videoUrl ? `
                    <div class="girl-video">
                        <iframe src="${videoUrl}" frameborder="0" allow="autoplay" allowfullscreen></iframe>
                    </div>
                ` : ''}
            </div>
            <div class="girl-content">
                <div class="girl-header">
                    <span class="badge">${girl.area}區</span>
                    <h3 class="girl-name">${girl.name}</h3>
                    <button class="copy-btn" data-info="${escapeHtml(girl.info)}" title="複製文案">
                        <span class="copy-icon">📋</span>
                    </button>
                    <button class="copy-plus5-btn" data-info="${escapeHtml(girl.info)}" title="+5方案複製">
                        <span class="copy-icon">📋+5</span>
                    </button>
                </div>
                <div class="girl-info">
                    ${infoText}
                </div>
                <div class="girl-actions">
                    ${girl.download ? 
                        `<button class="download-btn" data-url="${girl.download}" onclick="event.stopPropagation();">📥 照影下載</button>` : 
                        `<button class="download-btn disabled" onclick="event.stopPropagation();" disabled>📥 照影下載</button>`
                    }
                    <a href="https://line.me/ti/p/uIhuzkYEr-" class="book-btn" target="_blank" onclick="event.stopPropagation();">立即報班</a>
                </div>
            </div>
        `;
        
        // 除錯：顯示圖片載入狀態
        const img = galleryItem.querySelector('img');
        img.addEventListener('load', () => {
            console.log(`✓ 圖片載入成功: ${girl.keyword} - ${girl.name}`);
        });
        img.addEventListener('error', () => {
            console.log(`✗ 圖片載入失敗: ${girl.keyword} - ${girl.name} - URL: ${imageUrl}`);
        });
        
        galleryContainer.appendChild(galleryItem);
        
        // 添加複製按鈕事件
        const copyBtn = galleryItem.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(girl.info, copyBtn);
            });
        }
        
        // 添加+5方案複製按鈕事件
        const copyPlus5Btn = galleryItem.querySelector('.copy-plus5-btn');
        if (copyPlus5Btn) {
            copyPlus5Btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboardPlus5(girl.info, copyPlus5Btn);
            });
        }
        
        // 添加照影下載按鈕事件（小窗口打開）
        const downloadBtn = galleryItem.querySelector('.download-btn:not(.disabled)');
        if (downloadBtn && downloadBtn.dataset.url) {
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPhotoWindow(downloadBtn.dataset.url);
            });
        }
        
        // 添加照片/影片切換功能
        if (girl.video) {
            const toggleBtns = galleryItem.querySelectorAll('.toggle-btn');
            const imageDiv = galleryItem.querySelector('.girl-image');
            const videoDiv = galleryItem.querySelector('.girl-video');
            
            toggleBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    const type = btn.dataset.type;
                    
                    // 切換按鈕狀態
                    toggleBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // 切換顯示內容
                    if (type === 'photo') {
                        imageDiv.classList.add('active');
                        videoDiv.classList.remove('active');
                    } else {
                        imageDiv.classList.remove('active');
                        videoDiv.classList.add('active');
                    }
                });
            });
        }
    });
    
    // 重新初始化燈箱功能
    initLightbox();
}

// 開啟照片下載小窗口（Google Drive 不支援 iframe，所以用小窗口）
function openPhotoWindow(url) {
    // 計算窗口位置（置中）
    const width = 1000;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    // 開啟小窗口（而不是新分頁）
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    window.open(url, 'PhotoDownload', features);
}

// 複製文案到剪貼簿
function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        // 顯示複製成功提示
        const originalIcon = button.innerHTML;
        button.innerHTML = '<span class="copy-icon">✓</span>';
        button.classList.add('copied');
        
        // 顯示提示訊息
        showToast('✅ 文案已複製！');
        
        // 2秒後恢復原狀
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('複製失敗:', err);
        showToast('❌ 複製失敗，請重試');
    });
}

// 複製文案到剪貼簿（+5方案版本）
function copyToClipboardPlus5(text, button) {
    // 將 "回 X.X" 格式轉換為 "$XXXX" 格式
    // 公式：(回本 + 0.5) × 1000 = 最終價格
    const plus5Text = text.replace(/💲(\d+)🕸(\d+)S回\s*([\d.]+)/g, (match, minutes, shots, basePrice) => {
        const base = parseFloat(basePrice);
        const finalPrice = Math.round((base + 0.5) * 1000);
        return `💲${minutes}🕸${shots}S $${finalPrice}`;
    });
    
    copyTextToClipboard(plus5Text, button, '✅ 文案已複製（+5方案）！');
}

// 通用複製文字函數
function copyTextToClipboard(text, button, message) {
    navigator.clipboard.writeText(text).then(() => {
        // 顯示複製成功提示
        const originalIcon = button.innerHTML;
        button.innerHTML = '<span class="copy-icon">✓</span>';
        button.classList.add('copied');
        
        // 顯示提示訊息
        showToast(message);
        
        // 2秒後恢復原狀
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('複製失敗:', err);
        showToast('❌ 複製失敗，請重試');
    });
}

// 顯示提示訊息
function showToast(message) {
    // 移除舊的提示
    const oldToast = document.querySelector('.toast');
    if (oldToast) {
        oldToast.remove();
    }
    
    // 創建新提示
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 顯示動畫
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 3秒後移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// 更新分類標籤的數量
function updateTabCounts() {
    const taoyuanCount = girlsData.filter(g => g.area === '桃園').length;
    const zhongliCount = girlsData.filter(g => g.area === '中壢').length;
    const totalCount = girlsData.length;
    
    document.querySelector('.tab-btn[data-category="all"] .tab-count').textContent = totalCount;
    document.querySelector('.tab-btn[data-category="桃園"] .tab-count').textContent = taoyuanCount;
    document.querySelector('.tab-btn[data-category="中壢"] .tab-count').textContent = zhongliCount;
    
    // 更新 Hero 區統計
    const statNumber = document.querySelector('.hero-stats .stat-item:first-child .stat-number');
    if (statNumber) {
        statNumber.textContent = totalCount + '+';
    }
}

// ========== 導航欄滾動效果 ==========
const navbar = document.querySelector('.navbar');
const navMenu = document.getElementById('navMenu');
const hamburger = document.getElementById('hamburger');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// 漢堡選單
if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// 點擊導航連結關閉選單
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if (navMenu) navMenu.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
    });
});

// ========== 分類篩選功能 ==========
const tabBtns = document.querySelectorAll('.tab-btn');

function filterGallery(category) {
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    galleryItems.forEach((item, index) => {
        if (category === 'all' || item.dataset.category === category) {
            item.classList.remove('hidden');
            // 添加漸進動畫
            setTimeout(() => {
                item.style.animation = 'fadeInUp 0.5s ease';
            }, index * 50);
        } else {
            item.classList.add('hidden');
        }
    });
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // 移除所有活動狀態
        tabBtns.forEach(b => b.classList.remove('active'));
        // 添加當前按鈕的活動狀態
        btn.classList.add('active');

        const category = btn.dataset.category;
        filterGallery(category);
    });
});

// ========== 燈箱功能 ==========
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const closeBtn = document.querySelector('.close-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

let currentImageIndex = 0;
let visibleImages = [];

// 更新可見圖片列表
function updateVisibleImages() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    visibleImages = Array.from(galleryItems).filter(item => !item.classList.contains('hidden'));
}

// 初始化燈箱功能
function initLightbox() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    // 打開燈箱 - 點擊圖片區域（只在照片模式下）
    galleryItems.forEach((item, index) => {
        const girlImage = item.querySelector('.girl-image');
        
        if (girlImage) {
            girlImage.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 只有在照片模式（active）下才開啟燈箱
                if (girlImage.classList.contains('active')) {
                    updateVisibleImages();
                    currentImageIndex = visibleImages.indexOf(item);
                    const imgSrc = item.querySelector('img').src;
                    lightboxImg.src = imgSrc;
                    lightbox.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            });
            
            // 添加提示效果
            girlImage.style.cursor = 'pointer';
            girlImage.title = '點擊查看大圖';
        }
    });
}

// 關閉燈箱
function closeLightbox() {
    if (lightbox) {
        lightbox.classList.remove('active');
    }
    document.body.style.overflow = 'auto';
}

// 多種關閉方式
if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
    });
}

if (lightbox) {
    lightbox.addEventListener('click', (e) => {
        // 點擊背景黑色區域關閉
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
}

// 點擊圖片本身也能關閉
if (lightboxImg) {
    lightboxImg.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
    });
}

// 上一張圖片
prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentImageIndex = (currentImageIndex - 1 + visibleImages.length) % visibleImages.length;
    const imgSrc = visibleImages[currentImageIndex].querySelector('img').src;
    lightboxImg.src = imgSrc;
    lightboxImg.style.animation = 'none';
    setTimeout(() => {
        lightboxImg.style.animation = 'zoomIn 0.3s ease';
    }, 10);
});

// 下一張圖片
nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentImageIndex = (currentImageIndex + 1) % visibleImages.length;
    const imgSrc = visibleImages[currentImageIndex].querySelector('img').src;
    lightboxImg.src = imgSrc;
    lightboxImg.style.animation = 'none';
    setTimeout(() => {
        lightboxImg.style.animation = 'zoomIn 0.3s ease';
    }, 10);
});

// 鍵盤控制
document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;

    if (e.key === 'Escape') {
        closeLightbox();
    } else if (e.key === 'ArrowLeft') {
        prevBtn.click();
    } else if (e.key === 'ArrowRight') {
        nextBtn.click();
    }
});

// ========== 回到頂部按鈕 ==========
const scrollToTopBtn = document.getElementById('scrollToTop');

window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// ========== 平滑滾動到區塊 ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ========== 頁面載入 ==========
window.addEventListener('load', () => {
    // 初始載入資料
    loadGirlsData();
    loadSchedule();
    
    // 設定時刻表自動刷新（1 分鐘）
    setInterval(() => {
        console.log('🔄 自動刷新時刻表...');
        loadSchedule();
    }, SCHEDULE_REFRESH_INTERVAL);
    
    // 設定妹妹資料自動刷新（5 分鐘）
    setInterval(() => {
        console.log('🔄 自動刷新妹妹資料...');
        loadGirlsData();
    }, GIRLS_REFRESH_INTERVAL);
    
    console.log(`⏰ 已設定自動刷新：`);
    console.log(`   📋 時刻表：每 ${SCHEDULE_REFRESH_INTERVAL / 1000} 秒`);
    console.log(`   👧 妹妹資料：每 ${GIRLS_REFRESH_INTERVAL / 1000} 秒`);
});

// ========== 滾動顯示動畫 ==========
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// 觀察需要動畫的元素
document.querySelectorAll('.section-title, .area-card, .feature-card').forEach(el => {
    observer.observe(el);
});

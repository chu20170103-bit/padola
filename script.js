// ========== 從 Google Sheets 載入資料 ==========
let girlsData = [];
const galleryContainer = document.getElementById('galleryContainer');
const scheduleTextTaoyuan = document.getElementById('scheduleTextTaoyuan');
const scheduleTextZhongli = document.getElementById('scheduleTextZhongli');
const updateTimeSpan = document.getElementById('updateTime');

// 自動刷新間隔（毫秒）- 30 秒
const REFRESH_INTERVAL = 30000;

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
        // 地址&停車場官方輸入【A】或【B】 → 加上連結
        .replace(/🚘地址&停車場輸入【([AB])】/g, (match, letter) => {
            return `🚘<a href="https://line.me/R/ti/p/@301jxtvh" target="_blank" class="sch-link">地址&停車場官方輸入<span class="sch-title-link">【${letter}】</span></a>`;
        })
        // 【桃園區】【中壢區】等標題改為醒目樣式（但不是A或B）
        .replace(/【((?!A|B)[^】]+)】/g, '<span class="sch-title">【$1】</span>')
        // 🌸 符號高亮（新妹妹）
        .replace(/🌸/g, '<span class="sch-new">🌸</span>')
        // 🚘 符號高亮
        .replace(/🚘/g, '<span class="sch-icon">🚘</span>')
        // ❤️ 符號高亮
        .replace(/❤️/g, '<span class="sch-heart">❤️</span>')
        // 📷 符號高亮
        .replace(/📷/g, '<span class="sch-camera">📷</span>')
        // 妹妹編號 B01, A01 等
        .replace(/([AB]\d+)/g, '<span class="sch-code">$1</span>')
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
    // 找出【桃園區】和【中壢區】的位置
    const taoyuanMatch = text.match(/【桃園區】[\s\S]*?(?=【中壢區】|$)/);
    const zhongliMatch = text.match(/【中壢區】[\s\S]*/);
    
    return {
        taoyuan: taoyuanMatch ? taoyuanMatch[0].trim() : '暫無桃園區資料',
        zhongli: zhongliMatch ? zhongliMatch[0].trim() : '暫無中壢區資料'
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

// 載入資料
async function loadGirlsData() {
    try {
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
            
            // 解析「【桃園區】可麗露」格式
            const parsed = parseRegionAndName(regionName);
            
            if (parsed) {
                console.log(`✓ 找到妹妹 [行${i+1}]:`, {
                    region: parsed.region,
                    name: parsed.name,
                    hasImage: !!image,
                    hasDownload: !!download,
                    imageUrl: image ? image.substring(0, 50) + '...' : '無'
                });
                
                girlsData.push({
                    keyword: `${parsed.region}${i}`,  // 生成唯一ID
                    name: parsed.name.trim(),
                    area: parsed.region,
                    image: image ? image.trim() : '',
                    info: info || '',
                    download: download ? download.trim() : '',
                    rowNumber: i + 1  // 實際行號（從1開始）
                });
            }
        }
        
        console.log('✅ 載入完成！');
        console.log('總共找到:', girlsData.length, '位妹妹');
        console.log('桃園區:', girlsData.filter(g => g.area === '桃園').length, '位');
        console.log('中壢區:', girlsData.filter(g => g.area === '中壢').length, '位');
        console.log('前5筆資料:', girlsData.slice(0, 5).map(g => ({
            keyword: g.keyword,
            name: g.name,
            area: g.area,
            row: g.rowNumber,
            hasImage: !!g.image
        })));
        
        // 渲染圖片
        renderGallery();
        updateTabCounts();
        
    } catch (error) {
        console.error('載入資料失敗:', error);
        galleryContainer.innerHTML = `
            <div class="error-message">
                <p>⚠️ 資料載入失敗</p>
                <p>請稍後再試或聯絡管理員</p>
                <button onclick="loadGirlsData()" class="retry-btn">重新載入</button>
            </div>
        `;
    }
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
        
        // 處理妹妹資訊文字（保留換行）
        const infoText = girl.info.replace(/\n/g, '<br>');
        
        galleryItem.innerHTML = `
            <div class="girl-image">
                <img src="${imageUrl}" alt="${girl.name}" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x600/764ba2/ffffff?text=${encodeURIComponent(girl.name)}'">
            </div>
            <div class="girl-content">
                <div class="girl-header">
                    <span class="badge">${girl.area}區</span>
                    <h3 class="girl-name">${girl.name}</h3>
                    <button class="copy-btn" data-info="${escapeHtml(girl.info)}" title="複製文案">
                        <span class="copy-icon">📋</span>
                    </button>
                </div>
                <div class="girl-info">
                    ${infoText}
                </div>
                <div class="girl-actions">
                    ${girl.download ? 
                        `<a href="${girl.download}" class="download-btn" target="_blank" onclick="event.stopPropagation();">📥 照影下載</a>` : 
                        `<button class="download-btn disabled" onclick="event.stopPropagation();" disabled>📥 照影下載</button>`
                    }
                    <a href="https://lin.ee/ut8ggmB" class="book-btn" target="_blank" onclick="event.stopPropagation();">立即報班</a>
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
    });
    
    // 重新初始化燈箱功能
    initLightbox();
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
    
    // 打開燈箱 - 點擊圖片區域
    galleryItems.forEach((item, index) => {
        const girlImage = item.querySelector('.girl-image');
        
        if (girlImage) {
            girlImage.addEventListener('click', (e) => {
                e.stopPropagation();
                updateVisibleImages();
                currentImageIndex = visibleImages.indexOf(item);
                const imgSrc = item.querySelector('img').src;
                lightboxImg.src = imgSrc;
                lightbox.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
            
            // 添加提示效果
            girlImage.style.cursor = 'pointer';
            girlImage.title = '點擊查看大圖';
        }
    });
}

// 關閉燈箱
closeBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
        closeLightbox();
    }
});

function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
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
    // 載入資料
    loadGirlsData();
    loadSchedule();
    
    // 設定自動刷新時刻表（每 30 秒）
    setInterval(() => {
        console.log('🔄 自動刷新時刻表...');
        loadSchedule();
    }, REFRESH_INTERVAL);
    
    console.log(`⏰ 已設定自動刷新：每 ${REFRESH_INTERVAL / 1000} 秒更新一次時刻表`);
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

// ========== 從 Google Sheets 載入資料 ==========
let girlsData = [];
const galleryContainer = document.getElementById('galleryContainer');
const scheduleTextTaoyuan = document.getElementById('scheduleTextTaoyuan');
const scheduleTextZhongli = document.getElementById('scheduleTextZhongli');
const updateTimeSpan = document.getElementById('updateTime');
const activityContent = document.getElementById('activityContent');
const rulesContent = document.getElementById('rulesContent');

// 地址資料儲存
let addressData = {
    taoyuan: { image: '', text: '' },
    zhongli: { image: '', text: '' }
};

// 自動刷新間隔（毫秒）- 只刷新時刻表
const SCHEDULE_REFRESH_INTERVAL = 60000;  // 時刻表：1 分鐘更新一次（避免超過 API 限制）

// ========== 防刷新攻擊機制 ==========
const MIN_SCHEDULE_INTERVAL = 5000;    // 最小間隔：5秒（正常用戶手動刷新也不會這麼快）
const MIN_GIRLS_INTERVAL = 15000;      // 最小間隔：15秒（放寬限制）
const MAX_FAILED_ATTEMPTS = 10;        // 最大失敗次數（連續10次才封鎖）
const BLOCK_DURATION = 120000;         // 封鎖時長：2 分鐘

// 使用 localStorage 持久化狀態（即使刷新頁面也能保留）
function getRefreshCount() {
    const initialState = { count: 0, lastTime: 0, blockUntil: 0 };

    try {
        const data = localStorage.getItem('refreshData');
        if (!data) return initialState;

        const parsed = JSON.parse(data);
        if (!parsed || typeof parsed !== 'object') return initialState;

        return {
            count: Number(parsed.count) || 0,
            lastTime: Number(parsed.lastTime) || 0,
            blockUntil: Number(parsed.blockUntil) || 0
        };
    } catch (error) {
        // 壞掉或被瀏覽器封鎖的 localStorage 不應中斷整個頁面。
        console.warn('⚠️ 無法讀取刷新狀態，已改用預設值:', error);
        return initialState;
    }
}

function setRefreshCount(count, lastTime, blockUntil = 0) {
    try {
        localStorage.setItem('refreshData', JSON.stringify({
            count: count,
            lastTime: lastTime,
            blockUntil: blockUntil
        }));
    } catch (error) {
        console.warn('⚠️ 無法儲存刷新狀態:', error);
    }
}

// 檢查是否被封鎖
function isCurrentlyBlocked() {
    const data = getRefreshCount();
    if (data.blockUntil && Date.now() < data.blockUntil) {
        return true;
    }
    // 封鎖時間已過，清除封鎖狀態
    if (data.blockUntil) {
        setRefreshCount(0, 0, 0);
    }
    return false;
}

let isFirstLoad = true;  // 是否首次載入（首次載入不受限制）

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
        // 先處理地址&停車場官方輸入【A】或【B】 → 改為彈出浮框
        .replace(/🚘地址&停車場輸入【([AB])】/g, (match, letter) => {
            return `🚘<a href="javascript:void(0);" class="sch-link address-trigger" data-letter="${letter}">地址&停車場官方輸入<span class="sch-title-link">【${letter}】</span></a><br><br>`;
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
    
    // 將妹妹名稱轉換為可點擊的鏈接（在所有其他格式化完成後）
    if (girlsData && girlsData.length > 0) {
        console.log('🔗 開始處理時刻表名稱鏈接，共', girlsData.length, '位妹妹');
        
        // 按名稱長度排序（長到短），避免短名稱覆蓋長名稱
        const sortedGirls = [...girlsData].sort((a, b) => b.name.length - a.name.length);
        
        let replacedCount = 0;
        sortedGirls.forEach(girl => {
            // 轉義特殊字符（用於正則表達式）
            const escapedName = girl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // 創建正則：匹配不在HTML標籤內的名稱
            // 分段處理：先分割HTML標籤，只處理標籤外的文字
            const parts = formatted.split(/(<[^>]+>)/);
            
            formatted = parts.map((part, index) => {
                // 如果是HTML標籤（奇數索引），不處理
                if (part.startsWith('<') && part.endsWith('>')) {
                    return part;
                }
                
                // 處理純文字部分
                // 注意：中文不適用 \b，所以用更寬鬆的匹配，但要避免重複替換
                const regex = new RegExp(`${escapedName}`, 'g');
                
                // 先檢查是否包含名稱，避免不必要的處理
                if (!part.includes(girl.name)) {
                    return part;
                }
                
                return part.replace(regex, (match) => {
                    replacedCount++;
                    return `<a href="#girl-${girl.name.replace(/\s+/g, '-')}" class="girl-name-link sch-girl-name" data-girl-name="${girl.name}">${match}</a>`;
                });
            }).join('');
        });
        
        console.log('✅ 時刻表名稱處理完成，共替換', replacedCount, '個名稱');
    } else {
        console.log('⚠️ girlsData 為空或未載入，無法處理時刻表名稱');
    }
    
    return formatted;
}

// 格式化活動資訊文字
function formatActivityText(text) {
    if (!text) return '<p style="color: rgba(255, 255, 255, 0.6);">暫無活動資訊</p>';
    
    let formatted = text;
    
    // 移除不需要的 Google Drive 連結
    formatted = formatted
        .replace(/.*?https?:\/\/drive\.google\.com[^\n]*/gi, '')
        .trim();
    
    // 替換關鍵字和格式
    formatted = formatted
        // 日期格式高亮
        .replace(/(日期[:：])([^\n]+)/g, '<div class="activity-date">📅 $1<strong>$2</strong></div>')
        // 活動妹妹標題
        .replace(/(活動妹妹[:：])/g, '<div class="activity-section-title">🎉 $1</div>')
        // 中壢活動妹妹（妹妹名字變成可點擊跳轉）
        .replace(/(中壢活動妹妹)【([^】]+)】/g, function(match, prefix, names) {
            const nameLinks = names.split(/[.、，,]/).map(name => {
                const trimmedName = name.trim();
                if (trimmedName) {
                    return `<a href="#girl-${trimmedName.replace(/\s+/g, '-')}" class="girl-name-link" data-girl-name="${trimmedName}">${trimmedName}</a>`;
                }
                return '';
            }).filter(link => link).join('、');
            return `<div class="activity-girls"><span class="area-tag zhongli">💎 中壢區</span>${nameLinks}</div>`;
        })
        // 桃園活動妹妹（妹妹名字變成可點擊跳轉）
        .replace(/(桃園活動妹妹)【([^】]+)】/g, function(match, prefix, names) {
            const nameLinks = names.split(/[.、，,]/).map(name => {
                const trimmedName = name.trim();
                if (trimmedName) {
                    return `<a href="#girl-${trimmedName.replace(/\s+/g, '-')}" class="girl-name-link" data-girl-name="${trimmedName}">${trimmedName}</a>`;
                }
                return '';
            }).filter(link => link).join('、');
            return `<div class="activity-girls"><span class="area-tag taoyuan">🌸 桃園區</span>${nameLinks}</div>`;
        })
        // 退水方案標題
        .replace(/(退水方案[:：])/g, '<div class="activity-section-title">💰 $1</div>')
        // 條件限制標題
        .replace(/(條件限制[:：])/g, '<div class="activity-section-title">📋 $1</div>')
        // 驗證公告標題
        .replace(/「(.+?)」/g, '<div class="activity-section-title">🔔 $1</div>')
        // 退水金額高亮
        .replace(/(\d+退水)/g, '<span class="highlight-money">$1</span>')
        // 時間方案高亮
        .replace(/(\d+分鐘方案)/g, '<span class="highlight-time">$1</span>')
        // 短工/長工標記
        .replace(/(短工|長工)/g, '<span class="work-type">$1</span>')
        // LINE 官方連結處理
        .replace(/(✅.+?[:：]\s*)(@[\w]+)/g, '$1<a href="https://line.me/ti/p/$2" target="_blank" class="activity-link">$2</a>')
        .replace(/👉\s*(https:\/\/lin\.ee\/[\w]+)/g, '👉 <a href="$1" target="_blank" class="activity-link">點此加入官方</a>')
        // 換行處理
        .replace(/\n/g, '<br>');
    
    return formatted;
}

// 格式化注意事項文字
function formatRulesText(text) {
    if (!text) {
        console.warn('⚠️ formatRulesText: 沒有輸入文字');
        return '<p style="color: rgba(255, 255, 255, 0.6);">暫無注意事項</p>';
    }
    
    console.log('🔧 格式化前原始文字（前100字）:', text.substring(0, 100));
    
    let formatted = text;
    
    // 移除不需要的 Google Drive 連結
    formatted = formatted
        .replace(/.*?https?:\/\/drive\.google\.com[^\n]*/gi, '')
        .trim();
    
    // 替換關鍵字和格式（重要：順序很重要，先處理連結和特殊格式，再處理符號）
    formatted = formatted
        // 【標題】格式
        .replace(/【(.+?)】/g, '<div class="rules-section-title">📌 $1</div>')
        // 「公告標題」格式（用引號）
        .replace(/「(.+?)」/g, '<div class="rules-section-title">🔔 $1</div>')
        // 段落標題（獨立一行，15字以內，不含標點結尾）
        .replace(/^([^\n]{2,15})$/gm, function(match) {
            // 排除太長的句子或包含具體內容的行
            if (match.includes('元') || match.includes('：') || match.includes('、') || match.length > 15 || match.includes('@') || match.includes('http')) {
                return match;
            }
            return '<div class="rules-section-title">📋 ' + match + '</div>';
        })
        // ====== 先處理連結（避免被後續替換破壞）======
        // LINE 完整連結改為按鈕樣式
        .replace(/(https?:\/\/lin\.ee\/[\w]+)/gi, '<a href="$1" target="_blank" class="rules-button">📱 點此加入官方</a>')
        // LINE ID 格式（@開頭），避免匹配已經在 HTML 標籤中的
        .replace(/(?<!href="|>)(@[\w]+)(?!<)/g, '<a href="https://line.me/ti/p/$1" target="_blank" class="rules-button-small">$1</a>')
        // ====== 再處理符號和關鍵字 ======
        // Emoji 符號高亮（在其他替換之前）
        .replace(/⚠️/g, '<span class="rules-warning">⚠️</span>')
        .replace(/❗/g, '<span class="rules-important">❗</span>')
        .replace(/✅/g, '<span class="rules-check">✅</span>')
        .replace(/❌(?!<\/span>)/g, '<span class="rules-cross">❌</span>')
        .replace(/👉/g, '<span class="rules-check">👉</span>')
        // 罰款金額高亮（xxxx元）
        .replace(/(\d{3,5})元/g, '<span class="rules-highlight">💰 $1元</span>')
        // 禁止詞高亮（避免重複替換已經有標籤的）
        .replace(/(?<!">)(禁止|不接|不可|嚴禁)(?!<)/g, '<span class="rules-cross">$1</span>')
        // 罰則關鍵字
        .replace(/(?<!">)(罰|賠償|損失)(?!<)/g, '<span class="rules-important">$1</span>')
        // 編號列表（1. 2. 3.）
        .replace(/^(\d+[\.\、])\s*(.+?)$/gm, '<div class="rules-list-item"><span class="rules-number">$1</span><span>$2</span></div>')
        // 重點文字（** 或 __ 包圍）
        .replace(/\*\*(.+?)\*\*/g, '<strong class="rules-highlight">$1</strong>')
        .replace(/__(.+?)__/g, '<strong class="rules-highlight">$1</strong>')
        // 換行處理
        .replace(/\n/g, '<br>');
    
    console.log('🔧 格式化後 HTML（前200字）:', formatted.substring(0, 200));
    
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
    const now = Date.now();
    
    // 防刷新保護：檢查是否被封鎖
    if (isCurrentlyBlocked()) {
        const data = getRefreshCount();
        const remainingSeconds = Math.ceil((data.blockUntil - now) / 1000);
        console.warn(`⛔ 系統偵測到異常行為，已暫時封鎖。剩餘 ${remainingSeconds} 秒`);
        scheduleTextTaoyuan.innerHTML = `<p style="color: #ef4444;">🚫 訪問已被限制</p><p style="font-size: 0.85rem;">${remainingSeconds} 秒後解除</p>`;
        scheduleTextZhongli.innerHTML = `<p style="color: #ef4444;">🚫 訪問已被限制</p><p style="font-size: 0.85rem;">${remainingSeconds} 秒後解除</p>`;
        return;
    }
    
    // 防刷新保護：檢查請求間隔（首次載入不限制）
    const data = getRefreshCount();
    const timeSinceLastLoad = now - data.lastTime;
    
    if (!isFirstLoad && data.lastTime > 0 && timeSinceLastLoad < MIN_SCHEDULE_INTERVAL) {
        const remainingTime = Math.ceil((MIN_SCHEDULE_INTERVAL - timeSinceLastLoad) / 1000);
        console.warn(`⚠️ 請求過於頻繁（第 ${data.count + 1} 次），請等待 ${remainingTime} 秒後再試`);
        
        // 增加計數
        const newCount = data.count + 1;
        setRefreshCount(newCount, data.lastTime, data.blockUntil);
        
        // 顯示等待訊息
        scheduleTextTaoyuan.innerHTML = '<p>⏳ 請稍候 ' + remainingTime + ' 秒...</p>';
        scheduleTextZhongli.innerHTML = '<p>⏳ 請稍候 ' + remainingTime + ' 秒...</p>';
        
        // 第 5 次警告時顯示友善提示
        if (newCount === 5) {
            alert('⚠️ 系統提醒\n\n您的操作過於頻繁，請稍等片刻再重新整理。\n\n時刻表會自動更新，無需手動刷新。');
        }
        
        // 如果失敗次數過多，封鎖 2 分鐘並彈窗警告
        if (newCount >= MAX_FAILED_ATTEMPTS) {
            const blockUntil = now + BLOCK_DURATION;
            setRefreshCount(0, now, blockUntil);
            console.error('🚫 偵測到異常刷新行為，已暫時封鎖 2 分鐘');
            
            // 顯示封鎖訊息
            scheduleTextTaoyuan.innerHTML = '<p style="color: #ef4444;">🚫 訪問已被限制</p><p style="font-size: 0.85rem;">2 分鐘後自動解除</p>';
            scheduleTextZhongli.innerHTML = '<p style="color: #ef4444;">🚫 訪問已被限制</p><p style="font-size: 0.85rem;">2 分鐘後自動解除</p>';
            
            // 彈窗警告
            alert('🚫 系統安全警告\n\n' +
                  '偵測到異常刷新行為！\n' +
                  '您的訪問已被暫時限制 2 分鐘。\n\n' +
                  '請注意：\n' +
                  '• 時刻表每 1 分鐘自動更新\n' +
                  '• 過度刷新會影響系統穩定性\n' +
                  '• 如有需要請聯繫客服\n\n' +
                  '2 分鐘後將自動解除限制。');
        }
        return;
    }
    
    try {
        // 記錄本次載入時間，重置計數
        setRefreshCount(0, now, 0);
        isFirstLoad = false; // 標記首次載入完成
        
        const response = await fetch(SHEET_CONFIG.CSV_URL);
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        // 讀取 E1（第1行第5欄，索引[0][4]）
        if (rows && rows.length > 0 && rows[0].length > 4) {
            const scheduleData = rows[0][4] || '暫無時刻表資料';
            
            // 分割桃園和中壢
            const { taoyuan, zhongli } = splitSchedule(scheduleData);
            
            // 儲存原始資料到全域變數，供後續更新使用
            window.currentScheduleData = { taoyuan, zhongli };
            
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
        
        // 讀取 F1（第1行第6欄，索引[0][5]）- 熱門活動資訊
        if (rows && rows.length > 0 && rows[0].length > 5 && activityContent) {
            const activityData = rows[0][5];
            if (activityData && activityData.trim()) {
                activityContent.innerHTML = formatActivityText(activityData);
                console.log('✅ 活動資訊更新成功');
            }
        }
        
        // 讀取 G1（第1行第7欄，索引[0][6]）- 注意事項與規範
        if (rows && rows.length > 0 && rows[0].length > 6 && rulesContent) {
            const rulesData = rows[0][6];
            console.log('📋 G1 原始資料:', rulesData ? rulesData.substring(0, 100) : '空白');
            if (rulesData && rulesData.trim()) {
                const formattedRules = formatRulesText(rulesData);
                rulesContent.innerHTML = formattedRules;
                console.log('✅ 注意事項更新成功');
                console.log('📋 格式化後（前200字）:', formattedRules.substring(0, 200));
            } else {
                rulesContent.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6);">目前沒有注意事項</p>';
                console.log('⚠️ G1 欄位無資料');
            }
        } else {
            console.log('⚠️ 無法讀取 G1 或 rulesContent 元素不存在');
            if (rulesContent) {
                rulesContent.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6);">載入注意事項失敗</p>';
            }
        }
        
        // 讀取地址資料（H1, H2：中壢；I1, I2：桃園）
        if (rows && rows.length > 0) {
            // 中壢地址（H1=圖片, H2=內容）
            if (rows[0].length > 7) {
                addressData.zhongli.image = rows[0][7] ? rows[0][7].trim() : '';
            }
            if (rows[1] && rows[1].length > 7) {
                addressData.zhongli.text = rows[1][7] ? rows[1][7].trim() : '';
            }
            
            // 桃園地址（I1=圖片, I2=內容）
            if (rows[0].length > 8) {
                addressData.taoyuan.image = rows[0][8] ? rows[0][8].trim() : '';
            }
            if (rows[1] && rows[1].length > 8) {
                addressData.taoyuan.text = rows[1][8] ? rows[1][8].trim() : '';
            }
            
            console.log('✅ 地址資料載入成功:', addressData);
        }
    } catch (error) {
        console.error('載入時刻表失敗:', error);
        scheduleTextTaoyuan.innerHTML = '<p style="color: #f59e0b;">⚠️ 載入失敗</p><p style="font-size: 0.85rem;">請稍後重試</p>';
        scheduleTextZhongli.innerHTML = '<p style="color: #f59e0b;">⚠️ 載入失敗</p><p style="font-size: 0.85rem;">請稍後重試</p>';
    }
}

// 更新時刻表中的妹妹名稱鏈接
function updateScheduleGirlNames() {
    if (!girlsData || girlsData.length === 0) {
        console.log('⚠️ girlsData 尚未載入，跳過更新時刻表名稱');
        return;
    }
    
    // 取得當前時刻表的純文字內容（儲存在全域變數中）
    if (window.currentScheduleData) {
        const { taoyuan, zhongli } = window.currentScheduleData;
        
        // 重新格式化（這次 girlsData 已經有資料了）
        scheduleTextTaoyuan.innerHTML = formatScheduleText(taoyuan);
        scheduleTextZhongli.innerHTML = formatScheduleText(zhongli);
        
        console.log('✅ 時刻表名稱鏈接已更新');
    }
}

// 載入資料（帶快取）
let cachedData = null;
let lastLoadTime = 0;
const CACHE_DURATION = 1800000; // 快取 30 分鐘（妹妹資訊通常一天才更新一次）

async function loadGirlsData(forceReload = false) {
    const now = Date.now();
    
    // 防刷新保護：檢查是否被封鎖
    if (isCurrentlyBlocked()) {
        console.warn('⛔ 系統偵測到異常行為，已暫時封鎖請求');
        galleryContainer.innerHTML = `
            <div class="error-message">
                <p>🚫 訪問已被限制</p>
                <p style="font-size: 0.9rem;">請稍候片刻後重新整理頁面</p>
            </div>
        `;
        return;
    }
    
    try {
        // 如果有快取且未過期，直接使用快取
        if (!forceReload && cachedData && (now - lastLoadTime) < CACHE_DURATION) {
            console.log('✅ 使用快取資料');
            renderFromCache();
            return;
        }
        
        // 更新載入提示
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = '⏳ 正在連接雲端資料庫...';
        }
        
        // 使用發布的 CSV 網址
        const response = await fetch(SHEET_CONFIG.CSV_URL);
        
        if (loadingText) {
            loadingText.textContent = '📥 正在下載妹妹資料...';
        }
        
        const csvText = await response.text();
        
        if (loadingText) {
            loadingText.textContent = '⚙️ 正在處理資料...';
        }
        
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
        
        // 更新載入提示為完成狀態
        if (loadingText) {
            loadingText.textContent = '✨ 載入完成！正在顯示...';
        }
        
        // 儲存快取
        cachedData = girlsData;
        lastLoadTime = Date.now();
        
        // 渲染圖片
        renderGallery();
        updateTabCounts();
        
        // 妹妹資料載入完成後，重新更新時刻表的名稱鏈接
        updateScheduleGirlNames();
        
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
    
    // 使用快取資料後，重新更新時刻表的名稱鏈接
    updateScheduleGirlNames();
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

// 轉換 Google Drive 圖片連結為直連格式
function convertDriveImageUrl(url) {
    if (!url) return null;
    
    // 如果已經是直連格式，直接返回
    if (url.includes('/uc?id=') || url.includes('/thumbnail?id=')) {
        return url;
    }
    
    // 從各種 Google Drive 連結格式中提取 file ID
    let fileId = null;
    
    // 格式 1: /file/d/{fileId}/view
    const match1 = url.match(/\/file\/d\/([^\/\?]+)/);
    if (match1) {
        fileId = match1[1];
    }
    
    // 格式 2: id={fileId}
    const match2 = url.match(/[?&]id=([^&]+)/);
    if (!fileId && match2) {
        fileId = match2[1];
    }
    
    // 格式 3: open?id={fileId}
    const match3 = url.match(/open\?id=([^&]+)/);
    if (!fileId && match3) {
        fileId = match3[1];
    }
    
    // 如果找到 fileId，返回直連格式
    if (fileId) {
        return `https://drive.google.com/uc?id=${fileId}`;
    }
    
    // 如果都不是 Google Drive 連結，直接返回原連結
    return url;
}

// 轉換 Google Drive 影片連結為嵌入格式
function convertDriveVideoUrl(url) {
    if (!url) return null;
    
    // 從各種 Google Drive 連結格式中提取 file ID
    let fileId = null;
    
    // 格式 1: /file/d/{fileId}/view 或 /file/d/{fileId}
    const match1 = url.match(/\/file\/d\/([^\/\?]+)/);
    if (match1) {
        fileId = match1[1];
    }
    
    // 格式 2: id={fileId}
    const match2 = url.match(/[?&]id=([^&]+)/);
    if (!fileId && match2) {
        fileId = match2[1];
    }
    
    // 格式 3: open?id={fileId}
    const match3 = url.match(/open\?id=([^&]+)/);
    if (!fileId && match3) {
        fileId = match3[1];
    }
    
    // 如果找到 fileId，返回 preview 格式
    if (fileId) {
        return `https://drive.google.com/file/d/${fileId}/preview`;
    }
    
    // 如果已經是 preview 格式，直接返回
    if (url.includes('/preview')) {
        return url;
    }
    
    // 如果都不是，返回 null 避免錯誤
    console.warn('⚠️ 無法轉換影片連結:', url);
    return null;
}

// 影片只在使用者主動點擊時才建立 iframe，避免首頁同時載入大量 Google Drive 預覽。
function loadVideoFrame(videoContainer, videoUrl, title) {
    if (!videoContainer || videoContainer.dataset.loaded === 'true') return;

    const iframe = document.createElement('iframe');
    iframe.src = videoUrl;
    iframe.title = `${title} 的影片`;
    iframe.loading = 'lazy';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'no-referrer';

    videoContainer.replaceChildren(iframe);
    videoContainer.dataset.loaded = 'true';
}

// 切回照片時移除 iframe，立刻停止 Drive 影片請求和播放資源。
function unloadVideoFrame(videoContainer) {
    if (!videoContainer) return;

    videoContainer.replaceChildren();
    delete videoContainer.dataset.loaded;
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
        // 添加唯一 ID，用於跳轉定位
        galleryItem.id = `girl-${girl.name.replace(/\s+/g, '-')}`;
        
        // 轉換圖片和影片連結為正確格式
        const imageUrl = girl.image ? convertDriveImageUrl(girl.image) : `https://via.placeholder.com/400x600/667eea/ffffff?text=${encodeURIComponent(girl.name)}`;
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
                    <div class="girl-video" aria-live="polite"></div>
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
        if (videoUrl) {
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
                        unloadVideoFrame(videoDiv);
                    } else {
                        imageDiv.classList.remove('active');
                        videoDiv.classList.add('active');
                        loadVideoFrame(videoDiv, videoUrl, girl.name);
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
        const isActive = navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
        hamburger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
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
        // 移除所有活動狀態和 aria-selected
        tabBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        // 添加當前按鈕的活動狀態
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

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

// ========== 活動資訊收合功能 ==========
function initActivityToggle() {
    const toggleBtn = document.getElementById('activityToggle');
    const activityContent = document.getElementById('activityContent');
    const activityHeader = document.getElementById('activityHeader');
    
    if (!toggleBtn || !activityContent) return;
    
    // 點擊標題區也可以展開/收合
    activityHeader.addEventListener('click', (e) => {
        // 如果點擊的是按鈕本身，不要重複處理
        if (e.target.closest('.activity-toggle')) return;
        toggleActivity();
    });
    
    // 點擊按鈕展開/收合
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止觸發標題的點擊事件
        toggleActivity();
    });
    
    function toggleActivity() {
        const isCollapsed = activityContent.classList.contains('collapsed');
        
        if (isCollapsed) {
            // 展開
            activityContent.classList.remove('collapsed');
            toggleBtn.classList.add('expanded');
            toggleBtn.querySelector('.toggle-text').textContent = '收起詳情';
            console.log('✅ 活動資訊已展開');
        } else {
            // 收起
            activityContent.classList.add('collapsed');
            toggleBtn.classList.remove('expanded');
            toggleBtn.querySelector('.toggle-text').textContent = '展開詳情';
            console.log('📦 活動資訊已收起');
        }
    }
}

// ========== 注意事項收合功能 ==========
function initRulesToggle() {
    const toggleBtn = document.getElementById('rulesToggle');
    const rulesContent = document.getElementById('rulesContent');
    const rulesHeader = document.getElementById('rulesHeader');
    
    if (!toggleBtn || !rulesContent) return;
    
    // 點擊標題區也可以展開/收合
    rulesHeader.addEventListener('click', (e) => {
        // 如果點擊的是按鈕本身，不要重複處理
        if (e.target.closest('.rules-toggle')) return;
        toggleRules();
    });
    
    // 點擊按鈕展開/收合
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止觸發標題的點擊事件
        toggleRules();
    });
    
    function toggleRules() {
        const isCollapsed = rulesContent.classList.contains('collapsed');
        
        if (isCollapsed) {
            // 展開
            rulesContent.classList.remove('collapsed');
            toggleBtn.classList.add('expanded');
            toggleBtn.querySelector('.toggle-text').textContent = '收起詳情';
            console.log('✅ 注意事項已展開');
        } else {
            // 收起
            rulesContent.classList.add('collapsed');
            toggleBtn.classList.remove('expanded');
            toggleBtn.querySelector('.toggle-text').textContent = '展開詳情';
            console.log('📦 注意事項已收起');
        }
    }
}

// ========== 妹妹名字跳转功能 ==========
function initGirlNameLinks() {
    // 使用事件委托，监听所有妹妹名字链接的点击
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.girl-name-link');
        if (link) {
            e.preventDefault();
            const girlName = link.getAttribute('data-girl-name');
            const targetId = `girl-${girlName.replace(/\s+/g, '-')}`;
            const targetCard = document.getElementById(targetId);
            
            if (targetCard) {
                // 移除之前的高亮
                document.querySelectorAll('.gallery-item.highlight').forEach(card => {
                    card.classList.remove('highlight');
                });
                
                // 滚动到目标卡片
                targetCard.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                
                // 添加高亮效果
                setTimeout(() => {
                    targetCard.classList.add('highlight');
                    // 2秒后自动移除高亮
                    setTimeout(() => {
                        targetCard.classList.remove('highlight');
                    }, 2000);
                }, 500);
                
                console.log(`✅ 跳转到妹妹卡片: ${girlName}`);
            } else {
                console.warn(`⚠️ 找不到妹妹卡片: ${girlName} (ID: ${targetId})`);
            }
        }
    });
}

// ========== 地址&停車場浮框功能 ==========
function initAddressModal() {
    const modal = document.getElementById('addressModal');
    const overlay = document.getElementById('addressModalOverlay');
    const closeBtn = document.getElementById('addressModalClose');
    const modalTitle = document.getElementById('addressModalTitle');
    const addressImage = document.getElementById('addressImage');
    const addressContent = document.getElementById('addressContent');
    const copyImageBtn = document.getElementById('copyImageBtn');
    const copyContentBtn = document.getElementById('copyContentBtn');
    
    if (!modal) return;
    
    // 使用事件委托處理所有地址觸發連結
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.address-trigger');
        if (trigger) {
            e.preventDefault();
            const letter = trigger.getAttribute('data-letter');
            openAddressModal(letter);
        }
    });
    
    // 開啟浮框
    function openAddressModal(letter) {
        // 根據字母判斷區域
        // A = 中壢區，B = 桃園區
        let region = 'taoyuan'; // 預設桃園
        
        if (letter === 'A') {
            region = 'zhongli';
            modalTitle.innerHTML = '🚘 中壢區 - 地址 & 停車場資訊';
        } else if (letter === 'B') {
            region = 'taoyuan';
            modalTitle.innerHTML = '🚘 桃園區 - 地址 & 停車場資訊';
        }
        
        // 設定圖片（轉換為直連格式）
        const imageUrl = convertDriveImageUrl(addressData[region].image);
        const currentImage = document.getElementById('addressImage');
        const imageSection = document.querySelector('.address-image-section');
        
        if (imageUrl && currentImage) {
            currentImage.src = imageUrl;
            currentImage.style.display = 'block';
            
            // 移除舊的點擊事件（使用 clone 技巧）
            const newImage = currentImage.cloneNode(true);
            currentImage.parentNode.replaceChild(newImage, currentImage);
            
            // 添加點擊放大功能（在浮框內放大，響應式）
            let isZoomed = false;
            const isMobile = window.innerWidth <= 768;
            const normalHeight = isMobile ? (window.innerWidth <= 480 ? '180px' : '200px') : '250px';
            const zoomedHeight = isMobile ? '400px' : '500px';
            const sectionZoomedHeight = isMobile ? '450px' : '600px';
            
            newImage.addEventListener('click', () => {
                if (!isZoomed) {
                    // 放大
                    newImage.style.maxHeight = zoomedHeight;
                    if (imageSection) {
                        imageSection.style.maxHeight = sectionZoomedHeight;
                        imageSection.style.overflow = 'auto';
                    }
                    isZoomed = true;
                } else {
                    // 縮小回原狀
                    newImage.style.maxHeight = normalHeight;
                    if (imageSection) {
                        imageSection.style.maxHeight = 'none';
                        imageSection.style.overflow = 'visible';
                    }
                    isZoomed = false;
                }
            });
        } else if (currentImage) {
            currentImage.style.display = 'none';
        }
        
        // 設定內容（保留換行）
        const text = addressData[region].text;
        if (text) {
            addressContent.innerHTML = text.replace(/\n/g, '<br>');
        } else {
            addressContent.innerHTML = '<p style="color: rgba(255,255,255,0.6);">暫無地址資訊</p>';
        }
        
        // 儲存當前資料到按鈕（使用轉換後的URL）
        const finalImageUrl = convertDriveImageUrl(addressData[region].image);
        copyImageBtn.setAttribute('data-url', finalImageUrl);
        copyContentBtn.setAttribute('data-text', text);
        
        // 顯示浮框
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    // 關閉浮框
    function closeAddressModal() {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    
    // 點擊關閉按鈕
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAddressModal);
    }
    
    // 點擊遮罩層
    if (overlay) {
        overlay.addEventListener('click', closeAddressModal);
    }
    
    // ESC 鍵關閉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeAddressModal();
        }
    });
    
    // 複製圖片（複製圖片本身到剪貼簿）
    if (copyImageBtn) {
        copyImageBtn.addEventListener('click', async () => {
            const url = copyImageBtn.getAttribute('data-url');
            if (url) {
                try {
                    const originalText = copyImageBtn.innerHTML;
                    copyImageBtn.innerHTML = '<span class="copy-icon">⏳</span> 處理中...';
                    
                    // 使用 canvas 來處理圖片，避免 CORS 問題
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = url;
                    });
                    
                    // 創建 canvas 並繪製圖片
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    // 轉換為 Blob
                    const blob = await new Promise(resolve => {
                        canvas.toBlob(resolve, 'image/png');
                    });
                    
                    // 複製圖片到剪貼簿
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            'image/png': blob
                        })
                    ]);
                    
                    copyImageBtn.innerHTML = '<span class="copy-icon">✓</span> 已複製';
                    copyImageBtn.classList.add('copied');
                    showToast('✅ 圖片已複製到剪貼簿！');
                    
                    setTimeout(() => {
                        copyImageBtn.innerHTML = originalText;
                        copyImageBtn.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    console.error('複製圖片失敗:', err);
                    // 如果失敗，嘗試複製網址作為備案
                    try {
                        await navigator.clipboard.writeText(url);
                        copyImageBtn.innerHTML = '<span class="copy-icon">✓</span> 已複製網址';
                        showToast('⚠️ 圖片複製失敗，已複製圖片網址');
                        setTimeout(() => {
                            copyImageBtn.innerHTML = '<span class="copy-icon">📋</span> 複製圖片';
                            copyImageBtn.classList.remove('copied');
                        }, 2000);
                    } catch (err2) {
                        copyImageBtn.innerHTML = '<span class="copy-icon">❌</span> 複製失敗';
                        showToast('❌ 複製失敗，請重試');
                        setTimeout(() => {
                            copyImageBtn.innerHTML = '<span class="copy-icon">📋</span> 複製圖片';
                        }, 2000);
                    }
                }
            }
        });
    }
    
    // 複製內容
    if (copyContentBtn) {
        copyContentBtn.addEventListener('click', () => {
            const text = copyContentBtn.getAttribute('data-text');
            if (text) {
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = copyContentBtn.innerHTML;
                    copyContentBtn.innerHTML = '<span class="copy-icon">✓</span> 已複製';
                    copyContentBtn.classList.add('copied');
                    showToast('✅ 地址內容已複製！');
                    setTimeout(() => {
                        copyContentBtn.innerHTML = originalText;
                        copyContentBtn.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('複製失敗:', err);
                    showToast('❌ 複製失敗，請重試');
                });
            }
        });
    }
}

// ========== 頁面載入 ==========
// 使用 DOMContentLoaded 而非 load，加快首次載入速度
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 開始載入資料...');
    
    // 初始化活動收合功能
    initActivityToggle();
    
    // 初始化注意事項收合功能
    initRulesToggle();
    
    // 初始化妹妹名字跳转功能
    initGirlNameLinks();
    
    // 初始化地址浮框功能
    initAddressModal();
    
    // 立即載入時刻表（優先顯示）
    loadSchedule();
    
    // 使用 setTimeout 讓時刻表先顯示，再載入妹妹資料
    setTimeout(() => {
        loadGirlsData();
    }, 100);
    
    // 設定時刻表自動刷新（1 分鐘）
    setInterval(() => {
        console.log('🔄 自動刷新時刻表...');
        loadSchedule();
    }, SCHEDULE_REFRESH_INTERVAL);
    
    console.log(`⏰ 已設定自動刷新：時刻表每 ${SCHEDULE_REFRESH_INTERVAL / 1000} 秒更新一次`);
    console.log(`💡 妹妹資料僅在頁面載入時更新（需要最新資料請重新整理頁面）`);
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

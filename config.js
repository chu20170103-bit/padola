// Google Sheets 資料庫配置
const SHEET_CONFIG = {
    // 使用發布的 CSV 網址（無 CORS 問題！）
    CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTMDU3Nhfv_fJbu9YXQVpDjkVGpGOGqBY9QDZPFduF7qKtgS7ywg-DAkpZSO3EUGVRucGMkW1Z2kSnq/pub?gid=419986915&single=true&output=csv',
    
    // 欄位對應（潘朵拉網頁專用工作表）
    COLUMNS: {
        REGION_NAME: 0,  // A欄：區域妹妹（例如：【桃園區】可麗露）
        INFO: 1,         // B欄：妹妹資訊
        DOWNLOAD: 2,     // C欄：妹妹資料下載
        IMAGE: 3         // D欄：妹妹照片 ✅
    },
    
    // 掃描起始行（從第2行開始，索引1）
    SCAN_START_ROW: 1,
    
    // 掃描結束行（可設定較大值確保掃描完整）
    SCAN_END_ROW: 100
};

// 從「【桃園區】可麗露」格式中解析區域和名稱
function parseRegionAndName(regionName) {
    if (!regionName) return null;
    
    // 匹配【區域】名稱的格式
    const match = regionName.match(/【(.+?)區】(.+)/);
    if (match) {
        const region = match[1]; // 桃園、中壢
        const name = match[2];   // 可麗露
        return { region, name };
    }
    return null;
}


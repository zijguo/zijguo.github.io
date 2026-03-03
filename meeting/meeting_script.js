const supabaseUrl = 'https://oqebiykwfzployraynyq.supabase.co'; 
const supabaseKey = 'sb_publishable_ZKpZuP7NY9wxTn29TSqQNg_8e-9m1FY'; // 你的 public key
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();
const MAX_LOOKAHEAD_YEARS = 1; // 允许最多往后看 1 年

// 计算本周一的日期
const dayOfWeek = TODAY.getDay(); // 0(周日) - 6(周六)

let daysToMonday;

// 逻辑优化：如果是周六(6) 或 周日(0)，通常意味着本周工作日已结束，直接显示"下周一"
if (dayOfWeek === 6) { 
    daysToMonday = 2; // 周六 + 2天 = 下周一
} else if (dayOfWeek === 0) {
    daysToMonday = 1; // 周日 + 1天 = 下周一
} else {
    // 周一到周五：回退到本周一
    // 周一(1) -> 偏移 0 天
    // 周二(2) -> 偏移 -1 天 ... 以此类推
    daysToMonday = 1 - dayOfWeek;
}

const currentMonday = new Date(TODAY);
// setDate 会自动处理月份跨越（比如 2月28日 + 2天 会变成 3月）
currentMonday.setDate(TODAY.getDate() + daysToMonday);
currentMonday.setHours(0, 0, 0, 0); // 清除时间，只保留日期

// 计算本周五的日期 (周一 + 4天)
const currentFriday = new Date(currentMonday);
currentFriday.setDate(currentMonday.getDate() + 4);

// 变量定义
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
let START_HOUR = 7;
let END_HOUR = 24;
let SLOT_DURATION = 60;
const STUDENT_HASH = '7313cd9030458bbb409607a5f3b034473e9bfa32cde1ce6a9d1c9e4ba368d0fd';
const ADMIN_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

// 使用刚才计算出的动态日期
let WEEK_START_DATE = currentMonday; 
let WEEK_END_DATE = currentFriday;

let MEETING_TIME = null;
let CALENDAR_YEAR = CURRENT_YEAR; // 动态年份
let studentCalendarYear = CURRENT_YEAR; // 动态年份

let availableDays = [1, 3, 4]; // Tue, Thu, Fri
let availStartHour = 7;
let availEndHour = 16;
let dayHourAvailability = {
    0: {
        start: 7,
        end: 16
    }, // Monday
    1: {
        start: 7,
        end: 16
    }, // Tuesday
    2: {
        start: 7,
        end: 16
    }, // Wednesday
    3: {
        start: 7,
        end: 16
    }, // Thursday
    4: {
        start: 7,
        end: 16
    } // Friday
};
let currentUser = null;
let bookings = {};
let blockedSlots = {};
let openedSlots = {};
let fullDayBlocks = {};
let selectedSlot = null;
let editingSlot = null;
let isQuickEditMode = false;

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function initializeApp() {
    listenToFirebase();
    updateWeekDateDisplay();
}


function generateTimeSlots() {
    const slots = [];
    for (let hour = START_HOUR; hour < END_HOUR; hour++) {
        for (let min = 0; min < 60; min += SLOT_DURATION) {
            const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
            slots.push(timeStr);
        }
    }
    return slots;
}

function getDateKey(dayIndex, time) {
    let targetDate = new Date(WEEK_START_DATE);
    
    targetDate.setDate(targetDate.getDate() + dayIndex);
    
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return `${dateStr}-${time}`;
}

function openAdminPanel() {
    // Removed - unified login
}

function closeAdminPanel() {
    // Removed - unified login
}

function verifyAdmin() {
    // Removed - unified login
}

function closeAdminSettings() {
    logout();
}

function logout() {
    currentUser = null;
    
    // 1. 显示登录界面
    document.getElementById('loginPage').style.display = 'flex';
    
    // 2. 隐藏主要内容区域
    const mainContent = document.getElementById('mainContent');
    mainContent.classList.remove('active');
    mainContent.style.display = 'none'; 
    
    // 3. 隐藏 AdminSettings
    document.getElementById('adminSettings').style.display = 'none';
    
    // 4. 清理输入框
    document.getElementById('password').value = '';
    document.getElementById('errorMessage').style.display = 'none';
    
    // 5. 隐藏 Availability Settings
    document.getElementById('availabilitySettings').style.display = 'none';

    isQuickEditMode = false;
    const quickEditBtn = document.getElementById('quickEditBtn');
    if (quickEditBtn) {
        quickEditBtn.style.display = 'none';
        quickEditBtn.innerHTML = '⚡ 快速编辑 (Off)';
        quickEditBtn.style.background = '#667eea';
    }

    // --- 【新增】强制重置 UI 样式，防止学生样式污染管理员界面 ---
    const settingsPanel = document.getElementById('settingsPanel');
    const layoutGrid = document.getElementById('mainLayoutGrid');
    const scheduleColumn = document.getElementById('scheduleColumn');
    
    // 恢复成默认的 CSS 状态 (清空内联样式)
    if (settingsPanel) settingsPanel.style.display = ''; 
    if (layoutGrid) layoutGrid.style.gridTemplateColumns = '';
    if (scheduleColumn) {
        scheduleColumn.style.display = '';
        scheduleColumn.style.textAlign = '';
        scheduleColumn.style.alignItems = '';
    }
}

function loadAdminSettings() {
    // 安全获取元素并赋值的辅助函数
    const safeSetValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };

    safeSetValue('startHour', START_HOUR);
    safeSetValue('endHour', END_HOUR);
    // safeSetValue('slotDuration', SLOT_DURATION);
    safeSetValue('availStartHour', availStartHour);
    safeSetValue('availEndHour', availEndHour);

    updateCurrentTimeRange();
    setWeekDateInputs();
    renderMeetingTimeSelector();
    renderAvailabilityDays();
    renderYearCalendar();
    loadAdminStats();
}

// 找到 updateCurrentTimeRange 函数，完全替换为：
function updateCurrentTimeRange() {
    const startStr = String(START_HOUR).padStart(2, '0') + ':00';
    const endStr = String(END_HOUR).padStart(2, '0') + ':00';
    
    // 增加安全检查，防止找不到元素报错
    const rangeEl = document.getElementById('currentTimeRange');
    if (rangeEl) {
        rangeEl.textContent = `${startStr} - ${endStr}`;
    }
}

function updateAdminPassword() {
    const newPassword = document.getElementById('newAdminPassword').value;
    const confirmPassword = document.getElementById('confirmAdminPassword').value;
    const messageEl = document.getElementById('passwordMessage');
    if (!newPassword) {
        messageEl.textContent = '❌ Please enter a new password.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    if (newPassword !== confirmPassword) {
        messageEl.textContent = '❌ Passwords do not match.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    ADMIN_PASSWORD = newPassword;
    localStorage.setItem('guoLabAdminPassword', ADMIN_PASSWORD);
    messageEl.textContent = '✓ Admin password updated successfully!';
    messageEl.classList.remove('error');
    messageEl.classList.add('success');
    messageEl.style.display = 'block';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('confirmAdminPassword').value = '';
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

function updateTimeSlots() {
    const startHour = parseInt(document.getElementById('startHour').value);
    const endHour = parseInt(document.getElementById('endHour').value);
    const duration = parseInt(document.getElementById('slotDuration').value);
    const messageEl = document.getElementById('timeMessage');
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
        messageEl.textContent = '❌ Hours must be between 0 and 23.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    if (startHour >= endHour) {
        messageEl.textContent = '❌ Start hour must be before end hour.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    START_HOUR = startHour;
    END_HOUR = endHour;
    SLOT_DURATION = duration;
    localStorage.setItem('guoLabScheduleConfig', JSON.stringify({
        startHour: START_HOUR,
        endHour: END_HOUR,
        slotDuration: SLOT_DURATION
    }));
    messageEl.textContent = '✓ Schedule updated successfully!';
    messageEl.classList.remove('error');
    messageEl.classList.add('success');
    messageEl.style.display = 'block';
    updateCurrentTimeRange();
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

function renderAvailabilityDays() {
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    let html = '<div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">';
    dayNames.forEach((dayName, index) => {
        const isSelected = availableDays.includes(index);
        const className = isSelected ? 'availability-day-btn active' : 'availability-day-btn';
        html += `
                    <button class="${className}" onclick="toggleAvailableDay(${index})" style="padding: 8px 12px; border: 2px solid ${isSelected ? '#4CAF50' : '#ddd'}; background: ${isSelected ? '#E8F5E9' : '#fff'}; border-radius: 4px; cursor: pointer; font-weight: ${isSelected ? 'bold' : 'normal'};">
                        ${dayName.substring(0, 3)}
                    </button>
                `;
    });
    html += '</div>';
    const container = document.getElementById('availabilityDaysContainer');
    if (container) {
        container.innerHTML = html;
    }
}

function toggleAvailableDay(dayIndex) {
    const idx = availableDays.indexOf(dayIndex);
    if (idx > -1) {
        availableDays.splice(idx, 1);
    } else {
        availableDays.push(dayIndex);
    }
    availableDays.sort();
    saveToFirebase();
    renderAvailabilityDays();
    updateScheduleDisplay();
}

function updateAvailability() {
    const startHour = parseInt(document.getElementById('availStartHour').value);
    const endHour = parseInt(document.getElementById('availEndHour').value);
    const messageEl = document.getElementById('availabilityMessage');
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
        messageEl.textContent = '❌ Hours must be between 0 and 23.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    if (startHour >= endHour) {
        messageEl.textContent = '❌ Start hour must be before end hour.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    if (availableDays.length === 0) {
        messageEl.textContent = '❌ Please select at least one day.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
        messageEl.style.display = 'block';
        return;
    }
    availStartHour = startHour;
    availEndHour = endHour;
    saveToFirebase();
    messageEl.textContent = '✓ Availability updated successfully!';
    messageEl.classList.remove('error');
    messageEl.classList.add('success');
    messageEl.style.display = 'block';
    updateScheduleDisplay();
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

function loadAdminStats() {
    const now = new Date(); // 获取当前时间

    // 1. 计算有效的预约数量
    // 过滤逻辑更新：
    // - 必须有 booking 数据且有名字
    // - 预约时间必须在“当前时间”之后 (slotDate >= now)
    const validBookings = Object.entries(bookings).filter(([key, booking]) => {
        // 基础校验：如果没有数据或没有名字，直接过滤
        if (!booking || !booking.name) return false;

        // 解析 key 获取日期和时间 (Key 格式示例: "2026-02-09-10:00")
        const lastDashIndex = key.lastIndexOf('-');
        const datePart = key.substring(0, lastDashIndex); 
        const timePart = key.substring(lastDashIndex + 1);

        // 构造该预约的时间对象 (添加 T 和 :00 以符合 ISO 格式)
        const slotDate = new Date(`${datePart}T${timePart}:00`);

        // 比较：如果预约时间小于当前时间，视为过期，不统计
        return slotDate >= now;
    });

    const bookedSlots = validBookings.length;

    // 2. 生成 HTML
    let html = `
        <div style="display: flex; gap: 20px; margin-bottom: 20px;">
            <div class="stat-box" style="flex: 0 0 200px; text-align: center; border-left: 5px solid #667eea;">
                <div class="stat-number" style="font-size: 2.5em; font-weight: bold; color: #667eea;">${bookedSlots}</div>
                <div class="stat-label" style="color: #666;">Upcoming Bookings</div>
            </div>
        </div>
        
        <h4 style="color: #667eea; margin-top: 20px; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
            📋 Detailed List (Future Only)
        </h4>
    `;

    // 3. 判断显示列表还是空状态
    if (bookedSlots === 0) {
        html += '<p style="color: #999; font-style: italic;">No upcoming bookings.</p>';
    } else {
        // 先排序 (按时间先后)
        validBookings.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

        html += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">';
        html += '<tr style="background: #f8f9fa; color: #666; border-bottom: 2px solid #eee;">' +
                '<th style="padding: 12px; text-align: left;">Day</th>' +
                '<th style="padding: 12px; text-align: left;">Time</th>' +
                '<th style="padding: 12px; text-align: left;">Student Name</th>' +
                '<th style="padding: 12px; text-align: left;">Email</th>' +
                '</tr>';

        validBookings.forEach(([key, booking]) => {
            const lastDashIndex = key.lastIndexOf('-');
            const datePart = key.substring(0, lastDashIndex); 
            const timePart = key.substring(lastDashIndex + 1);
            
            // 获取星期几
            const safeDate = new Date(datePart + 'T12:00:00'); 
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = dayNames[safeDate.getDay()];

            html += `<tr style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 12px; color: #666;">${dayName} <span style="font-size:0.8em; color:#999">(${datePart})</span></td>
                        <td style="padding: 12px; font-weight: bold; color: #667eea;">${timePart}</td>
                        <td style="padding: 12px; font-weight: bold; color: #333;">${booking.name}</td>
                        <td style="padding: 12px; color: #666;">${booking.email || '-'}</td>
                     </tr>`;
        });
        html += '</table>';
    }

    document.getElementById('adminStats').innerHTML = html;
}
// 新的触发函数
function clearAllBookings() {
    // 只是打开弹窗，不执行逻辑
    document.getElementById('confirmModal').classList.add('active');
    document.getElementById('confirmInput').value = ''; // 清空输入
    checkDeleteInput(); // 重置按钮状态
}

// 关闭弹窗
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
}

// 检查用户是否输入了 'DELETE'
function checkDeleteInput() {
    const input = document.getElementById('confirmInput').value;
    const btn = document.getElementById('btnConfirmDelete');
    
    if (input === 'DELETE') {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    }
}

// 真正执行删除的函数
function executeClearAll() {
    bookings = {};
    saveToFirebase();
    updateScheduleDisplay();
    loadAdminStats();
    
    closeConfirmModal();
    // 用你的 showMessage 替代 alert
    showMessage('✓ System Reset: All bookings have been cleared.', 'adminStats', 'success'); 
}

async function loginUser() {
    const passwordInput = document.getElementById('password').value;
    const errorDiv = document.getElementById('errorMessage');
    
    if (!passwordInput) {
        errorDiv.textContent = 'Please enter a password.';
        errorDiv.style.display = 'block';
        return;
    }

    const inputHash = await sha256(passwordInput);

    // 获取界面元素
    const settingsPanel = document.getElementById('settingsPanel');
    const layoutGrid = document.getElementById('mainLayoutGrid');
    const scheduleColumn = document.getElementById('scheduleColumn'); 
    const scheduleContainer = document.getElementById('scheduleContainer');

    if (inputHash === ADMIN_HASH) {
        currentUser = { role: 'admin' };
        const quickEditBtn = document.getElementById('quickEditBtn');
        if (quickEditBtn) quickEditBtn.style.display = 'inline-block'; // 管理员显示按钮
        
        // --- 【修改点 1】先把界面改成老师的样子 (防止后面报错导致界面没变) ---
        if(settingsPanel) settingsPanel.style.display = 'block'; 
        if(layoutGrid) layoutGrid.style.gridTemplateColumns = '1fr 1fr';

        if(scheduleColumn) {
            scheduleColumn.style.display = 'block'; 
            scheduleColumn.style.textAlign = 'left';
            scheduleColumn.style.alignItems = 'normal';
        }
        if(scheduleContainer) {
            scheduleContainer.style.width = '100%';
            scheduleContainer.style.maxWidth = 'none';
        }
        // -----------------------------------------------------------

        enterSystem(); // 最后再加载数据

    } else if (inputHash === STUDENT_HASH) {
        currentUser = { role: 'student' };
        const quickEditBtn = document.getElementById('quickEditBtn');
        if (quickEditBtn) quickEditBtn.style.display = 'none'; // 学生隐藏按钮
        
        // --- 【修改点 2】先把界面改成学生的样子 ---
        if(settingsPanel) settingsPanel.style.display = 'none'; 
        if(layoutGrid) layoutGrid.style.gridTemplateColumns = '1fr';
        
        if(scheduleColumn) {
            scheduleColumn.style.display = 'flex';
            scheduleColumn.style.flexDirection = 'column';
            scheduleColumn.style.alignItems = 'center';
            scheduleColumn.style.width = '100%';
        }
        if(scheduleContainer) {
            scheduleContainer.style.width = '100%';
            scheduleContainer.style.maxWidth = '1000px'; 
        }
        // -----------------------------------------------------------
        
        enterSystem(); // 最后再加载数据
        
    } else {
        errorDiv.textContent = 'Invalid password. Please try again.';
        errorDiv.style.display = 'block';
        const loginBox = document.querySelector('.login-form');
        if (loginBox) {
            loginBox.style.transform = 'translateX(5px)';
            setTimeout(() => loginBox.style.transform = 'translateX(-5px)', 100);
            setTimeout(() => loginBox.style.transform = 'translateX(0)', 200);
        }
    }
}

// 辅助函数：处理通用的登录后续操作
function enterSystem() {
    document.getElementById('loginPage').style.display = 'none';
    
    // 获取 mainContent
    const mainContent = document.getElementById('mainContent');
    
    // 【关键修复】确保移除 logout 时添加的 display: none
    mainContent.style.display = ''; 
    
    // 添加 active 类来显示内容
    mainContent.classList.add('active');
    
    const adminSettings = document.getElementById('adminSettings');
    adminSettings.style.display = 'flex';
    adminSettings.style.flexDirection = 'column';
    adminSettings.style.alignItems = 'stretch'

    updateScheduleDisplay();
    // 确保年份显示的是今年
    studentCalendarYear = CURRENT_YEAR; 
    document.getElementById('studentYearDisplay').textContent = studentCalendarYear;
    
    renderStudentYearCalendar(); 
    
    // 【新增】初始化按钮状态
    updateYearNavButtons();
   
    // 如果是学生，不需要加载 AdminStats 或 AvailabilityDays，防止报错或多余渲染
    if (currentUser.role === 'admin') {
        renderAvailabilityDays();
        loadAdminSettings();
    }
}

function openAvailabilitySettings() {
    // 隐藏管理员面板
    document.getElementById('adminSettings').style.display = 'none';
    
    // 【新增】隐藏上半部分的内容（日历和统计），让界面更清爽
    document.getElementById('mainContent').style.display = 'none'; 
    
    // 显示可用性设置面板
    document.getElementById('availabilitySettings').style.display = 'flex';
    renderDailyAvailability();
}

function closeAvailabilitySettings() {
    // 隐藏可用性设置面板
    document.getElementById('availabilitySettings').style.display = 'none';
    
    // 【新增】恢复显示上半部分的内容
    document.getElementById('mainContent').style.display = 'block'; // 或者 '' 清空也行
    
    // 恢复显示管理员面板
    const adminSettings = document.getElementById('adminSettings');
    adminSettings.style.display = 'flex';
    adminSettings.style.flexDirection = 'column';
    adminSettings.style.alignItems = 'stretch';
}

function renderDailyAvailability() {
    const container = document.getElementById('dailyAvailabilityContainer');
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    let html = '';
    dayNames.forEach((day, index) => {
        const avail = dayHourAvailability[index];
        html += `
                    <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #ddd;">
                        <h4 style="margin-top: 0; color: #333;">${day}</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div class="form-group">
                                <label style="font-size: 0.9em;">Start Hour:</label>
                                <input type="number" min="0" max="23" value="${avail.start}" id="day${index}Start" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            </div>
                            <div class="form-group">
                                <label style="font-size: 0.9em;">End Hour:</label>
                                <input type="number" min="0" max="23" value="${avail.end}" id="day${index}End" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            </div>
                        </div>
                    </div>
                `;
    });
    container.innerHTML = html;
}

function saveAvailabilitySettings() {
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    dayNames.forEach((day, index) => {
        const start = parseInt(document.getElementById(`day${index}Start`).value);
        const end = parseInt(document.getElementById(`day${index}End`).value);
        if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 23 || start >= end) {
            showMessage('Please enter valid hours (0-23 and start < end)', 'availabilityMessage', 'error');
            return;
        }
        dayHourAvailability[index] = {
            start,
            end
        };
    });
    localStorage.setItem('guoLabDayAvailability', JSON.stringify(dayHourAvailability));
    saveToFirebase();
    updateScheduleDisplay();
    showMessage('✓ Availability saved successfully!', 'availabilityMessage', 'success');
    setTimeout(() => closeAvailabilitySettings(), 1500);
}

function updateScheduleDisplay() {
    const days = DAYS; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const container = document.getElementById('scheduleContainer');
    
    // 1. 计算所有需要显示的时间段 (取并集，或者直接按营业时间生成)
    // 为了防止时间错乱，我们直接生成从最早开始时间到最晚结束时间的完整列表
    let allTimeSlots = new Set();
    
    // 遍历所有天的设置，找出时间范围
    Object.values(dayHourAvailability).forEach(avail => {
        for (let hour = avail.start; hour < avail.end; hour++) {
            // 补全分钟
            for (let min = 0; min < 60; min += SLOT_DURATION) {
                const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                allTimeSlots.add(timeStr);
            }
        }
    });
    
    // 排序时间
    const timeSlots = Array.from(allTimeSlots).sort();
    const now = new Date();

    // 2. 开始生成 Grid HTML
    let html = '<div class="schedule-grid">';
    
    // --- 表头 (Header Row) ---
    // 第一格：空的或者写 Time
    html += '<div class="schedule-cell day-header">Time</div>';
    
    // 后续 5 格：星期几
    days.forEach((day, dayIndex) => {
        const date = new Date(WEEK_START_DATE);
        date.setDate(date.getDate() + dayIndex);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        // 在表头显示日期
        html += `<div class="schedule-cell day-header">${day}<br><small style="font-weight:normal; opacity:0.8">${dateStr}</small></div>`;
    });

    // --- 内容行 (Content Rows) ---
    // 外层循环：时间 (每一行)
    timeSlots.forEach(time => {
        
        // [关键修正] 每一行的第 1 列：时间标签
        html += `<div class="schedule-cell time-cell">${time}</div>`;
        
        // [关键修正] 每一行的后 5 列：具体的格子
        // 必须严格遍历 0 到 4 (周一到周五)，绝对不能跳过
        for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
            
            // 1. 计算当前格子的状态
            const dayAvail = dayHourAvailability[dayIndex] || { start: 0, end: 0 };
            const [h, m] = time.split(':').map(Number);
            
            // 构造完整的日期时间对象用于比对
            const date = new Date(WEEK_START_DATE);
            date.setDate(date.getDate() + dayIndex);
            const slotDateTime = new Date(date);
            slotDateTime.setHours(h, m, 0, 0);

            const isPast = slotDateTime < now;
            const slotKey = getDateKey(dayIndex, time); // 假设 getDateKey 函数存在且逻辑正确
            const booking = bookings[slotKey];
            const isOpened = openedSlots[slotKey]; // 【新增】检查是否被老师手动开放
            const isBlocked = !isOpened;           // 【修改】默认是 true (锁住)，只有在 openedSlots 里的才是 false
            const isFullDayBlocked = fullDayBlocks[dayIndex];
            
            // 判断是否在营业时间内
            const isTimeAvailable = (h >= dayAvail.start && h < dayAvail.end);
            
            // 2. 决定样式和内容
            let cellClass = 'slot-cell';
            let content = '';
            let clickAction = '';

            // A. 已预订 (Booked) - 优先级最高，保留预约记录
            if (booking && booking.name) {
                cellClass += ' booked';
                if (isPast) cellClass += ' past';
                content = `<div class="slot-name">${booking.name}</div>`;
                clickAction = `onclick="openBookingModal('${slotKey}', '${days[dayIndex]}', '${time}')"`;
            
            // B. 过期且未预订 (Expired) - 优先级排第二！只要时间过了，一律显示 EXPIRED
            } else if (isPast) {
                cellClass += ' past';
                content = `<span class="status-label expired">EXPIRED</span>`;
                
                // (可选) 如果你想让管理员即使在过期后也能点击查看/操作，可以取消下面这行的注释
                // if (currentUser && currentUser.role === 'admin') clickAction = `onclick="openBookingModal('${slotKey}', '${days[dayIndex]}', '${time}')"`;

            // C. 未开放/不可用 (Unavailable)
            } else if (!isTimeAvailable || isFullDayBlocked || !isOpened) {
                cellClass += ' blocked';
                content = `<span class="status-label unavailable">UNAVAILABLE</span>`; 
                
                // 只有管理员可以点击
                if (currentUser && currentUser.role === 'admin') {
                     // 【修改】判断是否开启了快速编辑
                     if (isQuickEditMode) {
                         clickAction = `onclick="quickToggleSlot('${slotKey}')"`;
                     } else {
                         clickAction = `onclick="openBookingModal('${slotKey}', '${days[dayIndex]}', '${time}')"`;
                     }
                }

            // D. 空闲可约 (Available)
            } else {
                content = `<span style="color:#667eea; font-weight:bold; font-size:1.5em;">+</span>`; 
                
                if (currentUser && currentUser.role === 'admin' && isQuickEditMode) {
                     // 【修改】如果是快速模式，管理员点击已开放的格子，直接关闭；学生点击依然是预约弹窗
                     clickAction = `onclick="quickToggleSlot('${slotKey}')"`;
                } else {
                     clickAction = `onclick="openBookingModal('${slotKey}', '${days[dayIndex]}', '${time}')"`;
                }
            }

            // 3. 生成格子 HTML
            html += `<div class="${cellClass}" ${clickAction}>${content}</div>`;
        }
    });
    
    html += '</div>'; // 关闭 schedule-grid
    container.innerHTML = html;
}

function openBookingModal(slotKey, day, time) {
    selectedSlot = {
        key: slotKey,
        day,
        time
    };
    const booking = bookings[slotKey];
    const isOpened = openedSlots[slotKey]; 
    const isBlocked = !isOpened; // 【修改】检查是否被锁（现在默认被锁）

    // 1. 设置标题
    document.getElementById('slotTitle').textContent = `${day} at ${time}`;
    document.getElementById('currentBooking').innerHTML = `<strong>${day}</strong><br><strong>${time}</strong>`;

    // 2. 获取按钮元素
    const btnConfirm = document.getElementById('btnConfirmBooking');
    const btnBlock = document.getElementById('btnBlockSlot');
    const deleteSection = document.getElementById('deleteSection');
    const inputName = document.getElementById('studentName');
    const inputEmail = document.getElementById('studentEmail');

    // 3. 填充输入框 (如果有预约)
    inputName.value = booking ? booking.name : '';
    inputEmail.value = booking ? booking.email || '' : '';

    // --- 权限与界面逻辑 ---

    if (currentUser.role === 'admin') {
        // === 管理员视图 ===
        
        // 显示 Block 按钮
        btnBlock.style.display = 'inline-block';
        
        if (isBlocked) {
            // 如果已经被锁了 -> 显示 "Unblock" (设为可用)
            btnBlock.textContent = "✅ Set Available";
            btnBlock.style.background = "#4CAF50"; // 绿色
            
            // 锁住的时候，不能预约，隐藏输入框和确认按钮
            btnConfirm.style.display = 'none';
            inputName.disabled = true;
            inputEmail.disabled = true;
            document.getElementById('slotTitle').textContent += " (Unavailable)";
        } else {
            // 如果是正常的空闲格子 -> 显示 "Set Unavailable" (设为不可用)
            btnBlock.textContent = "🚫 Set Unavailable";
            btnBlock.style.background = "#607D8B"; // 灰色
            
            // 允许管理员帮学生预约
            btnConfirm.style.display = 'inline-block'; 
            inputName.disabled = false;
            inputEmail.disabled = false;
        }

        // 如果有预约，显示删除按钮
        deleteSection.style.display = (booking && booking.name) ? 'block' : 'none';

    } else {
        // === 学生视图 ===
        // 学生永远看不到 Block 按钮
        btnBlock.style.display = 'none';
        
        // 正常的预约逻辑
        btnConfirm.style.display = 'inline-block';
        inputName.disabled = false;
        inputEmail.disabled = false;
        
        // 学生只能看到自己的预约删除按钮 (或者按照你之前的逻辑，有名字就显示删除)
        deleteSection.style.display = (booking && booking.name) ? 'block' : 'none';
    }

    document.getElementById('bookingModal').classList.add('active');
}

function closeModal() {
    document.getElementById('bookingModal').classList.remove('active');
    selectedSlot = null;
}

function confirmBooking() {
    const name = document.getElementById('studentName').value.trim();
    const email = document.getElementById('studentEmail').value.trim();
    if (!name) {
        showMessage('Please enter your name', 'scheduleMessage', 'error');
        return;
    }
    bookings[selectedSlot.key] = {
        name,
        email,
        bookedAt: new Date().toISOString()
    };
    saveToFirebase();
    updateScheduleDisplay();
    showMessage(`✓ Successfully booked ${selectedSlot.day} at ${selectedSlot.time}!`, 'scheduleMessage', 'success');
    closeModal();
}

function deleteBooking() {
    if (confirm(`Remove booking for ${selectedSlot.day} at ${selectedSlot.time}?`)) {
        
        const slotKey = selectedSlot.key;

        // 1. 修改本地数据：直接从 bookings 对象中删除这个 key
        delete bookings[slotKey]; 

        // 2. 保存到 Supabase
        saveToFirebase();

        // 3. 刷新界面
        updateScheduleDisplay();
        
        // 如果是管理员，刷新统计列表
        if (currentUser && currentUser.role === 'admin') {
            loadAdminStats();
        }

        showMessage(`✓ Booking cancelled!`, 'scheduleMessage', 'success');
        closeModal();
    }
}

function toggleSlotBlock() {
    // 安全检查
    if (!selectedSlot || !currentUser || currentUser.role !== 'admin') return;

    const slotKey = selectedSlot.key;
    const isOpened = openedSlots[slotKey];

    // 1. 修改本地数据
    if (isOpened) {
        // 如果原本是开着的 (Available)，现在设为不可用 -> 从 openedSlots 删除
        delete openedSlots[slotKey];
        showMessage('🚫 Slot set to unavailable.', 'scheduleMessage', 'success');
    } else {
        // 如果原本是锁着的 (Unavailable)，现在设为可用 -> 加进 openedSlots
        openedSlots[slotKey] = true;
        showMessage('✓ Slot is now available!', 'scheduleMessage', 'success');
    }

    // 2. 保存到 Supabase 
    saveToFirebase(); 

    // 3. 刷新界面
    updateScheduleDisplay();
    closeModal();
}

function showMessage(text, elementId, type) {
    const message = document.getElementById(elementId);
    message.textContent = text;
    message.classList.remove('success', 'error');
    message.classList.add(type);
    setTimeout(() => {
        message.classList.remove(type);
    }, 4000);
}

async function saveToFirebase() { // 函数名没改，为了兼容你其他代码
    console.log("正在保存到 Supabase...");
    const dataPackage = {
        bookings: bookings || {},
        openedSlots: openedSlots || {}, // 【修改】上传 openedSlots
        fullDayBlocks: fullDayBlocks || {},
        availableDays: availableDays,
        dayHourAvailability: dayHourAvailability,
        lastUpdated: new Date().toISOString()
    };

    // 更新 id=1 的那一行，把所有数据存进 app_data 列
    const { error } = await supabaseClient
        .from('lab-schedule')
        .upsert({ id: 1, app_data: dataPackage });

    if (error) {
        console.error("保存失败: ", error);
        alert("同步数据失败，请检查网络");
    } else {
        console.log("保存成功！");
    }
}

function listenToFirebase() { // 函数名保持不变
    console.log("开始连接 Supabase...");
    
    // 1. 定义获取最新数据的函数
    const fetchLatest = async () => {
        const { data, error } = await supabaseClient
            .from('lab-schedule')
            .select('app_data')
            .eq('id', 1)
            .single();

        if (data && data.app_data) {
            console.log("收到云端更新:", data.app_data);
            const remote = data.app_data;
            
            // 更新本地变量
            bookings = remote.bookings || {};
            openedSlots = remote.openedSlots || {};
            fullDayBlocks = remote.fullDayBlocks || {};
            if(remote.availableDays) availableDays = remote.availableDays;
            if(remote.dayHourAvailability) dayHourAvailability = remote.dayHourAvailability;

            // 刷新界面
            updateScheduleDisplay();
            if (currentUser && currentUser.role === 'admin') {
                loadAdminStats();
            }
        }
    };

    // 2. 首次加载数据
    fetchLatest();

    // 3. 开启实时监听 (Realtime)
    supabaseClient
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE', // 监听更新事件
                schema: 'public',
                table: 'lab-schedule',
                filter: 'id=eq.1' // 只监听 id=1 这一行
            },
            (payload) => {
                console.log('检测到实时变更，正在刷新...');
                // 当检测到变化时，重新拉取最新数据
                fetchLatest();
            }
        )
        .subscribe();
}

function setWeekDateInputs() {
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // 安全检查：只有元素存在时才赋值
    const monEl = document.getElementById('mondayDate');
    const friEl = document.getElementById('fridayDate');
    
    if (monEl) monEl.value = formatDate(WEEK_START_DATE);
    if (friEl) friEl.value = formatDate(WEEK_END_DATE);
}

function updateWeekDates() {
    const mondayStr = document.getElementById('mondayDate').value;
    const fridayStr = document.getElementById('fridayDate').value;
    if (!mondayStr || !fridayStr) {
        showMessage('❌ Please select both Monday and Friday dates', 'timeMessage', 'error');
        return;
    }
    WEEK_START_DATE = new Date(mondayStr);
    WEEK_END_DATE = new Date(fridayStr);
    const timeDiff = WEEK_END_DATE.getTime() - WEEK_START_DATE.getTime();
    const daysDiff = timeDiff / (1000 * 3600 * 24);
    if (daysDiff !== 4) {
        showMessage('❌ Friday must be 4 days after Monday', 'timeMessage', 'error');
        return;
    }
    saveWeekDates();
    updateWeekDateDisplay();
    showMessage('✓ Week dates updated successfully!', 'timeMessage', 'success');
}

function saveWeekDates() {
    localStorage.setItem('guoLabWeekDates', JSON.stringify({
        start: WEEK_START_DATE.toISOString(),
        end: WEEK_END_DATE.toISOString()
    }));
}

function updateWeekDateDisplay() {
    const options = {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    };
    const startStr = WEEK_START_DATE.toLocaleDateString('en-US', options);
    const endStr = WEEK_END_DATE.toLocaleDateString('en-US', options);
    document.getElementById('weekDateRange').textContent = `Week of ${startStr} - ${endStr}`;
}

function renderBlockSchedule() {
    const timeSlots = generateTimeSlots();
    const days = DAYS;
    let html = '<div class="schedule-grid" style="font-size: 0.8em;">';
    html += '<div class="schedule-cell day-header">Time</div>';
    days.forEach(day => {
        html += `<div class="schedule-cell day-header">${day}</div>`;
    });
    timeSlots.forEach(time => {
        html += `<div class="schedule-cell time-cell" style="padding: 8px;">${time}</div>`;
        days.forEach((day, dayIndex) => {
            const slotKey = getDateKey(dayIndex, time);
            const isBlocked = blockedSlots[slotKey];
            const classList = isBlocked ? 'slot-cell blocked' : 'slot-cell';
            const label = isBlocked ? '🚫' : '✓';
            html += `
                        <div class="${classList}" onclick="toggleBlockSlot('${slotKey}')" style="cursor: pointer; padding: 10px;">
                            ${label}
                        </div>
                    `;
        });
    });
    html += '</div>';
    document.getElementById('blockScheduleContainer').innerHTML = html;
}

function toggleBlockSlot(slotKey) {
    if (blockedSlots[slotKey]) {
        delete blockedSlots[slotKey];
    } else {
        blockedSlots[slotKey] = true;
    }
    saveToFirebase();
    renderBlockSchedule();
}

// 【新增】切换快速编辑模式
function toggleQuickEdit() {
    isQuickEditMode = !isQuickEditMode;
    const btn = document.getElementById('quickEditBtn');
    if (isQuickEditMode) {
        btn.innerHTML = '⚡ 退出快速编辑';
        btn.style.background = '#ff9800'; // 变成橙色提醒状态
        showMessage('⚡ 快速编辑已开启：直接点击格子即可切换开放状态', 'scheduleMessage', 'success');
    } else {
        btn.innerHTML = '⚡ 快速编辑 (Off)';
        btn.style.background = '#667eea'; // 恢复原色
    }
    updateScheduleDisplay();
}

function quickToggleSlot(slotKey) {
    if (openedSlots[slotKey]) {
        delete openedSlots[slotKey]; // 关掉
    } else {
        openedSlots[slotKey] = true; // 打开
    }
    saveToFirebase();
    updateScheduleDisplay();
}

function clearBlockedSlots() {
    if (confirm('Unblock all sessions?')) {
        blockedSlots = {};
        saveToFirebase();
        renderBlockSchedule();
        showMessage('✓ All sessions unblocked!', 'timeMessage', 'success');
    }
}

function renderMeetingTimeSelector() {
    // 如果容器不存在，直接结束函数，不执行后续逻辑
    const container = document.getElementById('meetingTimeSelector');
    if (!container) return;

    const timeSlots = generateTimeSlots();
    let html = '';
    timeSlots.forEach(time => {
        const isSelected = MEETING_TIME === time;
        const classList = isSelected ? 'time-btn selected' : 'time-btn';
        html += `<button class="${classList}" onclick="selectMeetingTime('${time}')">${time}</button>`;
    });
    container.innerHTML = html;
}

function selectMeetingTime(time) {
    MEETING_TIME = MEETING_TIME === time ? null : time;
    saveToFirebase();
    renderMeetingTimeSelector();
    if (MEETING_TIME) {
        showMessage(`✓ Meeting time set to ${MEETING_TIME}`, 'timeMessage', 'success');
    } else {
        showMessage('Meeting time cleared', 'timeMessage', 'success');
    }
}

function previousYear() {
    CALENDAR_YEAR--;
    document.getElementById('yearDisplay').textContent = CALENDAR_YEAR;
    renderYearCalendar();
}

function nextYear() {
    CALENDAR_YEAR++;
    document.getElementById('yearDisplay').textContent = CALENDAR_YEAR;
    renderYearCalendar();
}

function renderYearCalendar() {
    const container = document.getElementById('yearCalendarContainer');
    if (!container) return; // 找不到元素就直接退出，防止报错
    let html = '';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (let month = 0; month < 12; month++) {
        const firstDay = new Date(studentCalendarYear, month, 1);
        const lastDay = new Date(studentCalendarYear, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        html += `<div class="month-card">`;
        html += `<div class="month-title">${monthNames[month]} ${CALENDAR_YEAR}</div>`;
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        html += `<div class="week-row">`;
        dayNames.forEach(name => {
            html += `<div style="text-align: center; font-weight: bold; font-size: 0.7em; margin-bottom: 4px;">${name}</div>`;
        });
        html += `</div>`;
        let currentDate = new Date(startDate);
        let weekCount = 0;
        while (weekCount < 6) {
            let weekRow = '<div class="week-row">';
            let monthHasContent = false;
            for (let day = 0; day < 7; day++) {
                const isCurrentMonth = currentDate.getMonth() === month;
                const isToday = currentDate.toDateString() === new Date().toDateString();
                const isFriday = currentDate.getDay() === 5 && isCurrentMonth;
                let classList = 'day-box';
                if (!isCurrentMonth) classList += ' other-month';
                if (isToday) classList += ' today';
                const isSelectedWeek = isFriday && 
                       currentDate.getDate() === WEEK_END_DATE.getDate() && 
                       currentDate.getMonth() === WEEK_END_DATE.getMonth() && 
                       currentDate.getFullYear() === WEEK_END_DATE.getFullYear();

                if (isSelectedWeek) {
                    classList += ' selected';
                }
                if (isCurrentMonth) monthHasContent = true;
                weekRow += `<div class="${classList}" onclick="selectWeekFromCalendar(${currentDate.getFullYear()}, ${currentDate.getMonth()}, ${currentDate.getDate()})">${currentDate.getDate()}</div>`;
                currentDate.setDate(currentDate.getDate() + 1);
            }
            weekRow += '</div>';
            html += weekRow;
            if (!monthHasContent && weekCount > 0) break;
            weekCount++;
        }
        html += '</div>';
    }
    document.getElementById('yearCalendarContainer').innerHTML = html;
}

function selectWeekFromCalendar(year, month, date) {
    const selectedDate = new Date(year, month, date);
    const dayOfWeek = selectedDate.getDay();
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    WEEK_START_DATE = monday;
    WEEK_END_DATE = friday;
    saveWeekDates();
    updateWeekDateDisplay();
    setWeekDateInputs();
    renderYearCalendar();
    showMessage(`✓ Week selected: ${monday.toLocaleDateString()} - ${friday.toLocaleDateString()}`, 'timeMessage', 'success');
}

function studentPreviousYear() {
    if (studentCalendarYear > CURRENT_YEAR) {
        studentCalendarYear--;
        document.getElementById('studentYearDisplay').textContent = studentCalendarYear;
        renderStudentYearCalendar();
        updateYearNavButtons(); // 更新按钮状态（变灰/变亮）
    }
}

function studentNextYear() {
    // 只有当前查看的年份小于 (真实年份 + 1) 时，才允许前进
    if (studentCalendarYear < CURRENT_YEAR + MAX_LOOKAHEAD_YEARS) {
        studentCalendarYear++;
        document.getElementById('studentYearDisplay').textContent = studentCalendarYear;
        renderStudentYearCalendar();
        updateYearNavButtons(); // 更新按钮状态
    }
}

// --- 新增这个辅助函数来控制按钮样式 ---
function updateYearNavButtons() {
    const prevBtn = document.querySelector('button[onclick="studentPreviousYear()"]');
    const nextBtn = document.querySelector('button[onclick="studentNextYear()"]');
    
    // 如果已经是今年（或更早），禁用“上一年”按钮
    if (studentCalendarYear <= CURRENT_YEAR) {
        prevBtn.disabled = true;
        prevBtn.style.opacity = "0.3";
        prevBtn.style.cursor = "not-allowed";
    } else {
        prevBtn.disabled = false;
        prevBtn.style.opacity = "1";
        prevBtn.style.cursor = "pointer";
    }

    // 如果达到了最大限制年份，禁用“下一年”按钮
    if (studentCalendarYear >= CURRENT_YEAR + MAX_LOOKAHEAD_YEARS) {
        nextBtn.disabled = true;
        nextBtn.style.opacity = "0.3";
        nextBtn.style.cursor = "not-allowed";
    } else {
        nextBtn.disabled = false;
        nextBtn.style.opacity = "1";
        nextBtn.style.cursor = "pointer";
    }
}

function renderStudentYearCalendar() {
    let html = '';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (let month = 0; month < 12; month++) {
        const firstDay = new Date(studentCalendarYear, month, 1);
        const lastDay = new Date(studentCalendarYear, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        html += `<div class="month-card">`;
        html += `<div class="month-title">${monthNames[month]} ${studentCalendarYear}</div>`;
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        html += `<div class="week-row">`;
        dayNames.forEach(name => {
            html += `<div style="text-align: center; font-weight: bold; font-size: 0.7em; margin-bottom: 4px;">${name}</div>`;
        });
        html += `</div>`;
        let currentDate = new Date(startDate);
        let weekCount = 0;
        while (weekCount < 6) {
            let weekRow = '<div class="week-row">';
            let monthHasContent = false;
            for (let day = 0; day < 7; day++) {
                const isCurrentMonth = currentDate.getMonth() === month;
                const isToday = currentDate.toDateString() === new Date().toDateString();
                const isFriday = currentDate.getDay() === 5 && isCurrentMonth;
                let classList = 'day-box';
                if (!isCurrentMonth) classList += ' other-month';
                if (isToday) classList += ' today';
                const isSelectedWeek = isFriday && 
                       currentDate.getDate() === WEEK_END_DATE.getDate() && 
                       currentDate.getMonth() === WEEK_END_DATE.getMonth() && 
                       currentDate.getFullYear() === WEEK_END_DATE.getFullYear();

                if (isSelectedWeek) {
                    classList += ' selected';
                }
                if (isCurrentMonth) monthHasContent = true;
                weekRow += `<div class="${classList}" onclick="studentSelectWeek(${currentDate.getFullYear()}, ${currentDate.getMonth()}, ${currentDate.getDate()})">${currentDate.getDate()}</div>`;
                currentDate.setDate(currentDate.getDate() + 1);
            }
            weekRow += '</div>';
            html += weekRow;
            if (!monthHasContent && weekCount > 0) break;
            weekCount++;
        }
        html += '</div>';
    }
    document.getElementById('studentYearCalendarContainer').innerHTML = html;
}

function studentSelectWeek(year, month, date) {
    const selectedDate = new Date(year, month, date);
    const dayOfWeek = selectedDate.getDay();
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    WEEK_START_DATE = monday;
    WEEK_END_DATE = friday;
    saveWeekDates();
    updateWeekDateDisplay();
    updateScheduleDisplay();
    showMessage(`✓ Week selected: ${monday.toLocaleDateString()} - ${friday.toLocaleDateString()}`, 'scheduleMessage', 'success');
    // Scroll to schedule
    document.getElementById('scheduleContainer').scrollIntoView({
        behavior: 'smooth'
    });
}

function renderBlockFullDayUI() {
    const days = DAYS;
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px;">';
    days.forEach((day, dayIndex) => {
        const date = new Date(WEEK_START_DATE);
        date.setDate(date.getDate() + dayIndex);
        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        const isBlocked = fullDayBlocks[dayIndex];
        const btnClass = isBlocked ? 'login-btn' : 'admin-btn';
        const btnText = isBlocked ? `🚫 ${day} (${dateStr})` : `✓ ${day} (${dateStr})`;
        html += `<button class="${btnClass}" onclick="toggleFullDayBlock(${dayIndex})" style="font-size: 0.85em; padding: 10px;">${btnText}</button>`;
    });
    html += '</div>';
    document.getElementById('blockFullDayContainer').innerHTML = html;
}

function toggleFullDayBlock(dayIndex) {
    if (fullDayBlocks[dayIndex]) {
        delete fullDayBlocks[dayIndex];
    } else {
        fullDayBlocks[dayIndex] = true;
    }
    saveToFirebase();
    renderBlockFullDayUI();
    updateScheduleDisplay();
}

function clearFullDayBlocks() {
    if (confirm('Unblock all full days?')) {
        fullDayBlocks = {};
        saveToFirebase();
        renderBlockFullDayUI();
        updateScheduleDisplay();
        showMessage('✓ All full day blocks cleared!', 'scheduleMessage', 'success');
    }
}
document.addEventListener('click', (e) => {
    const modal = document.getElementById('bookingModal');
    if (e.target === modal) {
        closeModal();
    }
});
window.addEventListener('DOMContentLoaded', initializeApp);
// --- Firebase 配置与初始化 ---
const firebaseConfig = {
  apiKey: "AIzaSyAoCotzk7b6ZY2RgL4jf9t-q8453EXs3kg",
  authDomain: "guolab-scheduler.firebaseapp.com",
  projectId: "guolab-scheduler",
  storageBucket: "guolab-scheduler.firebasestorage.app",
  messagingSenderId: "256665748304",
  appId: "1:256665748304:web:1ad6d84387196f64c26255"
};

// 初始化 Firebase (使用兼容版语法)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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
let fullDayBlocks = {};
let selectedSlot = null;
let editingSlot = null;

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

// 找到 meeting_script.js 中的 loadAdminStats 函数，替换为：

function loadAdminStats() {
    // 1. 计算有效的预约数量
    // 过滤掉空值或没有名字的预约
    const validBookings = Object.entries(bookings).filter(([_, booking]) => booking && booking.name);
    const bookedSlots = validBookings.length;

    // 2. 生成 HTML
    let html = `
        <div style="display: flex; gap: 20px; margin-bottom: 20px;">
            <div class="stat-box" style="flex: 0 0 200px; text-align: center; border-left: 5px solid #667eea;">
                <div class="stat-number" style="font-size: 2.5em; font-weight: bold; color: #667eea;">${bookedSlots}</div>
                <div class="stat-label" style="color: #666;">Booked Sessions</div>
            </div>
        </div>
        
        <h4 style="color: #667eea; margin-top: 20px; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
            📋 Detailed List
        </h4>
    `;

    // 3. 判断显示列表还是空状态
    if (bookedSlots === 0) {
        html += '<p style="color: #999; font-style: italic;">No bookings yet.</p>';
    } else {
        // 先排序
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
            const timePart = key.substring(lastDashIndex + 1); // 变量名是 timePart
            
            // 为了获取星期几，我们创建一个日期对象
            // 注意：为了避免时区问题导致日期偏差，建议加上 T12:00:00
            const safeDate = new Date(datePart + 'T12:00:00'); 
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = dayNames[safeDate.getDay()]; // 变量名是 dayName

            html += `<tr style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 12px; color: #666;">${dayName}</td>
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
    const days = DAYS;
    let allTimeSlots = new Set();
    
    // 1. 收集所有可用时间槽
    days.forEach((day, dayIndex) => {
        const dayAvail = dayHourAvailability[dayIndex];
        for (let hour = dayAvail.start; hour < dayAvail.end; hour++) {
            for (let min = 0; min < 60; min += SLOT_DURATION) {
                const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                allTimeSlots.add(timeStr);
            }
        }
    });

    const timeSlots = Array.from(allTimeSlots).sort();
    
    // 2. 获取当前系统时间，用于对比
    const now = new Date();

    let html = '<div class="schedule-grid">';
    
    // 渲染表头 (日期)
    html += '<div class="schedule-cell day-header">Time</div>';
    days.forEach((day, dayIndex) => {
        const date = new Date(WEEK_START_DATE);
        date.setDate(date.getDate() + dayIndex);
        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        html += `<div class="schedule-cell day-header">${day}<br><small>${dateStr}</small></div>`;
    });

    // 3. 渲染每一行时间
    timeSlots.forEach(time => {
        html += `<div class="schedule-cell time-cell">${time}</div>`;
        
        days.forEach((day, dayIndex) => {
            // --- 计算当前格子的具体日期和时间 ---
            const date = new Date(WEEK_START_DATE);
            date.setDate(date.getDate() + dayIndex);
            
            // 解析 grid 的时间 (例如 "09:30")
            const [h, m] = time.split(':').map(Number);
            
            // 创建该格子的完整 Date 对象
            const slotDateTime = new Date(date);
            slotDateTime.setHours(h, m, 0, 0);

            // --- 判断是否是过去的时间 ---
            const isPast = slotDateTime < now;

            const slotKey = getDateKey(dayIndex, time);
            const booking = bookings[slotKey];
            const isBlocked = blockedSlots[slotKey];
            const isFullDayBlocked = fullDayBlocks[dayIndex];
            
            // 检查 availability 设置
            const dayAvail = dayHourAvailability[dayIndex];
            const isTimeAvailable = (h >= dayAvail.start && h < dayAvail.end);
            
            let content = '';
            let classList = 'slot-cell';
            
            // --- 逻辑判断顺序 ---
            
            // 情况1: 不在营业时间 或 全天屏蔽 或 单独屏蔽
            const isUnavailable = !isTimeAvailable || isFullDayBlocked || isBlocked;

            if (isUnavailable) {
                classList += ' blocked';
                content = `<div class="slot-blocked-label">UNAVAILABLE</div>`;
            
            // 情况2: 已经被预约了 (即便是过去的时间，如果被约了也要显示名字)
            } else if (booking && booking.name) {
                classList += ' booked';
                // 如果是过去的时间，稍微变灰一点，但保留名字
                if (isPast) classList += ' past'; 
                content = `<div class="slot-name">${booking.name}</div>`;

            // 情况3: 【新增】如果是过去的时间，且没被约，显示过期
            } else if (isPast) {
                classList += ' past';
                content = `<div style="color: #ccc;">Expired</div>`; 

            // 情况4: 正常可预约
            } else {
                content = `<div style="color: #999;">Click to book</div>`;
            }

            // 只有不是 (blocked 或 past) 才能点击。
            // 注意：如果是 booked 且是 past，我们也不让点（防止修改过去的数据），或者你可以允许管理员点。
            // 下面的逻辑是：只有正常状态下才能点开。
            
            // 如果已经被约了，即使过期了，通常也允许点开查看详情/删除。
            // 如果纯粹是过去的时间且没约，就不能点。
            
            let canClick = true;
            if (isUnavailable) canClick = false;
            if (isPast && !booking) canClick = false; // 过去且没被约，不能点

            if (canClick) {
                html += `
                    <div class="${classList}" onclick="openBookingModal('${slotKey}', '${day}', '${time}')">
                        ${content}
                    </div>
                `;
            } else {
                html += `
                    <div class="${classList}">
                        ${content}
                    </div>
                `;
            }
        });
    });
    
    html += '</div>';
    document.getElementById('scheduleContainer').innerHTML = html;
}

function openBookingModal(slotKey, day, time) {
    selectedSlot = {
        key: slotKey,
        day,
        time
    };
    const booking = bookings[slotKey];
    document.getElementById('slotTitle').textContent = `${day} at ${time}`;
    document.getElementById('studentName').value = booking ? booking.name : '';
    document.getElementById('studentEmail').value = booking ? booking.email || '' : '';
    document.getElementById('currentBooking').innerHTML = `<strong>${day}</strong><br><strong>${time}</strong>`;
    const deleteSection = document.getElementById('deleteSection');
    if (booking && booking.name) {
        deleteSection.style.display = 'block';
    } else {
        deleteSection.style.display = 'none';
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
        
        // 1. 获取要删除的那个 key
        const slotKey = selectedSlot.key;

        // 2. 直接告诉数据库：只删除这一个字段，不要动别的！
        // 使用 update 而不是 set，使用 FieldValue.delete()
        const updateData = {};
        updateData[`bookings.${slotKey}`] = firebase.firestore.FieldValue.delete();

        db.collection('lab_data').doc('schedule').update(updateData)
            .then(() => {
                // 数据库删除成功后，手动更新一下本地显示（虽然 onSnapshot 也会做，但这样更顺滑）
                delete bookings[slotKey]; 
                updateScheduleDisplay();
                
                // 如果是管理员，顺便刷新一下统计列表
                if (currentUser && currentUser.role === 'admin') {
                    loadAdminStats();
                }

                showMessage(`✓ Booking cancelled!`, 'scheduleMessage', 'success');
                closeModal();
            })
            .catch((error) => {
                console.error("Delete failed: ", error);
                showMessage('❌ Failed to delete. Please try again.', 'scheduleMessage', 'error');
            });
    }
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

function saveToFirebase() {
    console.log("正在保存到云端...");
    const dataPackage = {
        bookings: bookings || {},
        blockedSlots: blockedSlots || {},
        fullDayBlocks: fullDayBlocks || {},
        // 如果你需要同步 Available Days 设置，把下面两行注释打开
        availableDays: availableDays,
        dayHourAvailability: dayHourAvailability,
        lastUpdated: new Date().toISOString()
    };

    // 写入数据库: lab_data 集合 -> schedule 文档
    db.collection('lab_data').doc('schedule').set(dataPackage, { merge: true })
        .then(() => {
            console.log("保存成功！");
        })
        .catch((error) => {
            console.error("保存失败: ", error);
            alert("同步数据失败，请检查网络");
        });
}

function listenToFirebase() {
    console.log("开始监听云端数据...");
    
    // 监听 lab_data/schedule 文档
    db.collection('lab_data').doc('schedule')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                console.log("收到云端更新:", data);

                // 更新本地变量
                bookings = data.bookings || {};
                blockedSlots = data.blockedSlots || {};
                fullDayBlocks = data.fullDayBlocks || {};
                
                // 如果同步了设置，这里也要接收
                if(data.availableDays) availableDays = data.availableDays;
                if(data.dayHourAvailability) dayHourAvailability = data.dayHourAvailability;

                // 刷新界面
                updateScheduleDisplay();
                
                // 如果管理员面板是打开的，刷新统计
                if (currentUser && currentUser.role === 'admin') {
                    loadAdminStats();
                }
            } else {
                console.log("数据库为空，正在初始化...");
                saveToFirebase(); // 如果是第一次用，保存当前的空状态
            }
        }, (error) => {
             console.error("监听失败:", error);
        });
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
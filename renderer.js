// ===== ОГОРОД — МОБИЛЬНЫЙ РЕНДЕРЕР =====
import { getCropAdvice, generateYearPlan, getBestLunarDays, getBadLunarDays, detectClimate } from './engine.js';
import { CLIMATE_ZONES } from './crops.js';

// ===== СОСТОЯНИЕ =====
let selectedCrop = '';
let selectedDate = 'сегодня';
let history = JSON.parse(localStorage.getItem('ogorod_history') || '[]');

// ===== DOM =====
const cropInput = document.getElementById('crop-input');
const dateInput = document.getElementById('date-input');
const askBtn = document.getElementById('ask-btn');
const answerSection = document.getElementById('answer-section');
const answerContent = document.getElementById('answer-content');
const loading = document.getElementById('loading');
const locationInput = document.getElementById('location');
const historyList = document.getElementById('history-list');
const calendarContent = document.getElementById('calendar-content');
const calendarYearSelect = document.getElementById('calendar-year');
const planBtn = document.getElementById('plan-btn');
const planLocation = document.getElementById('plan-location');
const planLoading = document.getElementById('plan-loading');
const planAnswer = document.getElementById('plan-answer');
const planContent = document.getElementById('plan-content');
const planCopyBtn = document.getElementById('plan-copy-btn');
const weatherWidget = document.getElementById('weather-widget');
const todayDateEl = document.getElementById('today-date');

// ===== ДАТА =====
function updateTodayDate() {
  if (!todayDateEl) return;
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const months = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const now = new Date();
  todayDateEl.textContent = `📅 ${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth() + 1]} ${now.getFullYear()}`;
}
updateTodayDate();
setInterval(updateTodayDate, 60000);

// Сброс при старте
answerSection.classList.add('hidden');
loading.classList.add('hidden');

// ===== НАВИГАЦИЯ =====
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    if (page === 'history') renderHistory();
    if (page === 'calendar') renderCalendar();
    window.scrollTo(0, 0);
  });
});

// ===== ВЫБОР КУЛЬТУРЫ =====
document.querySelectorAll('.crop-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.crop-card').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCrop = btn.dataset.crop;
    cropInput.value = '';
  });
});

cropInput.addEventListener('input', () => {
  document.querySelectorAll('.crop-card').forEach(b => b.classList.remove('selected'));
  selectedCrop = '';
});

// ===== ПОГОДА (прямой fetch, без IPC) =====
const TRANSLIT = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
};
function transliterate(str) {
  return str.toLowerCase().split('').map(ch => TRANSLIT[ch] || ch).join('');
}

function getRegionCoords(location) {
  const loc = location.toLowerCase();
  for (const [key, zone] of Object.entries(CLIMATE_ZONES)) {
    if (loc.includes(key) && zone.lat) return { lat: zone.lat, lon: zone.lon, name: zone.name };
  }
  return null;
}

const weatherCodes = {
  0: { text: 'Ясно', icon: '☀️' },
  1: { text: 'Почти ясно', icon: '🌤️' },
  2: { text: 'Облачно', icon: '⛅' },
  3: { text: 'Пасмурно', icon: '☁️' },
  45: { text: 'Туман', icon: '🌫️' },
  48: { text: 'Туман', icon: '🌫️' },
  51: { text: 'Морось', icon: '🌦️' },
  53: { text: 'Морось', icon: '🌦️' },
  55: { text: 'Морось', icon: '🌧️' },
  61: { text: 'Дождь', icon: '🌧️' },
  63: { text: 'Дождь', icon: '🌧️' },
  65: { text: 'Сильный дождь', icon: '🌧️' },
  71: { text: 'Снег', icon: '🌨️' },
  73: { text: 'Снег', icon: '🌨️' },
  75: { text: 'Снег', icon: '❄️' },
  77: { text: 'Снег', icon: '🌨️' },
  80: { text: 'Ливень', icon: '🌧️' },
  81: { text: 'Ливень', icon: '🌧️' },
  82: { text: 'Ливень', icon: '⛈️' },
  85: { text: 'Снегопад', icon: '🌨️' },
  86: { text: 'Снегопад', icon: '❄️' },
  95: { text: 'Гроза', icon: '⛈️' },
  96: { text: 'Гроза', icon: '⛈️' },
  99: { text: 'Гроза', icon: '⛈️' },
};

let weatherCache = {};
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

async function getWeather(location) {
  const cacheKey = location.toLowerCase().trim();
  const now = Date.now();
  if (weatherCache[cacheKey] && (now - weatherCache[cacheKey].time) < WEATHER_CACHE_TTL) {
    return weatherCache[cacheKey].data;
  }

  let latitude, longitude, name;

  // Геокодинг с транслитерацией
  const translit = transliterate(location);
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(translit)}&count=1&language=ru&format=json`;
    const geoController = new AbortController();
    const geoTimeout = setTimeout(() => geoController.abort(), 5000);
    const geoResp = await fetch(geoUrl, { signal: geoController.signal });
    clearTimeout(geoTimeout);
    if (geoResp.ok) {
      const geoData = await geoResp.json();
      if (geoData.results && geoData.results.length > 0) {
        latitude = geoData.results[0].latitude;
        longitude = geoData.results[0].longitude;
        name = geoData.results[0].name;
      }
    }
  } catch (e) {}

  // Fallback на координаты климатической зоны
  if (!latitude) {
    const coords = getRegionCoords(location);
    if (coords) {
      latitude = coords.lat;
      longitude = coords.lon;
      name = coords.name;
    }
  }

  if (!latitude) return null;

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,soil_temperature_0cm&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&timezone=auto&forecast_days=7`;
  const weatherController = new AbortController();
  const weatherTimeout = setTimeout(() => weatherController.abort(), 5000);
  const weatherResp = await fetch(weatherUrl, { signal: weatherController.signal });
  clearTimeout(weatherTimeout);
  if (!weatherResp.ok) return null;
  const data = await weatherResp.json();

  const current = data.current;
  const daily = data.daily;
  const wInfo = weatherCodes[current.weather_code] || { text: '?', icon: '❓' };

  let frostRisk = false;
  if (daily && daily.temperature_2m_min) {
    frostRisk = daily.temperature_2m_min.some(t => t < 0);
  }

  let precipWeek = 0;
  if (daily && daily.precipitation_sum) {
    precipWeek = daily.precipitation_sum.reduce((a, b) => a + (b || 0), 0);
  }

  const result = {
    temp: Math.round(current.temperature_2m),
    soilTemp: current.soil_temperature_0cm != null ? Math.round(current.soil_temperature_0cm) : null,
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    description: wInfo.text,
    icon: wInfo.icon,
    location: name,
    frostRisk,
    precipWeek: Math.round(precipWeek * 10) / 10,
    daily: daily ? {
      max: daily.temperature_2m_max.map(t => Math.round(t)),
      min: daily.temperature_2m_min.map(t => Math.round(t)),
    } : null,
    fetchedAt: new Date().toISOString(),
  };

  weatherCache[cacheKey] = { time: now, data: result };
  return result;
}

function updateWeatherWidget(weather) {
  if (!weather) return;
  const icon = weatherWidget.querySelector('.weather-icon');
  const temp = weatherWidget.querySelector('.weather-temp');
  const loc = weatherWidget.querySelector('.weather-loc');
  if (icon) icon.textContent = weather.icon;
  if (temp) temp.textContent = `${weather.temp}°C`;
  if (loc) loc.textContent = weather.location || '—';
}

function saveWeatherStats(weather, location) {
  if (!weather) return;
  try {
    const stats = JSON.parse(localStorage.getItem('ogorod_weather_stats') || '[]');
    stats.push({
      date: new Date().toISOString(),
      location,
      temp: weather.temp,
      soilTemp: weather.soilTemp,
      humidity: weather.humidity,
      precip: weather.precipWeek,
    });
    if (stats.length > 1000) stats.shift();
    localStorage.setItem('ogorod_weather_stats', JSON.stringify(stats));
  } catch (e) {}
}

// ===== ЗАПРОС =====
askBtn.addEventListener('click', async () => {
  const crop = selectedCrop || cropInput.value.trim();
  if (!crop) {
    cropInput.focus();
    return;
  }

  askBtn.disabled = true;
  loading.classList.remove('hidden');
  answerSection.classList.add('hidden');

  try {
    const location = locationInput.value.trim();
    let weather = null;
    try {
      weather = await getWeather(location);
      if (weather) {
        updateWeatherWidget(weather);
        saveWeatherStats(weather, location);
      }
    } catch (e) {}

    const advice = getCropAdvice(crop, selectedDate, location, weather);
    answerContent.innerHTML = formatAnswer(advice);
    answerSection.classList.remove('hidden');

    // История
    history.unshift({
      crop,
      date: selectedDate,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      answer: formatAnswer(advice),
      raw: advice,
    });
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('ogorod_history', JSON.stringify(history));
  } catch (e) {
    answerContent.innerHTML = `<p style="color:red;">Ошибка: ${e.message}</p>`;
    answerSection.classList.remove('hidden');
  }

  loading.classList.add('hidden');
  askBtn.disabled = false;
  answerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ===== ФОРМАТИРОВАНИЕ ОТВЕТА =====
function formatAnswer(text) {
  return text
    .replace(/📅 СЕГОДНЯ:/g, '<h3>📅 СЕГОДНЯ:</h3>')
    .replace(/📅 ДАТА ЗАПРОСА:/g, '<h3>📅 ДАТА ЗАПРОСА:</h3>')
    .replace(/📍 МЕСТО:/g, '<h3>📍 МЕСТО:</h3>')
    .replace(/🌱 КУЛЬТУРА:/g, '<h3>🌱 КУЛЬТУРА:</h3>')
    .replace(/📅 ЛУЧШЕЕ ВРЕМЯ[^:]*:/g, '<h3>📅 ЛУЧШЕЕ ВРЕМЯ:</h3>')
    .replace(/📌 СЕЙЧАС:/g, '<h3>📌 СЕЙЧАС:</h3>')
    .replace(/💬 ПОЧЕМУ:/g, '<h3>💬 ПОЧЕМУ:</h3>')
    .replace(/🌙 ЛУНА:/g, '<h3>🌙 ЛУНА:</h3>')
    .replace(/📅 Лунный день:/g, '<h3>📅 Лунный день:</h3>')
    .replace(/🔢 Лунный день:/g, '<h3>🔢 Лунный день:</h3>')
    .replace(/⚠ ОСТОРОЖНО:/g, '<h3>⚠ ОСТОРОЖНО:</h3>')
    .replace(/💧 ПОЛИВ:/g, '<h3>💧 ПОЛИВ:</h3>')
    .replace(/🌿 ДОПОЛНИТЕЛЬНО:/g, '<h3>🌿 ДОПОЛНИТЕЛЬНО:</h3>')
    .replace(/🌿 ПРИРОДНЫЙ ЗНАК:/g, '<h3>🌿 ПРИРОДНЫЙ ЗНАК:</h3>')
    .replace(/📅 НАРОДНАЯ ДАТА:/g, '<h3>📅 НАРОДНАЯ ДАТА:</h3>')
    .replace(/📅 НАРОДНЫЙ КАЛЕНДАРЬ[^:]*:/g, '<h3>📅 НАРОДНЫЙ КАЛЕНДАРЬ:</h3>')
    .replace(/📅 СКОРО НАРОДНЫЙ ПРАЗДНИК:/g, '<h3>📅 СКОРО ПРАЗДНИК:</h3>')
    .replace(/🕐 ЧТО ЖДАТЬ ВСКОРЕ:/g, '<h3>🕐 ЧТО ЖДАТЬ ВСКОРЕ:</h3>')
    .replace(/⏱ [^\n]*/g, m => `<h3>${m}</h3>`)
    .replace(/\n/g, '<br>');
}

// ===== ИСТОРИЯ =====
function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<p class="empty-state">Здесь пока пусто 🌱<br>Задайте первый вопрос!</p>';
    return;
  }
  historyList.innerHTML = history.map((item, i) => `
    <div class="history-item" data-idx="${i}">
      <div class="history-item-crop">${item.crop}</div>
      <div class="history-item-date">${item.time} · ${item.date}</div>
      <div class="history-item-preview">${item.raw.replace(/<[^>]*>/g, '').substring(0, 150)}...</div>
    </div>
  `).join('') + '<button class="clear-history-btn" id="clear-history">🗑 Очистить историю</button>';

  document.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      answerContent.innerHTML = history[idx].answer;
      answerSection.classList.remove('hidden');
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-page="main"]').classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-main').classList.add('active');
      answerSection.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const clearBtn = document.getElementById('clear-history');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      history = [];
      localStorage.setItem('ogorod_history', '[]');
      renderHistory();
    });
  }
}

// ===== ПЛАН =====
planBtn.addEventListener('click', async () => {
  planBtn.disabled = true;
  planLoading.classList.remove('hidden');
  planAnswer.classList.add('hidden');

  try {
    const location = planLocation.value.trim();
    const plan = generateYearPlan(location);
    planContent.innerHTML = formatPlan(plan);
    planAnswer.classList.remove('hidden');
    localStorage.setItem('ogorod_last_plan', plan);
    localStorage.setItem('ogorod_last_plan_location', location);
  } catch (e) {
    planContent.innerHTML = `<p style="color:red;">Ошибка: ${e.message}</p>`;
    planAnswer.classList.remove('hidden');
  }

  planLoading.classList.add('hidden');
  planBtn.disabled = false;
});

function formatPlan(text) {
  return text
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n/g, '<br>');
}

planCopyBtn.addEventListener('click', () => {
  const text = planContent.innerText;
  navigator.clipboard.writeText(text).then(() => {
    planCopyBtn.textContent = '✓ Скопировано!';
    setTimeout(() => { planCopyBtn.textContent = '📋 Копировать'; }, 1500);
  });
});

// ===== КАЛЕНДАРЬ =====
const CALENDAR_DATA = [
  { month: 'Январь', icon: '❄️', tasks: [
    { icon: '🌱', text: 'Ничего не сажать — мороз' },
    { icon: '🛒', text: 'Закупать семена' },
    { icon: '🔧', text: 'Проверить инструменты' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Февраль', icon: '🌨️', tasks: [
    { icon: '🌱', text: 'Готовить рассаду — томаты, перец (конец февраля)' },
    { icon: '🧪', text: 'Протравить семена в марганцовке' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Март', icon: '🌤️', tasks: [
    { icon: '🌱', text: 'Сеять рассаду томатов, перца, баклажанов' },
    { icon: '🌱', text: 'Сеять рассаду капусты ранней' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Апрель', icon: '🌷', tasks: [
    { icon: '🔧', text: 'Подготовка грядок — перекопать' },
    { icon: '🧅', text: 'Сажать лук севок (конец апреля)' },
    { icon: '🥕', text: 'Сеять морковь (конец апреля)' },
    { icon: '🥗', text: 'Сеять укроп, петрушку, салат' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Май', icon: '🌸', tasks: [
    { icon: '🥔', text: 'Сажать картофель (5–20 мая)' },
    { icon: '🥕', text: 'Сеять морковь (весь май)' },
    { icon: '🥬', text: 'Сажать капусту рассадой' },
    { icon: '🍏', text: 'Сажать саженцы яблони, груши, вишни' },
    { icon: '🍓', text: 'Сажать клубнику' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Июнь', icon: '☀️', tasks: [
    { icon: '🍅', text: 'Высаживать рассаду томатов (после 5 июня)' },
    { icon: '🫑', text: 'Высаживать рассаду перца (после 10 июня)' },
    { icon: '🥒', text: 'Сеять огурцы (после 5 июня)' },
    { icon: '🫛', text: 'Сеять фасоль, горох' },
    { icon: '🌽', text: 'Сеять кукурузу' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Июль', icon: '🌻', tasks: [
    { icon: '💧', text: 'Поливать! Особенно огурцы и капусту' },
    { icon: '🍅', text: 'Пасынковать томаты' },
    { icon: '🥒', text: 'Собирать первые огурцы' },
    { icon: '🍓', text: 'Собирать клубнику, смородину' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Август', icon: '🌾', tasks: [
    { icon: '🍅', text: 'Собирать огурцы, томаты, перец' },
    { icon: '🥔', text: 'Копать ранний картофель (конец августа)' },
    { icon: '🍏', text: 'Собирать яблоки ранние' },
    { icon: '🧅', text: 'Собирать лук' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Сентябрь', icon: '🍂', tasks: [
    { icon: '🧄', text: 'Сажать чеснок озимый (конец сентября)' },
    { icon: '🥔', text: 'Копать картофель' },
    { icon: '🥕', text: 'Собирать морковь, свёклу' },
    { icon: '🥬', text: 'Собирать капусту позднюю' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Октябрь', icon: '🍁', tasks: [
    { icon: '🧄', text: 'Досадить чеснок озимый (до 14 октября — Покров)' },
    { icon: '🥕', text: 'Сеять морковь под зиму' },
    { icon: '🥬', text: 'Убирать капусту (до заморозков)' },
    { icon: '🌳', text: 'Белить стволы деревьев' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Ноябрь', icon: '🌫️', tasks: [
    { icon: '🛡️', text: 'Укрывать растения на зиму' },
    { icon: '🍂', text: 'Сгребать листья в компост' },
    { icon: '🔧', text: 'Проверить погреб' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
  { month: 'Декабрь', icon: '🎄', tasks: [
    { icon: '🌱', text: 'Отдыхать! Планировать огород на следующий год' },
    { icon: '🛒', text: 'Закупать семена (начать)' },
    { icon: '🌙', text: 'Лучшие лунные дни:' },
    { icon: '🚫', text: 'Нельзя сажать:' },
  ]},
];

// Заполнить select года
const currentYearForCal = new Date().getFullYear();
if (calendarYearSelect && calendarYearSelect.options.length === 0) {
  for (let y = currentYearForCal; y <= currentYearForCal + 5; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYearForCal) opt.selected = true;
    calendarYearSelect.appendChild(opt);
  }
  calendarYearSelect.addEventListener('change', () => renderCalendar());
}

async function renderCalendar() {
  const currentMonth = new Date().getMonth();
  const selectedYear = parseInt(calendarYearSelect?.value) || new Date().getFullYear();
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  const lunarPromises = CALENDAR_DATA.map((m, i) =>
    Promise.resolve({ best: getBestLunarDays(i + 1, selectedYear), bad: getBadLunarDays(i + 1, selectedYear) })
  );
  const lunarResults = await Promise.all(lunarPromises);

  const isCurrentYear = selectedYear === currentYearForCal;

  calendarContent.innerHTML = CALENDAR_DATA.map((m, i) => {
    const isCurrent = isCurrentYear && monthNames[currentMonth] === m.month;
    const lunar = lunarResults[i];
    const tasks = m.tasks.map(t => {
      if (t.text.startsWith('Лучшие лунные дни:') && lunar && lunar.best.length > 0) {
        return { icon: t.icon, text: `Лучшие лунные дни: ${lunar.best.join(', ')}` };
      }
      if (t.text.startsWith('Нельзя сажать:') && lunar && lunar.bad.length > 0) {
        return { icon: t.icon, text: `Нельзя сажать: ${lunar.bad.join(', ')}` };
      }
      return t;
    });
    return `
    <div class="cal-month${isCurrent ? ' current-month' : ''}">
      <div class="cal-month-title">${m.icon} ${m.month}</div>
      ${tasks.map(t => `
        <div class="cal-task">
          <span class="cal-task-icon">${t.icon}</span>
          <span>${t.text}</span>
        </div>
      `).join('')}
    </div>
  `}).join('');
}

// ===== СОХРАНЕНИЕ МЕСТА =====
const savedLocation = localStorage.getItem('ogorod_default_location');
if (savedLocation) {
  locationInput.value = savedLocation;
  planLocation.value = savedLocation;
  const defaultLocInput = document.getElementById('default-location');
  if (defaultLocInput) defaultLocInput.value = savedLocation;
}

locationInput.addEventListener('change', () => {
  localStorage.setItem('ogorod_default_location', locationInput.value.trim());
});

const defaultLocInput = document.getElementById('default-location');
if (defaultLocInput) {
  defaultLocInput.addEventListener('change', () => {
    const val = defaultLocInput.value.trim();
    localStorage.setItem('ogorod_default_location', val);
    locationInput.value = val;
    planLocation.value = val;
  });
}

// Загрузка сохранённого плана
const savedPlan = localStorage.getItem('ogorod_last_plan');
const savedPlanLoc = localStorage.getItem('ogorod_last_plan_location');
if (savedPlan) {
  planContent.innerHTML = formatPlan(savedPlan);
  if (savedPlanLoc) planLocation.value = savedPlanLoc;
  planAnswer.classList.remove('hidden');
}

// ===== ЗАГРУЗКА ПОГОДЫ ПРИ СТАРТЕ =====
async function loadWeatherOnStart() {
  const loc = locationInput.value.trim();
  if (!loc) return;
  try {
    const weather = await getWeather(loc);
    if (weather) {
      updateWeatherWidget(weather);
      saveWeatherStats(weather, loc);
    }
  } catch (e) {}
}
loadWeatherOnStart();

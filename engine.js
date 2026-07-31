// ===== ЛОКАЛЬНЫЙ ДВИЖОК ПРАВИЛ =====
// Работает без интернета, без API, без ключей

import { CROPS, CLIMATE_ZONES, FOLK_CALENDAR } from './crops.js';

// ===== ОПРЕДЕЛЕНИЕ КЛИМАТА ПО МЕСТУ =====
function detectClimate(location) {
  const loc = location.toLowerCase();
  for (const [key, zone] of Object.entries(CLIMATE_ZONES)) {
    if (loc.includes(key)) return zone;
  }
  // По умолчанию — Псковская область (средняя полоса)
  return CLIMATE_ZONES['псков'];
}

// ===== ЛУННЫЙ КАЛЕНДАРЬ — ПОЛНОСТЬЮ РАСЧЁТНЫЙ =====
// Работает для любого года, без хардкода.
// Основано на: фаза луны + знак зодиака луны + лунный день

// --- Эклиптическая долгота Луны (упрощённый алгоритм Jean Meeus) ---
function getMoonLongitude(date) {
  const J1970 = 2440587.5;
  const jd = date.getTime() / 86400000 + J1970;
  const T = (jd - 2451545.0) / 36525; // юлианские столетия от J2000

  // Средняя долгота Луны
  const L = (218.316 + 481267.8813 * T) % 360;
  // Средняя аномалия Луны
  const M = (134.963 + 477198.8676 * T) % 360;
  // Средняя долгота восходящего узла
  const Omega = (125.045 - 1934.136 * T) % 360;
  // Среднее расстояние Луны
  const F = (93.272 + 483202.0171 * T) % 360;

  const rad = Math.PI / 180;
  // Главные возмущения (упрощённо)
  let lambda = L
    + 6.289 * Math.sin(M * rad)
    - 1.274 * Math.sin((2 * L - 2 * M) * rad) * 0 // упрощение
    + 0.658 * Math.sin(2 * F * rad) * 0
    - 0.186 * Math.sin(M * rad) * 0;

  // Более точная версия с основными членами
  lambda = L
    + 6.289 * Math.sin(M * rad)
    - 1.274 * Math.sin((2 * (L - M)) * rad)
    + 0.658 * Math.sin(2 * F * rad)
    - 0.186 * Math.sin((2 * M - 2 * F) * rad)
    - 0.059 * Math.sin((2 * M - 2 * L) * rad)
    - 0.057 * Math.sin((M - 2 * F) * rad)
    + 0.053 * Math.sin((2 * L - M) * rad)
    + 0.046 * Math.sin((2 * M) * rad)
    + 0.041 * Math.sin((2 * L - 2 * F) * rad)
    - 0.035 * Math.sin(Omega * rad)
    - 0.031 * Math.sin((L - M) * rad)
    + 0.026 * Math.sin((2 * F - M) * rad)
    - 0.023 * Math.sin((2 * F - 2 * L) * rad);

  return ((lambda % 360) + 360) % 360;
}

// --- Знак зодиака Луны ---
const ZODIAC_SIGNS = [
  { name: 'Овен', angle: 0, fertile: false, element: 'огонь' },
  { name: 'Телец', angle: 30, fertile: true, element: 'земля' },
  { name: 'Близнецы', angle: 60, fertile: false, element: 'воздух' },
  { name: 'Рак', angle: 90, fertile: true, element: 'вода' },
  { name: 'Лев', angle: 120, fertile: false, element: 'огонь' },
  { name: 'Дева', angle: 150, fertile: true, element: 'земля' },
  { name: 'Весы', angle: 180, fertile: true, element: 'воздух' },
  { name: 'Скорпион', angle: 210, fertile: true, element: 'вода' },
  { name: 'Стрелец', angle: 240, fertile: false, element: 'огонь' },
  { name: 'Козерог', angle: 270, fertile: true, element: 'земля' },
  { name: 'Водолей', angle: 300, fertile: false, element: 'воздух' },
  { name: 'Рыбы', angle: 330, fertile: true, element: 'вода' },
];

function getMoonZodiac(date) {
  const lon = getMoonLongitude(date);
  for (let i = ZODIAC_SIGNS.length - 1; i >= 0; i--) {
    if (lon >= ZODIAC_SIGNS[i].angle) return ZODIAC_SIGNS[i];
  }
  return ZODIAC_SIGNS[0];
}

// --- Лунный день (традиционный, от новолуния) ---
function getLunarDayNumber(date) {
  const synodic = 29.53058867;
  const knownNew = new Date(2000, 0, 6, 18, 14, 0);
  const diff = (date - knownNew) / (1000 * 60 * 60 * 24);
  const phase = ((diff % synodic) + synodic) % synodic;
  return Math.floor(phase) + 1; // 1..30
}

// --- Классификация дня для посадки ---
function getLunarDayQuality(date) {
  const moon = getMoonPhase(date);
  const zodiac = getMoonZodiac(date);
  const lunarDay = getLunarDayNumber(date);

  // Новолуние и полнолуние — запрещено
  if (moon.name === 'Новолуние' || moon.name === 'Полнолуние') return 'bad';

  // Солнечные/лунные затмения (приблизительно — дни около новолуния/полнолуния)
  if (lunarDay === 1 || lunarDay === 30) return 'bad';

  // Четверти — нежелательно
  if (moon.name === 'Первая четверть' || moon.name === 'Последняя четверть') return 'avoid';

  // Плодородный знак зодиака + правильная фаза = лучший день
  if (zodiac.fertile && moon.growing) return 'best';
  if (zodiac.fertile && !moon.growing) return 'good';

  // Неплодородный знак
  if (!zodiac.fertile) return 'avoid';

  // Растущая луна сама по себе — хорошо
  if (moon.growing) return 'good';

  return 'neutral';
}

function getLunarDayInfo(date) {
  const quality = getLunarDayQuality(date);
  const zodiac = getMoonZodiac(date);
  const lunarDay = getLunarDayNumber(date);
  const labels = {
    'best': `⭐ Очень благоприятный день! Луна в ${zodiac.name} (${zodiac.element})`,
    'good': `✅ Благоприятный день. Луна в ${zodiac.name} (${zodiac.element})`,
    'neutral': `Обычный день. Луна в ${zodiac.name}`,
    'avoid': `⚠ Нежелательный день. Луна в ${zodiac.name} (неплодородный знак)`,
    'bad': `🚫 Запрещённый день (новолуние/полнолуние) — ничего не сажать!`,
  };
  return { quality, label: labels[quality] || labels['neutral'], zodiac: zodiac.name, lunarDay };
}

// --- Благоприятные дни в месяце (расчёт для любого года) ---
function getBestLunarDays(month, year) {
  const y = year || new Date().getFullYear();
  const daysInMonth = new Date(y, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, month - 1, d, 12, 0, 0);
    const quality = getLunarDayQuality(date);
    if (quality === 'best' || quality === 'good') {
      result.push(d);
    }
  }
  return result;
}

// --- Запрещённые дни в месяце ---
function getBadLunarDays(month, year) {
  const y = year || new Date().getFullYear();
  const daysInMonth = new Date(y, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, month - 1, d, 12, 0, 0);
    const quality = getLunarDayQuality(date);
    if (quality === 'bad') result.push(d);
  }
  return result;
}

// ===== ФАЗА ЛУНЫ (ЛОКАЛЬНЫЙ РАСЧЁТ) =====
function getMoonPhase(date) {
  const synodic = 29.53058867;
  const knownNew = new Date(2000, 0, 6, 18, 14, 0); // Известное новолуние
  const diff = (date - knownNew) / (1000 * 60 * 60 * 24);
  const phase = ((diff % synodic) + synodic) % synodic;
  const fraction = phase / synodic;

  if (fraction < 0.03 || fraction > 0.97) return { name: 'Новолуние', growing: false, icon: '🌑' };
  if (fraction < 0.22) return { name: 'Растущая (первая четверть)', growing: true, icon: '🌒' };
  if (fraction < 0.28) return { name: 'Первая четверть', growing: true, icon: '🌓' };
  if (fraction < 0.47) return { name: 'Растущая (приближается к полнолунию)', growing: true, icon: '🌔' };
  if (fraction < 0.53) return { name: 'Полнолуние', growing: false, icon: '🌕' };
  if (fraction < 0.72) return { name: 'Убывающая (приближается к последней четверти)', growing: false, icon: '🌖' };
  if (fraction < 0.78) return { name: 'Последняя четверть', growing: false, icon: '🌗' };
  return { name: 'Убывающая', growing: false, icon: '🌘' };
}

// ===== ПРИРОДНЫЕ ПРИЗНАКИ (расширенные) =====
function getNaturalSigns(date, climate) {
  const signs = [];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayNum = m * 100 + d;

  if (climate.naturalSigns) {
    for (const [name, data] of Object.entries(climate.naturalSigns)) {
      const signDayNum = data.month * 100 + data.day;
      if (dayNum >= signDayNum) {
        signs.push({ sign: name, meaning: data.meaning, date: `${data.day} ${getMonthName(data.month)}` });
      }
    }
  }

  return signs;
}

// ===== ПРИРОДНЫЕ ПРИЗНАКИ — ЧТО ОЖИДАТЬ ВСКОРЕ =====
function getUpcomingSigns(date, climate) {
  const upcoming = [];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayNum = m * 100 + d;

  if (climate.naturalSigns) {
    for (const [name, data] of Object.entries(climate.naturalSigns)) {
      const signDayNum = data.month * 100 + data.day;
      if (dayNum < signDayNum) {
        const daysLeft = signDayNum - dayNum;
        if (daysLeft <= 21) {
          upcoming.push({ sign: name, meaning: data.meaning, date: `${data.day} ${getMonthName(data.month)}`, daysLeft });
        }
      }
    }
  }

  return upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ===== НАРОДНЫЙ И ПРАВОСЛАВНЫЙ КАЛЕНДАРЬ =====
function getFolkEvents(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return FOLK_CALENDAR.filter(f => f.month === m && f.day === d);
}

// Ближайший народный праздник
function getUpcomingFolkEvent(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayNum = m * 100 + d;

  // Ищем ближайший праздник в этом году
  let closest = null;
  let minDiff = 999;
  for (const f of FOLK_CALENDAR) {
    const fDayNum = f.month * 100 + f.day;
    let diff = fDayNum - dayNum;
    if (diff < 0) diff += 1200; // перенос на следующий год
    if (diff < minDiff && diff > 0) {
      minDiff = diff;
      closest = f;
    }
  }
  return closest ? { ...closest, daysLeft: minDiff } : null;
}

function getMonthName(m) {
  const names = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return names[m] || '';
}

// ===== ПАРСИНГ ДАТЫ =====
function parseDate(dateStr) {
  const now = new Date();
  const lower = (dateStr || '').toLowerCase().trim();

  if (!lower || lower === 'сегодня') return now;
  if (lower === 'завтра') { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
  if (lower.includes('выходн')) {
    const d = new Date(now);
    const day = d.getDay();
    const daysToSat = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToSat);
    return d;
  }
  if (lower.includes('следующ') && lower.includes('недел')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }

  // "10 мая", "5 июня" и т.д.
  const months = {
    'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'ма': 4, 'май': 4,
    'июн': 5, 'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11
  };

  for (const [prefix, monthIdx] of Object.entries(months)) {
    if (lower.includes(prefix)) {
      const dayMatch = lower.match(/(\d+)/);
      if (dayMatch) {
        return new Date(now.getFullYear(), monthIdx, parseInt(dayMatch[1]));
      }
    }
  }

  return now;
}

// ===== СРАВНЕНИЕ ДАТ =====
function dateInRange(date, start, end) {
  const dayNum = date.getMonth() * 100 + date.getDate();
  const startNum = start.month * 100 + start.day;
  const endNum = end.month * 100 + end.day;
  return dayNum >= startNum && dayNum <= endNum;
}

function daysUntil(date, target) {
  const targetDate = new Date(date.getFullYear(), target.month - 1, target.day);
  if (targetDate < date) targetDate.setFullYear(targetDate.getFullYear() + 1);
  return Math.ceil((targetDate - date) / (1000 * 60 * 60 * 24));
}

function daysSince(date, target) {
  const targetDate = new Date(date.getFullYear(), target.month - 1, target.day);
  return Math.ceil((date - targetDate) / (1000 * 60 * 60 * 24));
}

// ===== ГЛАВНАЯ ФУНКЦИЯ: ОТВЕТ ПО КУЛЬТУРЕ =====
function getCropAdvice(cropName, dateStr, location, weather) {
  const date = parseDate(dateStr);
  const climate = detectClimate(location);
  const crop = CROPS[cropName];
  const today = new Date();
  const todayStr = formatDate(today);
  const dateStrFormatted = formatDate(date);

  if (!crop) {
    return generateUnknownCropAdvice(cropName, date, location, climate, weather, todayStr);
  }

  const moon = getMoonPhase(date);
  const lunarDay = getLunarDayInfo(date);
  const signs = getNaturalSigns(date, climate);
  const upcomingSigns = getUpcomingSigns(date, climate);
  const folkEvents = getFolkEvents(date);
  const upcomingFolk = getUpcomingFolkEvent(date);
  const inRange = dateInRange(date, crop.plantStart, crop.plantEnd);

  // Проверка заморозков
  const lastFrostDate = climate.lastFrost;
  const beforeLastFrost = date.getMonth() * 100 + date.getDate() < lastFrostDate.month * 100 + lastFrostDate.day;

  // Проверка температуры
  const monthTemp = climate.avgTemps[date.getMonth() + 1] || 0;
  const currentTemp = weather ? weather.temp : monthTemp;
  const soilTemp = (weather && weather.soilTemp != null) ? weather.soilTemp : monthTemp - 2;

  // Проверка: поздно ли в этом году?
  const plantEndDayNum = crop.plantEnd.month * 100 + crop.plantEnd.day;
  const dateDayNum = date.getMonth() * 100 + date.getDate();
  const isAfterSeason = dateDayNum > plantEndDayNum + 100; // больше чем ~месяц после конца срока
  const isTooLate = dateDayNum > plantEndDayNum && !crop.frostTolerant;

  // Проверка: успеет ли вызреть до осеннего заморозка?
  const firstFallFrost = climate.firstFallFrost || { month: 9, day: 15 };
  const isAutumnCrop = crop.plantStart.month >= 9;
  let fallFrostDate = new Date(date.getFullYear(), firstFallFrost.month - 1, firstFallFrost.day);
  let daysToFrost = Math.ceil((fallFrostDate - date) / (1000 * 60 * 60 * 24));
  // Для озимых (чеснок) — заморозки не страшны, урожай на следующий год
  const daysToMaturity = crop.daysToMaturity || 60;
  const canMature = isAutumnCrop ? true : (daysToFrost > daysToMaturity + 10);

  // Определение статуса
  let status = '';
  let statusReason = '';
  let isTooLateThisYear = false;

  // Если уже после срока посадки И культура не успеет вызреть — точно поздно
  if (dateDayNum > plantEndDayNum && !canMature && !crop.frostTolerant) {
    status = 'ПОЗДНО В ЭТОМ ГОДУ';
    statusReason = `Срок посадки ${crop.name.toLowerCase()} уже прошёл. `;
    statusReason += `Лучшее время было с ${crop.plantStart.day} ${getMonthName(crop.plantStart.month)} по ${crop.plantEnd.day} ${getMonthName(crop.plantEnd.month)}. `;
    statusReason += `Для созревания нужно ${daysToMaturity} дней, а до осенних заморозков (${firstFallFrost.day} ${getMonthName(firstFallFrost.month)}) осталось всего ${daysToFrost} дней. `;
    statusReason += `Урожай не успеет вызреть! Ждите следующую весну.`;
    isTooLateThisYear = true;
  } else if (crop.frostTolerant && crop.soilTempMin <= 5) {
    // Морозостойкие (морковь, лук, чеснок, укроп, петрушка, салат)
    if (soilTemp >= crop.soilTempMin && inRange) {
      status = 'МОЖНО';
      statusReason = 'Растение не боится холода, земля уже готова';
    } else if (soilTemp >= crop.soilTempMin && !inRange && dateDayNum > plantEndDayNum) {
      status = 'ПОЗДНО';
      statusReason = 'Время посадки прошло, но растение холодостойкое — можно попробовать';
    } else if (soilTemp >= crop.soilTempMin) {
      status = 'ОСТОРОЖНО';
      statusReason = 'Земля готова, но время посадки ещё не пришло';
    } else if (date.getMonth() >= 2) {
      status = 'ОСТОРОЖНО';
      statusReason = 'Земля ещё холодная, но можно попробовать — растение переживёт';
    } else {
      status = 'РАНО';
      statusReason = 'Ещё слишком рано, земля мёрзлая';
    }
  } else {
    // Теплолюбивые
    if (isTooLateThisYear) {
      // уже установлен выше — пропускаем
    } else if (beforeLastFrost && !crop.frostTolerant) {
      const days = daysUntil(date, lastFrostDate);
      status = 'РАНО';
      statusReason = `Возможны заморозки. Ждать ещё ${days} дней (до ${lastFrostDate.day} ${getMonthName(lastFrostDate.month)})`;
    } else if (soilTemp < crop.soilTempMin) {
      status = 'РАНО';
      statusReason = `Земля ещё холодная (примерно ${Math.round(soilTemp)}°). Нужно чтобы было ${crop.soilTempMin}°`;
    } else if (inRange) {
      status = 'МОЖНО';
      statusReason = 'Самое время! Земля тёплая, заморозков нет';
    } else if (dateDayNum > plantEndDayNum && !canMature) {
      status = 'ПОЗДНО В ЭТОМ ГОДУ';
      statusReason = `Срок посадки прошёл. Для созревания нужно ${daysToMaturity} дней, до заморозков осталось ${daysToFrost} дней. Урожай не успеет вызреть!`;
      isTooLateThisYear = true;
    } else if (dateDayNum > plantEndDayNum) {
      status = 'ПОЗДНО';
      statusReason = `Лучшее время прошло, но до заморозков ещё ${daysToFrost} дней — урожай может успеть вызреть (нужно ${daysToMaturity} дней).`;
    } else {
      status = 'ОСТОРОЖНО';
      statusReason = 'Почти можно, но следите за погодой';
    }
  }

  // Лунный фактор
  let moonAdvice = '';
  const isRootCrop = ['Картофель', 'Морковь', 'Лук', 'Чеснок'].includes(crop.name);
  if (moon.growing && !isRootCrop) {
    moonAdvice = 'Луна растущая — отлично для этой культуры (урожай над землёй)';
  } else if (!moon.growing && isRootCrop) {
    moonAdvice = 'Луна убывающая — отлично для этой культуры (корнеплод)';
  } else if (moon.growing && isRootCrop) {
    moonAdvice = 'Луна растущая — можно, но для корнеплодов лучше убывающая луна';
  } else if (!moon.growing && !isRootCrop) {
    moonAdvice = 'Луна убывающая — можно, но для этой культуры лучше растущая луна';
  }

  // Конкретные благоприятные дни в месяце посадки
  let bestDaysText = '';
  if (!isTooLateThisYear) {
    const plantMonth = inRange ? date.getMonth() + 1 : crop.plantStart.month;
    const bestDays = getBestLunarDays(plantMonth, date.getFullYear());
    if (bestDays.length > 0) {
      const dayList = bestDays.slice(0, 8).join(', ');
      bestDaysText = `Благоприятные дни по лунному календарю: ${dayList} ${getMonthName(plantMonth)}`;
    }
  }

  // Природные признаки
  let signsText = '';
  if (signs.length > 0) {
    signsText = signs.map(s => `- ${s.sign} → ${s.meaning}`).join('\n');
  } else {
    signsText = '- Природных признаков пока не видно. Ориентируйтесь на погоду и температуру земли.';
  }

  // Ожидаемые признаки
  let upcomingText = '';
  if (upcomingSigns.length > 0 && !isTooLateThisYear) {
    upcomingText = '\n\n🕐 ЧТО ЖДАТЬ ВСКОРЕ:';
    upcomingSigns.slice(0, 3).forEach(s => {
      upcomingText += `\n- ${s.sign} (примерно ${s.date}, через ${s.daysLeft} дн.) → ${s.meaning}`;
    });
  }

  // Риски
  let risks = [];
  if (beforeLastFrost && !crop.frostTolerant && !isTooLateThisYear) {
    risks.push('Возможны ночные заморозки — растение погибнет!');
  }
  if (soilTemp < crop.soilTempMin && soilTemp > 0 && !isTooLateThisYear) {
    risks.push(`Земля холодная (${Math.round(soilTemp)}°) — семена могут не взойти`);
  }
  if (weather && weather.temp < 0) {
    risks.push('Сейчас минусовая температура — сажать нельзя!');
  }
  if (weather && weather.frostRisk && !crop.frostTolerant) {
    risks.push('В ближайшие дни ожидаются заморозки — лучше подождать!');
  }
  if (lunarDay.quality === 'bad') {
    risks.push('Сегодня по лунному календарю сажать нельзя (новолуние или полнолуние)');
  }

  // Полив
  let waterAdvice = crop.waterInfo;
  if (weather && weather.humidity > 80) {
    waterAdvice += '\nСейчас влажно — поливать не нужно, ждите когда подсохнет.';
  } else if (weather && weather.humidity < 40 && date.getMonth() >= 4 && date.getMonth() <= 8) {
    waterAdvice += '\nСейчас сухо — поливать обязательно!';
  }

  // ===== ФОРМИРОВАНИЕ ОТВЕТА =====
  let answer = `📅 СЕГОДНЯ: ${todayStr}
📅 ДАТА ЗАПРОСА: ${dateStrFormatted}
📍 МЕСТО: ${climate.name}

🌱 КУЛЬТУРА: ${crop.name}

📅 ЛУЧШЕЕ ВРЕМЯ ДЛЯ ПОСАДКИ:
с ${crop.plantStart.day} ${getMonthName(crop.plantStart.month)} по ${crop.plantEnd.day} ${getMonthName(crop.plantEnd.month)}
${bestDaysText}
${isAutumnCrop ? '⏱ Озимые: урожай в следующем году (чеснок зимует в земле)' : `⏱ Созревание: ${daysToMaturity} дней | До заморозков: ${daysToFrost} дней (${firstFallFrost.day} ${getMonthName(firstFallFrost.month)})`}

📌 СЕЙЧАС: ${status}

💬 ПОЧЕМУ:
${statusReason}
${signsText}${upcomingText}

🌙 ЛУНА: ${moon.icon} ${moon.name}
${moonAdvice}
📅 Лунный день: ${lunarDay.label}
🔢 Лунный день: ${lunarDay.lunarDay} | Знак: ${lunarDay.zodiac}`;

  // Народный календарь — сегодня
  if (folkEvents.length > 0) {
    answer += `\n\n📅 НАРОДНЫЙ КАЛЕНДАРЬ — СЕГОДНЯ:`;
    folkEvents.forEach(f => {
      answer += `\n- ${f.name} (${f.date}) — ${f.action}`;
    });
  }

  // Ближайший народный праздник
  if (upcomingFolk && upcomingFolk.daysLeft <= 14) {
    answer += `\n\n📅 СКОРО НАРОДНЫЙ ПРАЗДНИК:`;
    answer += `\n- ${upcomingFolk.name} (${upcomingFolk.date}) — через ${upcomingFolk.daysLeft} дн.`;
    answer += `\n  ${upcomingFolk.action}`;
  }

  if (risks.length > 0) {
    answer += `\n\n⚠ ОСТОРОЖНО:`;
    risks.forEach(r => answer += `\n- ${r}`);
  } else if (!isTooLateThisYear) {
    answer += `\n\n⚠ ОСТОРОЖНО:\nНет особых рисков. Можно сажать!`;
  }

  answer += `\n\n💧 ПОЛИВ:\n${waterAdvice}`;

  answer += `\n\n🌿 ДОПОЛНИТЕЛЬНО:\n${crop.extra}\n\nУход: ${crop.care}\n\nУрожай: ${crop.harvest}`;

  if (crop.naturalSign) {
    answer += `\n\n🌿 ПРИРОДНЫЙ ЗНАК:\n${crop.naturalSign} — значит пора сажать ${crop.name.toLowerCase()}`;
  }

  if (crop.folkDate) {
    answer += `\n\n📅 НАРОДНАЯ ДАТА:\n${crop.folkDate}`;
  }

  return answer;
}

// ===== ФОРМАТИРОВАНИЕ ДАТЫ =====
function formatDate(date) {
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const dayName = days[date.getDay()];
  return `${dayName}, ${d} ${getMonthName(m)} ${y} года`;
}

// ===== НЕИЗВЕСТНАЯ КУЛЬТУРА =====
function generateUnknownCropAdvice(cropName, date, location, climate, weather, todayStr) {
  const moon = getMoonPhase(date);
  const lunarDay = getLunarDayInfo(date);
  const monthTemp = climate.avgTemps[date.getMonth() + 1] || 0;
  const currentTemp = weather ? weather.temp : monthTemp;
  const beforeLastFrost = date.getMonth() * 100 + date.getDate() < climate.lastFrost.month * 100 + climate.lastFrost.day;
  const dateStrFormatted = formatDate(date);

  let status = 'ОСТОРОЖНО';
  let reason = 'Я не знаю эту культуру точно, но могу сказать по погоде:';

  if (beforeLastFrost) {
    status = 'РАНО';
    reason = `Возможны заморозки. Ждите потепления (после ${climate.lastFrost.day} ${getMonthName(climate.lastFrost.month)})`;
  } else if (currentTemp >= 15) {
    status = 'МОЖНО';
    reason = 'Тепло, заморозков нет — скорее всего можно сажать';
  } else if (currentTemp >= 8) {
    status = 'ОСТОРОЖНО';
    reason = 'Земля прохладная, но можно попробовать';
  } else {
    status = 'РАНО';
    reason = 'Слишком холодно для посадки';
  }

  return `📅 СЕГОДНЯ: ${todayStr}
📅 ДАТА ЗАПРОСА: ${dateStrFormatted}
📍 МЕСТО: ${climate.name}

🌱 КУЛЬТУРА: ${cropName}

📅 ЛУЧШЕЕ ВРЕМЯ:
Точного времени не знаю — спросите про конкретное растение из списка

📌 СЕЙЧАС: ${status}

💬 ПОЧЕМУ:
${reason}

🌙 ЛУНА: ${moon.icon} ${moon.name}
📅 Лунный день: ${lunarDay.label}

⚠ ОСТОРОЖНО:
- Я не знаю эту культуру — проверьте в садовом магазине

💧 ПОЛИВ:
После посадки полить водой. Дальше — по мере высыхания земли.

🌿 ДОПОЛНИТЕЛЬНО:
Выберите культуру из списка слева — я знаю все эти растения и дам точный совет.`;
}

// ===== ГОДОВОЙ ПЛАН (ЛОКАЛЬНЫЙ) =====
function generateYearPlan(location) {
  const climate = detectClimate(location);
  const months = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];

  const monthTasks = {
    1: ['Ничего не сажать — мороз', 'Проверить семена — годны ли', 'Закупить недостающие семена', 'Проверить лопаты, грабли, тяпки'],
    2: ['Готовить рассаду — томаты, перец, баклажаны (конец февраля)', 'Протравить семена в марганцовке', 'Проверить запасы земли для рассады'],
    3: ['Сеять рассаду томатов, перца, баклажанов', 'Сеять рассаду капусты ранней', 'Готовить ящики для рассады', 'Проверить чеснок озимый — как зимует'],
    4: ['Подготовка грядок — перекопать, убрать сорняки', 'Сажать лук севок (конец апреля)', 'Сеять морковь (конец апреля)', 'Сеять укроп, петрушку (конец апреля)', 'Сажать чеснок яровой', 'Сеять салат (конец апреля)'],
    5: ['Сажать картофель (5–20 мая)', 'Сеять морковь (весь май)', 'Сажать капусту рассадой', 'Сеять укроп, петрушку, салат', 'Сажать саженцы яблони, груши, вишни', 'Сажать смородину, крыжовник', 'Сажать клубнику', 'Сеять кукурузу (после 15 мая)', 'Сеять фасоль (после 20 мая)', 'Высадить рассаду капусты'],
    6: ['Высаживать рассаду томатов (после 5 июня)', 'Высаживать рассаду перца (после 10 июня)', 'Высаживать рассаду баклажанов (после 10 июня)', 'Сеять огурцы (после 5 июня)', 'Сеять фасоль (начало июня)', 'Сеять кукурузу (начало июня)', 'Сеять укроп, петрушку, салат', 'Сажать капусту позднюю', 'Поливать всё в засуху', 'Рыхлить землю, убирать сорняки'],
    7: ['Поливать! Особенно огурцы и капусту', 'Пасынковать томаты', 'Подвязывать томаты, перец, огурцы', 'Собирать первые огурцы', 'Собирать клубнику', 'Собирать смородину, крыжовник', 'Сеять салат (ранние сорта)', 'Убирать чеснок (когда листья пожелтеют)', 'Окучивать картофель'],
    8: ['Собирать огурцы, томаты, перец', 'Копать ранний картофель (конец августа)', 'Собирать яблоки ранние, груши', 'Сеять редис, салат (конец августа)', 'Сажать клубнику (новые грядки)', 'Готовить грядки под озимые', 'Собирать лук (когда перо полегло)'],
    9: ['Сажать чеснок озимый (конец сентября)', 'Копать картофель', 'Собирать морковь, свёклу', 'Собирать капусту позднюю', 'Собирать яблоки, груши', 'Убирать томаты (все, даже зелёные)', 'Готовить компост', 'Перекапывать грядки'],
    10: ['Досадить чеснок озимый (до 14 октября — Покров)', 'Сеять морковь под зиму', 'Сеять укроп, петрушку под зиму', 'Убирать капусту (до заморозков)', 'Белить стволы деревьев', 'Укрывать клубнику на зиму', 'Убирать ботву, сжигать больные растения'],
    11: ['Укрывать растения на зиму', 'Сгребать листья в компост', 'Проверить погреб — температура и влажность', 'Готовить семена на следующий год'],
    12: ['Отдыхать! 🌱', 'Планировать огород на следующий год', 'Закупать семена (начать)', 'Проверить инструменты'],
  };

  // Календарь
  const planYear = new Date().getFullYear();
  let calendar = '## 📅 КАЛЕНДАРЬ ПО МЕСЯЦАМ\n\n';
  for (let i = 0; i < 12; i++) {
    calendar += `${months[i]}:\n`;
    (monthTasks[i + 1] || []).forEach(task => {
      calendar += `- ${task}\n`;
    });
    // Добавить расчётные лунные дни
    const bestDays = getBestLunarDays(i + 1, planYear);
    const badDays = getBadLunarDays(i + 1, planYear);
    if (bestDays.length > 0) {
      calendar += `- 🌙 Благоприятные лунные дни: ${bestDays.join(', ')}\n`;
    }
    if (badDays.length > 0) {
      calendar += `- 🚫 Нельзя сажать: ${badDays.join(', ')}\n`;
    }
    calendar += '\n';
  }

  // Таблица
  let table = '## 📊 ТАБЛИЦА "ЧТО КОГДА ДЕЛАТЬ"\n\n';
  table += 'Культура | Когда сажать | Когда поливать | Когда обрабатывать | Особенности\n';
  table += '---|---|---|---|---\n';

  for (const [key, crop] of Object.entries(CROPS)) {
    const plantTime = `${crop.plantStart.day} ${getMonthName(crop.plantStart.month)} — ${crop.plantEnd.day} ${getMonthName(crop.plantEnd.month)}`;
    const water = crop.waterNeed === 'высокий' ? 'часто, обильно' : crop.waterNeed === 'низкий' ? 'редко, мало' : 'умеренно';
    table += `${crop.name} | ${plantTime} | ${water} | ${crop.care.substring(0, 60)} | ${crop.extra.substring(0, 60)}\n`;
  }

  // Логика
  let logic = `## ⚙️ ЛОГИКА ПРОГРАММЫ (ПРАВИЛА)\n\n`;
  logic += `### КАК ПРОГРАММА РЕШАЕТ — МОЖНО ИЛИ НЕЛЬЗЯ\n\n`;
  logic += `ПРАВИЛО 1: ЕСЛИ температура земли < +8°C → НЕ САЖАТЬ\n`;
  logic += `ПРАВИЛО 2: ЕСЛИ возможны заморозки → ЖДАТЬ\n`;
  logic += `ПРАВИЛО 3: ЕСЛИ тепло стабильно и земля тёплая → МОЖНО\n`;
  logic += `ПРАВИЛО 4: ЕСЛИ есть сомнения → ПРЕДУПРЕДИТЬ\n\n`;
  logic += `### ПРИОРИТЕТЫ (от главного к второстепенному)\n\n`;
  logic += `1. ПОГОДА — температура и заморозки\n`;
  logic += `2. ПРИРОДНЫЕ ПРИЗНАКИ — берёза, одуванчик, яблоня\n`;
  logic += `3. СОЛНЦЕ — длина дня и сезон\n`;
  logic += `4. ЛУНА — растущая или убывающая\n`;
  logic += `5. КАЛЕНДАРЬ — примерные даты\n\n`;
  logic += `### ПРИРОДНЫЕ СИГНАЛЫ\n\n`;
  logic += `- Мать-и-мачеха зацвела → весна началась, готовить грядки\n`;
  logic += `- Берёза распустилась (лист с копейку) → можно сажать картофель\n`;
  logic += `- Одуванчик цветёт → можно сеять морковь, капусту, зелень\n`;
  logic += `- Черёмуха цветёт → возможны похолодания, не торопить теплолюбивые\n`;
  logic += `- Сирень цветёт → тепло устойчивее, можно высаживать рассаду томатов\n`;
  logic += `- Яблоня цветёт → можно сажать огурцы, перец, баклажаны\n`;
  logic += `- Рябина цветёт → настоящее тепло! Огурцы, фасоль, тыквенные\n\n`;
  logic += `### НАРОДНЫЙ КАЛЕНДАРЬ\n\n`;
  FOLK_CALENDAR.forEach(f => {
    logic += `- ${f.name} (${f.date}) — ${f.action}\n`;
  });
  logic += `\n### ЛУННЫЕ ФАЗЫ И ЗНАКИ ЗОДИАКА\n\n`;
  logic += `- Растущая луна → сажать растения, которые дают урожай НАД землёй (томаты, огурцы, капуста)\n`;
  logic += `- Убывающая луна → сажать корнеплоды (картофель, морковь, лук, чеснок)\n`;
  logic += `- Новолуние и полнолуние → ничего не сажать\n\n`;
  logic += `### ПЛОДОРОДНЫЕ И НЕПЛОДОРОДНЫЕ ЗНАКИ ЛУНЫ\n\n`;
  logic += `Плодородные (лучше для посадки): Телец, Рак, Дева, Весы, Скорпион, Козерог, Рыбы\n`;
  logic += `Неплодородные (хуже для посадки): Овен, Близнецы, Лев, Стрелец, Водолей\n`;
  logic += `Лунный календарь рассчитывается математически для любого года — без обновлений.\n\n`;
  logic += `### РАБОТА БЕЗ ИНТЕРНЕТА\n\n`;
  logic += `Если интернета нет — программа использует средние температуры для региона.\n`;
  logic += `Регион: ${climate.name}\n`;
  logic += `Последние заморозки: ${climate.lastFrost.day} ${getMonthName(climate.lastFrost.month)}\n`;
  logic += `Земля прогревается: ${climate.soilWarm.day} ${getMonthName(climate.soilWarm.month)}\n\n`;
  logic += `### РАБОТА С ИНТЕРНЕТОМ\n\n`;
  logic += `Если интернет есть — программа берёт текущую погоду\n`;
  logic += `и уточняет: можно ли сажать СЕГОДНЯ или лучше подождать.\n`;

  return calendar + '\n---\n\n' + table + '\n---\n\n' + logic;
}

export {
  getCropAdvice,
  generateYearPlan,
  detectClimate,
  getMoonPhase,
  getMoonZodiac,
  getLunarDayNumber,
  getLunarDayInfo,
  getLunarDayQuality,
  getBestLunarDays,
  getBadLunarDays,
  parseDate,
  getMonthName,
  formatDate,
};

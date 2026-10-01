export function getMadridDateString(d) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const p = {};
  parts.forEach(pt => p[pt.type] = pt.value);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localToUtcMadrid(year, month, day, hour, minute) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });

  const getLocalStr = (d) => {
    const parts = fmt.formatToParts(d);
    const p = {};
    parts.forEach(pt => p[pt.type] = pt.value);
    let h = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day} ${h}:${p.minute}:00`;
  };
  
  const targetStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
  
  const validMatches = [];
  
  for (let offset = -4; offset <= 4; offset++) {
    const testUtc = new Date(Date.UTC(year, month - 1, day, hour + offset, minute));
    if (getLocalStr(testUtc) === targetStr) {
       validMatches.push(testUtc);
    }
  }

  const uniqueMatches = [];
  const seen = new Set();
  for (const m of validMatches) {
    if (!seen.has(m.getTime())) {
      seen.add(m.getTime());
      uniqueMatches.push(m);
    }
  }

  if (uniqueMatches.length === 0) {
    return { error: 'nonexistent_local_time' };
  } else if (uniqueMatches.length > 1) {
    return { error: 'ambiguous_local_time' };
  } else {
    return { utcDate: uniqueMatches[0].toISOString() };
  }
}

export function calculateExpectedAlarm(checkIn, daysBefore, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    return { error: 'invalid_check_in' };
  }
  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 7) {
    return { error: 'invalid_days_before' };
  }
  let tStr = timeStr;
  if (tStr.length > 5) tStr = tStr.slice(0, 5);
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(tStr)) {
    return { error: 'invalid_alarm_time' };
  }

  const [hourStr, minStr] = tStr.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  const [cYear, cMonth, cDay] = checkIn.split('-').map(Number);
  const checkInDate = new Date(Date.UTC(cYear, cMonth - 1, cDay, 12, 0, 0));
  const targetDate = new Date(checkInDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  
  const tYear = targetDate.getUTCFullYear();
  const tMonth = targetDate.getUTCMonth() + 1;
  const tDay = targetDate.getUTCDate();

  const conversion = localToUtcMadrid(tYear, tMonth, tDay, hour, minute);
  if (conversion.error) {
    return { error: conversion.error };
  }

  return {
    scheduled_local: `${tYear}-${String(tMonth).padStart(2,'0')}-${String(tDay).padStart(2,'0')}T${tStr}:00`,
    scheduled_for: conversion.utcDate,
    alarm_time_trimmed: tStr
  };
}

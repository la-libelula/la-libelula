import ICAL from 'ical.js';

/**
 * Service to fetch and parse external iCal calendars (Airbnb, Booking.com)
 * Using a CORS proxy to bypass cross-origin restrictions.
 */

// We use a public CORS proxy. 
// Note: In production, it's safer to have your own proxy.
// Using a more reliable public proxy
const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://thingproxy.freeboard.io/fetch/'
];

/**
 * Normalizes date strings to YYYY-MM-DD.
 * Handles: 
 * - 20240412
 * - 2024-04-12
 * - 20240412T150000Z
 * - 2024-04-12T15:00:00.000Z
 */
const normalizeDate = (dateStr) => {
  if (!dateStr) return '';
  // Remove hyphens and T/Z to get pure number sequence
  const clean = dateStr.replace(/[-T:Z]/g, '');
  if (clean.length >= 8) {
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
  }
  return dateStr;
};

/**
 * Checks if an event is a real guest booking vs just an administrative block.
 */
const isRealBooking = (summary) => {
  if (!summary) return true;
  const s = summary.toUpperCase();
  // Filter out common "blocked" strings from platforms
  const skipKeywords = ['CLOSED', 'NOT AVAILABLE', 'NO AVAILABLE', 'BLOQUEADO', 'CERRADO', 'UNAVAILABLE'];
  return !skipKeywords.some(key => s.includes(key));
};

/**
 * Fallback regex-based iCal parser if ICAL.js fails or module issues occur.
 */
const manualParseIcal = (icsData, houseId, channelId) => {
  const events = [];
  const eventBlocks = icsData.split('BEGIN:VEVENT');
  
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const dtStartMatch = block.match(/DTSTART;?.*?[:=](\d{8}(T\d{6}Z?)?)/);
    const dtEndMatch = block.match(/DTEND;?.*?[:=](\d{8}(T\d{6}Z?)?)/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const uidMatch = block.match(/UID:(.*)/);

    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    
    // Only add if it's a real booking
    if (dtStartMatch && dtEndMatch && isRealBooking(summary)) {
      const checkIn = normalizeDate(dtStartMatch[1]);
      const checkOut = normalizeDate(dtEndMatch[1]);
      const uid = uidMatch ? uidMatch[1].trim() : `manual-${Math.random()}`;
      
      events.push({
        id: `sync-manual-${channelId}-${uid}-${checkIn}`,
        houseId,
        channelId,
        guestName: summary || (channelId === 'airbnb' ? 'Reserva Airbnb' : 'Reserva Booking'),
        checkIn,
        checkOut,
        isExternal: true,
        status: 'confirmed'
      });
    }
  }
  return events;
};

export const parseIcal = (icsData, houseId, channelId) => {
  try {
    console.log(`[Sync] Parsing ${icsData.length} chars for ${houseId}-${channelId}`);
    
    // Attempt ICAL.js first
    try {
      const jcalData = ICAL.parse(icsData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');
      
      if (vevents.length > 0) {
        console.log(`[Sync] Parsed ${vevents.length} events with ICAL.js`);
        return vevents.map(vevent => {
          const event = new ICAL.Event(vevent);
          if (!event.startDate || !event.endDate) return null;
          
          const summary = event.summary || '';
          if (!isRealBooking(summary)) return null;

          const checkIn = normalizeDate(event.startDate.toString());
          const checkOut = normalizeDate(event.endDate.toString());

          return {
            id: `sync-${channelId}-${event.uid}-${checkIn}`,
            houseId,
            channelId,
            guestName: summary || (channelId === 'airbnb' ? 'Reserva Airbnb' : 'Reserva Booking'),
            checkIn,
            checkOut,
            isExternal: true,
            status: 'confirmed'
          };
        }).filter(b => b !== null);
      }
    } catch (icalError) {
      console.warn(`[Sync] ICAL.js failed, falling back to regex:`, icalError.message);
    }

    // Fallback to manual
    const manualEvents = manualParseIcal(icsData, houseId, channelId);
    console.log(`[Sync] Found ${manualEvents.length} events using manual regex`);
    return manualEvents;

  } catch (error) {
    console.error(`[Sync] Fatal error parsing for ${houseId} - ${channelId}:`, error);
    return [];
  }
};

/**
 * Fetches and parses a single calendar, trying multiple proxies.
 */
export const fetchCalendar = async (url, houseId, channelId) => {
  const cleanUrl = url.trim();
  
  for (const proxy of PROXIES) {
    try {
      console.log(`[Sync] Trying proxy ${proxy} for ${channelId}`);
      const response = await fetch(`${proxy}${encodeURIComponent(cleanUrl)}`);
      
      if (!response.ok) continue;
      
      const text = await response.text();
      
      if (text && (text.includes('BEGIN:VCALENDAR') || text.includes('BEGIN:VEVENT'))) {
        return parseIcal(text, houseId, channelId);
      }
      
      console.warn(`[Sync] Proxy ${proxy} returned invalid content for ${channelId}`);
    } catch (error) {
      console.warn(`[Sync] Proxy ${proxy} failed for ${channelId}:`, error.message);
    }
  }

  console.error(`[Sync] All proxies failed for ${channelId} - ${houseId}`);
  return [];
};

/**
 * Fetches all configured calendars in parallel.
 * @param {Object} syncUrls - The SYNC_URLS config from constants.
 */
export const fetchAllExternalBookings = async (syncUrls) => {
  const promises = [];

  for (const houseId in syncUrls) {
    for (const channelId in syncUrls[houseId]) {
      const url = syncUrls[houseId][channelId];
      if (url) {
        promises.push(fetchCalendar(url, houseId, channelId));
      }
    }
  }

  const results = await Promise.all(promises);
  // Flatten array of arrays
  return results.flat();
};

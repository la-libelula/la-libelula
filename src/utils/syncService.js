import ICAL from 'ical.js';

/**
 * Service to fetch and parse external iCal calendars (Airbnb, Booking.com)
 * Using a CORS proxy to bypass cross-origin restrictions.
 */

// We use a public CORS proxy. 
// Note: In production, it's safer to have your own proxy.
// Using a more reliable public proxy
const PROXY_URL = 'https://corsproxy.io/?';

/**
 * Fallback regex-based iCal parser if ICAL.js fails or module issues occur.
 */
const manualParseIcal = (icsData, houseId, channelId) => {
  const events = [];
  const eventBlocks = icsData.split('BEGIN:VEVENT');
  
  // Skip the first block (VCALENDAR header)
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const dtStartMatch = block.match(/DTSTART;?.*?[:=](\d{8})/);
    const dtEndMatch = block.match(/DTEND;?.*?[:=](\d{8})/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const uidMatch = block.match(/UID:(.*)/);

    if (dtStartMatch && dtEndMatch) {
      const s = dtStartMatch[1];
      const e = dtEndMatch[1];
      const checkIn = `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
      const checkOut = `${e.substring(0, 4)}-${e.substring(4, 6)}-${e.substring(6, 8)}`;
      const uid = uidMatch ? uidMatch[1].trim() : Math.random().toString();
      
      events.push({
        id: `sync-manual-${channelId}-${uid}`,
        houseId,
        channelId,
        guestName: summaryMatch ? summaryMatch[1].trim() : (channelId === 'airbnb' ? 'Reserva Airbnb' : 'Reserva Booking'),
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

          return {
            id: `sync-${channelId}-${event.uid}-${event.startDate.toISODateString()}`,
            houseId,
            channelId,
            guestName: event.summary || (channelId === 'airbnb' ? 'Reserva Airbnb' : 'Reserva Booking'),
            checkIn: event.startDate.toISODateString(),
            checkOut: event.endDate.toISODateString(),
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
 * Fetches and parses a single calendar.
 */
export const fetchCalendar = async (url, houseId, channelId) => {
  try {
    console.log(`[Sync] Fetching ${channelId} for ${houseId}...`);
    // Cleaning URL
    const cleanUrl = url.trim();
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(cleanUrl)}`);
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    
    if (!text || (!text.includes('BEGIN:VCALENDAR') && !text.includes('BEGIN:VEVENT'))) {
      console.warn(`[Sync] Invalid content from ${channelId}. Starts with:`, text.substring(0, 100));
      return [];
    }

    return parseIcal(text, houseId, channelId);
  } catch (error) {
    console.error(`[Sync] Fetch error for ${channelId}:`, error);
    return [];
  }
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

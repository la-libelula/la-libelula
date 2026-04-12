import ICAL from 'ical.js';

/**
 * Service to fetch and parse external iCal calendars (Airbnb, Booking.com)
 * Using a CORS proxy to bypass cross-origin restrictions.
 */

// We use a public CORS proxy. 
// Note: In production, it's safer to have your own proxy.
const PROXY_URL = 'https://api.allorigins.win/raw?url=';

/**
 * Normalizes an iCal string into an array of booking objects compatible with the UI.
 * @param {string} icsData - The RAW iCal string.
 * @param {string} houseId - 'gredos' or 'valles'.
 * @param {string} channelId - 'airbnb' or 'booking'.
 */
export const parseIcal = (icsData, houseId, channelId) => {
  try {
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    return vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      
      // Basic validation: must have start and end
      if (!event.startDate || !event.endDate) return null;

      // The check-out date in iCal is usually the morning of the departure.
      // Our calendar logic handles isWithinInterval, so checkOut is correct as is.
      const checkIn = event.startDate.toISODateString();
      const checkOut = event.endDate.toISODateString();
      
      // Airbnb/Booking iCal summaries are usually generic like "Reserved" or "Airbnb (NOT AVAILABLE)"
      const guestName = event.summary || (channelId === 'airbnb' ? 'Reserva Airbnb' : 'Reserva Booking');

      return {
        id: `sync-${channelId}-${event.uid}-${checkIn}`,
        houseId,
        channelId,
        guestName,
        checkIn,
        checkOut,
        isExternal: true, // Marker for UI
        status: 'confirmed'
      };
    }).filter(b => b !== null);
  } catch (error) {
    console.error(`Error parsing iCal for ${houseId} - ${channelId}:`, error);
    return [];
  }
};

/**
 * Fetches and parses a single calendar.
 */
export const fetchCalendar = async (url, houseId, channelId) => {
  try {
    const response = await fetch(`${PROXY_URL}${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    return parseIcal(text, houseId, channelId);
  } catch (error) {
    console.error(`Failed to fetch calendar from ${channelId}:`, error);
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

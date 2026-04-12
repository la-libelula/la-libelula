export const HOUSES = [
  { id: 'gredos', name: 'La Libélula de Gredos', color: 'primary' },
  { id: 'valles', name: 'La Libélula de Valles', color: 'secondary' }
];

export const SYNC_URLS = {
  gredos: {
    booking: 'https://ical.booking.com/v1/export?t=9e96db61-32ff-462e-9034-2ceae4ddb14c',
    airbnb: 'https://www.airbnb.com/calendar/ical/899231505799567099.ics?t=826d625b291549aba3a3e6da82988a9c&locale=es'
  },
  valles: {
    booking: 'https://ical.booking.com/v1/export?t=004431a2-15e5-4032-9b03-2a6cfd4c9c16',
    airbnb: 'https://www.airbnb.com/calendar/ical/1552317374211319118.ics?t=924fdca742fe4c2a938c4af9b5179d63&locale=es'
  }
};

export const CHANNELS = [
  { id: 'booking', name: 'Booking.com', commission: 0.15 },
  { id: 'airbnb', name: 'Airbnb', commission: 0.15 },
  { id: 'web', name: 'Web Propia', commission: 0.0 },
  { id: 'direct', name: 'Directo/Otro', commission: 0.0 }
];

export const EXPENSE_CATEGORIES = [
  { id: 'cleaning', name: 'Limpieza', icon: 'Sparkles' },
  { id: 'electricity', name: 'Luz', icon: 'Zap' },
  { id: 'firewood', name: 'Leña', icon: 'Flame' },
  { id: 'ibi', name: 'IBI', icon: 'Landmark' },
  { id: 'waste', name: 'Basuras', icon: 'Trash2' },
  { id: 'water', name: 'Agua', icon: 'Droplets' },
  { id: 'insurance', name: 'Seguros', icon: 'Shieldcheck' },
  { id: 'heating', name: 'Calefacción', icon: 'Thermometer' },
  { id: 'maintenance', name: 'Mantenimiento', icon: 'Hammer' },
  { id: 'other', name: 'Otros', icon: 'MoreHorizontal' }
];

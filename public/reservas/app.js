const supabaseUrl = 'https://bclwefmdnjtrqitokmey.supabase.co';
const supabaseKey = 'sb_publishable_lkRqb-MVD02sFLmB5ZoTrw_7wrOCYNC';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentHouse = 'gredos';
let selectedStartDate = null;
let selectedEndDate = null;
let currentMonth = new Date();
let bookedDates = [];
let calendarSettings = [];

// Elementos DOM
const calendarEl = document.getElementById('calendar');
const monthTitle = document.getElementById('current-month');
const houseDisplayName = document.getElementById('house-display-name');
const selectedDatesInput = document.getElementById('selected-dates');
const bookingForm = document.getElementById('booking-form');
const btnSubmit = document.getElementById('btn-submit');
const bookingCard = document.getElementById('booking-card');
const successScreen = document.getElementById('success-screen');
const bizumRef = document.getElementById('bizum-ref');

// Límite dinámico de seguridad: 2 años desde hoy
const MAX_BOOKING_DATE = new Date();
MAX_BOOKING_DATE.setDate(MAX_BOOKING_DATE.getDate() + 730);

const PRICES = {
    weekday: 185,    // Valor inicial (se actualizará desde DB)
    weekly: 960,
    monthly: 2200
};

// Cargar precios reales desde la base de datos de casas
async function initPrices(houseId) {
    try {
        const { data, error } = await supabase.from('houses').select('*').eq('id', houseId).single();
        if (data && !error) {
            PRICES.weekday = data.price_night;
            PRICES.weekly = data.price_weekly;
            PRICES.monthly = data.price_monthly;
            console.log(`Precios cargados para ${houseId}:`, PRICES);
        }
    } catch (e) {
        console.error("Error cargando precios base:", e);
    }
}

// Escuchar cambios en la política de cancelación
document.addEventListener('change', (e) => {
    if (e.target.name === 'cancellation_policy') {
        // Estilizar los chips según selección
        document.querySelectorAll('.policy-chip').forEach(chip => {
            chip.classList.toggle('active', chip.contains(e.target));
        });
        updateDateInput();
    }
});

// Event Listeners
document.querySelectorAll('.house-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget;
        document.querySelectorAll('.house-tab').forEach(t => t.classList.remove('active'));
        targetTab.classList.add('active');
        currentHouse = targetTab.dataset.house;
        
        // Actualizar título dinámico
        const houseName = targetTab.querySelector('span').innerText;
        houseDisplayName.innerHTML = `Consultando disponibilidad para: <strong style="color: var(--primary);">La Libélula de ${houseName}</strong>`;
        
        loadBookings();
    });
});

document.getElementById('prev-month').onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
};

document.getElementById('next-month').onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
};

bookingForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedStartDate || !selectedEndDate) {
        alert('Por favor selecciona las fechas en el calendario');
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="loader"></span>Enviando...';

    const guestName = document.getElementById('guest-name').value;
    const guestPhone = document.getElementById('guest-phone').value;
    const policy = document.querySelector('input[name="cancellation_policy"]:checked').value;

    const totalCalculated = parseInt(bookingForm.dataset.total) || 0;
    const depositRequired = parseInt(bookingForm.dataset.deposit) || 50;

    const policyLabel = policy === 'non_refundable' ? 'AHORRO' : 'ESTANDAR';

    const bookingData = {
        check_in: selectedStartDate,
        check_out: selectedEndDate,
        house_id: currentHouse,
        guest_name: `${guestName} (Tel: ${guestPhone}) [${policyLabel}]`,
        channel_id: 'web',
        total_amount: totalCalculated,
        net_income: depositRequired,
        deposit: depositRequired,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient.from('bookings').insert([bookingData]);
        if (error) throw error;

        // Enviar notificación a Telegram
        sendTelegramNotification(bookingData, guestName, guestPhone, policy);

        // Mostrar éxito
        bookingCard.classList.add('hidden');
        successScreen.classList.remove('hidden');
        successScreen.style.display = 'block';
        
        // Personalizar mensaje de éxito en la WEB
        const successContent = document.getElementById('success-dynamic-content');
        const firstName = guestName.trim().split(' ')[0];
        const houseDisplayName = currentHouse === 'valles' ? 'La Libélula de Valles' : 'La Libélula de Gredos';
        const depositAmount = parseInt(bookingForm.dataset.deposit) || 50;
        
        successContent.innerHTML = `
            <div style="text-align: center;">
                <h2 style="font-size: 1.8rem; color: var(--primary); margin-bottom: 1.5rem; font-family: 'Noto Serif', serif; font-weight: 800;">🎉 ¡Solicitud enviada, ${firstName}!</h2>
                
                <p style="font-size: 1.1rem; line-height: 1.6; color: var(--on-surface-variant); margin-bottom: 1.5rem;">
                    Gracias por tu reserva en <strong>${houseDisplayName}</strong>.
                </p>
                
                <p style="font-size: 1.1rem; line-height: 1.6; color: var(--on-surface-variant); font-weight: 600;">
                    Para confirmar tu reserva necesito que realices el bizum de <strong>${depositAmount}€</strong> en las próximas 24 horas.
                </p>
            </div>
        `;
        
    } catch (err) {
        alert('Error al enviar la reserva: ' + err.message);
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'RESERVAR';
    }
};

// Funciones
// Funciones de utilidad para fechas
function formatLocalDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateSpanish(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${parseInt(day)} de ${months[parseInt(month) - 1]}`;
}

function formatRangeSpanish(startStr, endStr) {
    if (!startStr || !endStr) return '';
    const [y1, m1, d1] = startStr.split('-');
    const [y2, m2, d2] = endStr.split('-');
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    
    if (m1 === m2) {
        return `${parseInt(d1)} al ${parseInt(d2)} de ${months[parseInt(m1) - 1]} de ${y1}`;
    } else {
        return `${parseInt(d1)} de ${months[parseInt(m1) - 1]} al ${parseInt(d2)} de ${months[parseInt(m2) - 1]} de ${y1}`;
    }
}

function formatDateEuropean(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
}

async function sendTelegramNotification(booking, guestName, guestPhone, policy) {
    const token = '8652219291:AAH9cRDpStBD4dbU9sb2PisIxIvvSxL6LG4';
    const chatId = '8625244917';
    
    const houseName = booking.house_id === 'gredos' ? 'La Libélula de Gredos' : 'La Libélula de Valles';
    const policyText = policy === 'non_refundable' ? '❌ NO REEMBOLSABLE (-10%)' : '✅ ESTÁNDAR (Con devolución)';
    const paymentExpected = policy === 'non_refundable' ? `${booking.total_amount}€ (100%)` : `50€ (Señal)`;

    // Formatear fechas para los mensajes
    const dateRange = formatRangeSpanish(booking.check_in, booking.check_out);
    const checkInEuro = formatDateEuropean(booking.check_in);
    const checkOutEuro = formatDateEuropean(booking.check_out);

    // Preparar link de WhatsApp con el mensaje largo y profesional de Mayte
    const cleanPhone = guestPhone.replace(/\D/g, '');
    const whatsappPhone = cleanPhone.length === 9 ? '34' + cleanPhone : cleanPhone;
    
    // Extraer solo el primer nombre para un trato más cercano
    const firstName = guestName.trim().split(' ')[0];
    
    const waText = `🎉 ¡Muchas gracias ${firstName} por tu reserva en ${houseName} del ${dateRange}!

Soy Mayte, propietaria de la casa. Para confirmar tu reserva necesito que realices el bizum de ${booking.deposit}€ en las próximas 24 horas. Si no, la reserva no será confirmada.

Cuando se aproxime la fecha de llegada, te escribiré para darte información de la casa y zona. Hasta entonces, si tienes alguna pregunta, no dudes en contactarme.

Mayte: 621 035 482`;

    const waLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(waText)}`;

    const message = `
🛎 *¡NUEVA SOLICITUD DE RESERVA!*
--------------------------------
👤 *Cliente:* ${guestName}
📞 *Teléfono:* ${guestPhone}
🏠 *Casa:* ${houseName}
📅 *Entrada:* ${checkInEuro}
📅 *Salida:* ${checkOutEuro}
--------------------------------
💎 *TARIFA:* ${policyText}
💰 *PAGO EXPECTADO:* ${paymentExpected}
💰 *TOTAL ESTANCIA:* ${booking.total_amount}€
--------------------------------
💬 [Enviar WhatsApp de Mayte](${waLink})
🔗 [Llamar al cliente](tel:${guestPhone})
    `;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('Error enviando Telegram:', e);
    }
}

async function loadBookings() {
    try {
        const { data, error } = await supabaseClient
            .from('bookings')
            .select('check_in, check_out')
            .eq('house_id', currentHouse);
            
        if (error) throw error;
        
        bookedDates = data || [];
        
        // Cargar también los ajustes dinámicos
        const { data: sData, error: sError } = await supabaseClient
            .from('calendar_settings')
            .select('*')
            .eq('house_id', currentHouse);
        
        if (!sError) calendarSettings = sData || [];
        
        // Cargar precios dinámicos antes de renderizar
        await initPrices(currentHouse);
        
        renderCalendar();
    } catch (err) {
        console.error('Error loading bookings:', err);
    }
}

function renderCalendar() {
    calendarEl.innerHTML = '';
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    monthTitle.innerText = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentMonth);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Ajustar primer día (Lunes = 0)
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;

    // Cabecera días
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day';
        el.style.fontWeight = '700';
        el.style.color = 'var(--outline)';
        el.innerText = d;
        calendarEl.appendChild(el);
    });

    // Celdas vacías
    for (let i = 0; i < startOffset; i++) {
        calendarEl.appendChild(document.createElement('div'));
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatLocalDate(date);
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.innerText = day;

        // Verificar si está ocupado
        const isBooked = bookedDates.some(b => {
            return dateStr >= b.check_in && dateStr < b.check_out;
        });

        const isPast = date < today;
        const isTooFar = date >= MAX_BOOKING_DATE;

        // Verificar bloqueo manual del dueño
        const manualSetting = calendarSettings.find(s => s.date === dateStr);
        const isManuallyBlocked = manualSetting && manualSetting.is_blocked;

        if (isBooked || isPast || isTooFar || isManuallyBlocked) {
            dayEl.classList.add('disabled');
            if (isBooked) dayEl.classList.add('booked');
            if (isPast) dayEl.classList.add('past');
            if (isManuallyBlocked) dayEl.classList.add('manual-blocked');
        } else {
            dayEl.onclick = () => selectDate(dateStr);
            
            if (dateStr === selectedStartDate) dayEl.classList.add('selected');
            if (selectedStartDate && selectedEndDate && dateStr >= selectedStartDate && dateStr <= selectedEndDate) {
                dayEl.classList.add('selected');
            }
        }

        if (date.getTime() === today.getTime()) dayEl.classList.add('today');

        calendarEl.appendChild(dayEl);
    }
}

function selectDate(dateStr) {
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
        selectedStartDate = dateStr;
        selectedEndDate = null;
    } else {
        if (dateStr < selectedStartDate) {
            selectedStartDate = dateStr;
        } else {
            selectedEndDate = dateStr;
        }
    }
    
    updateDateInput();
    renderCalendar();
}

function calculateStayPrice(startDate, endDate, policy = 'standard') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Verificar si hay un mínimo de estancia especial para estas fechas
    let minStayRequired = 2;
    for (let i = 0; i < nights; i++) {
        let checkDate = new Date(start);
        checkDate.setDate(checkDate.getDate() + i);
        const dateStr = formatLocalDate(checkDate);
        const setting = calendarSettings.find(s => s.date === dateStr);
        if (setting && setting.min_stay > minStayRequired) {
            minStayRequired = setting.min_stay;
        }
    }

    if (nights < minStayRequired) return { error: `Mínimo ${minStayRequired} noches para estas fechas`, total: 0 };
    
    // Si hay un PRECIO MANUAL en alguna de las noches, se inhabilita el pack de semana/mes
    let hasManualPrice = false;
    for (let i = 0; i < nights; i++) {
        let checkDate = new Date(start);
        checkDate.setDate(checkDate.getDate() + i);
        const dateStr = formatLocalDate(checkDate);
        if (calendarSettings.find(s => s.date === dateStr && s.price_override)) {
            hasManualPrice = true;
            break;
        }
    }

    // Ofertas por volumen (solo si no hay precios manuales)
    let baseTotal = 0;
    if (!hasManualPrice) {
        if (nights >= 28) baseTotal = PRICES.monthly;
        else if (nights >= 6) baseTotal = PRICES.weekly;
    }

    if (baseTotal === 0) {
        // Cálculo noche a noche
        let tempDate = new Date(start);
        for (let i = 0; i < nights; i++) {
            const dateStr = formatLocalDate(tempDate);
            const manualSetting = calendarSettings.find(s => s.date === dateStr);
            if (manualSetting && manualSetting.price_override) {
                baseTotal += manualSetting.price_override;
            } else {
                baseTotal += PRICES.weekday;
            }
            tempDate.setDate(tempDate.getDate() + 1);
        }
    }

    // Aplicar descuento por política
    let finalTotal = baseTotal;
    if (policy === 'non_refundable') {
        finalTotal = baseTotal * 0.9;
    }

    return { total: Math.round(finalTotal), nights, detail: `${nights} noches`, originalTotal: baseTotal };
}

function updateDateInput() {
    const priceDisplay = document.getElementById('price-summary');
    const noticeEl = document.getElementById('pre-booking-notice');
    
    if (selectedStartDate && selectedEndDate) {
        selectedDatesInput.value = `${selectedStartDate} al ${selectedEndDate}`;
        const policy = document.querySelector('input[name="cancellation_policy"]:checked').value;
        
        const calculation = calculateStayPrice(selectedStartDate, selectedEndDate, policy);
        if (calculation.error) {
            priceDisplay.innerHTML = `<span style="color: #ef4444; font-weight: 700;">⚠️ ${calculation.error}</span>`;
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = 0.5;
        } else {
            const isNonRef = policy === 'non_refundable';
            const deposit = isNonRef ? calculation.total : 50;

            priceDisplay.innerHTML = `
                <div class="price-box">
                    ${isNonRef ? `<div class="price-row" style="color: #e11d48; font-weight: bold;"><span>Ahorro aplicado:</span> <span>-10%</span></div>` : ''}
                    <div class="price-row"><span>Estancia (${calculation.detail}):</span> <strong>${calculation.total}€</strong></div>
                    <div class="price-row"><span>Pago requerido (Bizum):</span> <strong>${deposit}€</strong></div>
                    <div class="price-total">TOTAL: ${calculation.total}€</div>
                </div>
            `;

            btnSubmit.disabled = false;
            btnSubmit.style.opacity = 1;
            bookingForm.dataset.total = calculation.total;
            bookingForm.dataset.deposit = deposit;
        }
    } else if (selectedStartDate) {
        selectedDatesInput.value = `Desde ${selectedStartDate}...`;
        priceDisplay.innerHTML = '<i>Selecciona la fecha de salida</i>';
    } else {
        selectedDatesInput.value = '';
        priceDisplay.innerHTML = '';
    }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const houseParam = params.get('casa') || params.get('house');
    
    if (houseParam) {
        const targetHouse = houseParam.toLowerCase();
        const tab = document.querySelector(`.house-tab[data-house="${targetHouse}"]`);
        
        if (tab) {
            // Eliminar active de todos y poner en el elegido
            document.querySelectorAll('.house-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentHouse = targetHouse;
            
            // Actualizar título
            const houseName = tab.querySelector('span').innerText;
            houseDisplayName.innerHTML = `Consultando disponibilidad para: <strong style="color: var(--primary);">La Libélula de ${houseName}</strong>`;
        }
    }
    
    loadBookings();
});


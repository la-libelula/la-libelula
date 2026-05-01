import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db_viajeros } from '../lib/firebase_viajeros';
import { collection, addDoc } from 'firebase/firestore';
import { HOUSES, CHANNELS } from '../utils/constants';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [bookings, setBookings] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [calendarSettings, setCalendarSettings] = useState([]);
    const [houses, setHouses] = useState(HOUSES); // Iniciar con los nombres por defecto
    const [loading, setLoading] = useState(true);
    const [isSettingsAuthorized, setIsSettingsAuthorized] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: bData, error: bError } = await supabase.from('bookings').select('*').order('check_in', { ascending: false });
            const { data: eData, error: eError } = await supabase.from('expenses').select('*').order('date', { ascending: false });

            if (bError) throw bError;
            if (eError) throw eError;

            setBookings(bData || []);
            setExpenses(eData || []);

            const { data: sData, error: sError } = await supabase.from('calendar_settings').select('*');
            if (!sError) setCalendarSettings(sData || []);

            const { data: hData, error: hError } = await supabase.from('houses').select('*');
            if (!hError && hData && hData.length > 0) {
                // Combinar datos de DB (precios) con metadatos de UI (colores)
                const mergedHouses = hData.map(dbHouse => {
                    const constantsInfo = HOUSES.find(h => h.id === dbHouse.id) || {};
                    return { ...constantsInfo, ...dbHouse };
                });
                setHouses(mergedHouses);
            }

            // Handle migration if needed
            const localBookingsJSON = localStorage.getItem('bookings');
            const localExpensesJSON = localStorage.getItem('expenses');

            if (localBookingsJSON || localExpensesJSON) {
                const localBookings = JSON.parse(localBookingsJSON || '[]');
                const localExpenses = JSON.parse(localExpensesJSON || '[]');

                if ((localBookings.length > 0 && (!bData || bData.length === 0)) ||
                    (localExpenses.length > 0 && (!eData || eData.length === 0))) {
                    await migrateData(localBookings, localExpenses);
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const migrateData = async (localB, localE) => {
        console.log('Migrando datos a Supabase...');
        try {
            if (localB && localB.length > 0) {
                const preparedB = localB.map(({ id: _, ...rest }) => ({
                    check_in: rest.checkIn || rest.check_in,
                    check_out: rest.checkOut || rest.check_out,
                    house_id: rest.houseId || rest.house_id,
                    guest_name: rest.guestName || rest.guest_name,
                    channel_id: rest.channelId || rest.channel_id,
                    total_amount: parseFloat(rest.totalAmount || rest.total_amount) || 0,
                    net_income: parseFloat(rest.netIncome || rest.net_income) || 0,
                    deposit: parseFloat(rest.deposit || rest.deposit) || 0
                }));
                await supabase.from('bookings').insert(preparedB);
            }

            if (localE && localE.length > 0) {
                const preparedE = localE.map(({ id: _, ...rest }) => ({
                    date: rest.date,
                    house_id: rest.houseId || rest.house_id,
                    category_id: rest.categoryId || rest.category_id,
                    amount: parseFloat(rest.amount) || 0,
                    description: rest.description
                }));
                await supabase.from('expenses').insert(preparedE);
            }

            // Clear localStorage after migration
            localStorage.removeItem('bookings');
            localStorage.removeItem('expenses');

            // Refresh
            await fetchData();
        } catch (error) {
            console.error('Migration failed:', error);
        }
    };

    const [audioEnabled, setAudioEnabled] = useState(false);
    const [visualNotification, setVisualNotification] = useState(null);
    const audioContextRef = React.useRef(null);

    useEffect(() => {
        fetchData();

        // Listener en tiempo real para nuevas reservas de la web
        const channel = supabase
            .channel('public:bookings')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'bookings',
                filter: 'channel_id=eq.web' 
            }, (payload) => {
                console.log('¡Nueva reserva web recibida!', payload);
                if (audioEnabled) {
                    playNotificationSound();
                }
                setVisualNotification(payload.new);
                fetchData(); // Refrescar lista
            })
            .subscribe();

        // Intentar inicializar contexto de audio en el primer clic si el usuario lo desea
        const enableAudioOnInteraction = () => {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
        };

        window.addEventListener('click', enableAudioOnInteraction, { once: true });
        window.addEventListener('touchstart', enableAudioOnInteraction, { once: true });

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('click', enableAudioOnInteraction);
            window.removeEventListener('touchstart', enableAudioOnInteraction);
        };
    }, [audioEnabled, fetchData]);

    const toggleAudio = async () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        
        setAudioEnabled(!audioEnabled);
    };

    const playNotificationSound = async () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const playBeep = (time, freq = 880) => {
                const oscillator = audioContextRef.current.createOscillator();
                const gainNode = audioContextRef.current.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContextRef.current.destination);

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, time);
                gainNode.gain.setValueAtTime(0.1, time);
                gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

                oscillator.start(time);
                oscillator.stop(time + 0.2);
            };

            const now = audioContextRef.current.currentTime;
            playBeep(now);
            playBeep(now + 0.3);
            playBeep(now + 0.6, 1100); // El último más agudo
        } catch (e) {
            console.error('Error al reproducir sonido:', e);
        }
    };

    // Bookings Actions
    const addBooking = async (bookingData) => {
        const dbData = {
            check_in: bookingData.checkIn,
            check_out: bookingData.checkOut,
            house_id: bookingData.houseId,
            guest_name: bookingData.guestName,
            channel_id: bookingData.channelId,
            total_amount: parseFloat(bookingData.totalAmount) || 0,
            net_income: parseFloat(bookingData.netIncome) || 0,
            deposit: parseFloat(bookingData.deposit) || 0
        };
        const { error } = await supabase.from('bookings').insert([dbData]);
        if (error) console.error(error);
        else fetchData();
    };

    const updateBooking = async (id, updatedData) => {
        const dbData = {
            check_in: updatedData.checkIn,
            check_out: updatedData.checkOut,
            house_id: updatedData.houseId,
            guest_name: updatedData.guestName,
            channel_id: updatedData.channelId,
            total_amount: parseFloat(updatedData.totalAmount) || 0,
            net_income: parseFloat(updatedData.netIncome) || 0,
            deposit: parseFloat(updatedData.deposit) || 0
        };
        const { error } = await supabase.from('bookings').update(dbData).eq('id', id);
        if (error) console.error(error);
        else fetchData();
    };

    const deleteBooking = async (id) => {
        const { error } = await supabase.from('bookings').delete().eq('id', id);
        if (error) console.error(error);
        else fetchData();
    };

    const sendToViajeros = async (booking) => {
        console.log('DEBUG - Datos de la reserva a enviar:', booking);
        try {
            // Mapeo de casa a código de establecimiento
            const houseCodes = {
                'gredos': '0000376379',
                'valles': '0000375938'
            };

            const houseCode = houseCodes[booking.houseId] || '';
            if (!houseCode) throw new Error('Código de casa no encontrado');

            // Generar referencia (AAAAMMDDx, donde x es G o V)
            const refDate = booking.checkIn.replace(/-/g, '');
            const houseLetter = booking.houseId === 'gredos' ? 'G' : 'V';
            const referencia = `${refDate}${houseLetter}`;

            // Fecha de contrato (creación original en Supabase)
            // Si por algún motivo no tiene created_at, usamos hoy como backup
            const fechaContrato = booking.created_at 
                ? new Date(booking.created_at).toISOString().split('T')[0] 
                : new Date().toISOString().split('T')[0];

            // Mapeo de Tipo de Pago
            let tipoPago = 'MOVIL'; // Bizum por defecto solicitado
            if (['booking', 'airbnb'].includes(booking.channelId)) {
                tipoPago = 'PLATF'; // Plataforma para externas
            }

            const registrationData = {
                referencia,
                codigoEstablecimiento: houseCode,
                fechaContrato,
                fechaEntrada: booking.checkIn,
                fechaSalida: booking.checkOut,
                numPersonas: 8, // Valor por defecto solicitado
                numHabitaciones: 1, // Siempre 1 para alquiler íntegro
                titular: booking.guestName,
                tipoPago,
                fechaPago: booking.checkIn,
                medioPago: 'Sincronizado desde Gestión',
                created_at: new Date().toISOString()
            };

            await addDoc(collection(db_viajeros, 'bookings'), registrationData);
            return { success: true };
        } catch (error) {
            console.error('Error enviando a Registro:', error);
            return { success: false, error: error.message };
        }
    };

    // Expenses Actions
    const addExpense = async (expenseData) => {
        const dbData = {
            date: expenseData.date,
            house_id: expenseData.houseId,
            category_id: expenseData.categoryId,
            amount: parseFloat(expenseData.amount) || 0,
            description: expenseData.description
        };
        const { error } = await supabase.from('expenses').insert([dbData]);
        if (error) console.error(error);
        else fetchData();
    };

    const updateExpense = async (id, updatedData) => {
        const dbData = {
            date: updatedData.date,
            house_id: updatedData.houseId,
            category_id: updatedData.categoryId,
            amount: parseFloat(updatedData.amount) || 0,
            description: updatedData.description
        };
        const { error } = await supabase.from('expenses').update(dbData).eq('id', id);
        if (error) console.error(error);
        else fetchData();
    };

    const deleteExpense = async (id) => {
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) console.error(error);
        else fetchData();
    };

    const updateCalendarSetting = async (setting) => {
        const { error } = await supabase.from('calendar_settings').upsert([setting]);
        if (error) console.error(error);
        else fetchData();
    };

    const updateBulkCalendarSettings = async (settingsArray) => {
        const { error } = await supabase.from('calendar_settings').upsert(settingsArray);
        if (error) console.error(error);
        else fetchData();
    };

    const updateHouseSettings = async (houseId, data) => {
        try {
            const { error } = await supabase.from('houses').update(data).eq('id', houseId);
            if (error) {
                console.error('Error en Supabase:', error);
                throw error;
            }
            await fetchData(); // Esperar a que los datos nuevos lleguen
        } catch (error) {
            console.error('updateHouseSettings failed:', error);
            throw error;
        }
    };

    const deleteBulkCalendarSettings = async (houseId, startDate, endDate, selectedWeekdays) => {
        // En Supabase/PostgREST no hay un delete masivo con filtro de día de semana complejo en una sola query
        // así que primero identificamos las fechas exactas a borrar
        const start = new Date(startDate);
        const end = new Date(endDate);
        const datesToDelete = [];
        let temp = new Date(start);

        const formatLocalDate = (date) => {
            const d = new Date(date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        while (temp <= end) {
            const dayOfWeek = temp.getDay(); 
            const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            if (selectedWeekdays[adjustedDay]) {
                datesToDelete.push(formatLocalDate(temp));
            }
            temp.setDate(temp.getDate() + 1);
        }

        if (datesToDelete.length === 0) return;

        const { error } = await supabase.from('calendar_settings')
            .delete()
            .eq('house_id', houseId)
            .in('date', datesToDelete);
            
        if (error) console.error(error);
        else fetchData();
    };

    const deleteCalendarSetting = async (houseId, date) => {
        const { error } = await supabase.from('calendar_settings')
            .delete()
            .eq('house_id', houseId)
            .eq('date', date);
        if (error) console.error(error);
        else fetchData();
    };

    const getHouseBookings = (houseId) => {
        return (adaptedBookings || []).filter(b => b.houseId === houseId);
    };

    // Adapt database fields to camelCase for the UI components
    const adaptedBookings = (bookings || []).map(b => ({
        ...b,
        checkIn: b.check_in || '',
        checkOut: b.check_out || '',
        houseId: b.house_id || '',
        guestName: b.guest_name || '',
        channelId: b.channel_id || '',
        totalAmount: b.total_amount || 0,
        netIncome: b.net_income || 0,
        deposit: b.deposit || 0
    }));

    const adaptedExpenses = (expenses || []).map(e => ({
        ...e,
        houseId: e.house_id || '',
        categoryId: e.category_id || ''
    }));

    return (
        <AppContext.Provider
            value={{
                bookings: adaptedBookings,
                expenses: adaptedExpenses,
                loading,
                addBooking,
                updateBooking,
                deleteBooking,
                addExpense,
                updateExpense,
                deleteExpense,
                getHouseBookings,
                sendToViajeros,
                houses,
                channels: CHANNELS,
                audioEnabled,
                toggleAudio,
                visualNotification,
                setVisualNotification,
                calendarSettings,
                updateCalendarSetting,
                updateBulkCalendarSettings,
                updateHouseSettings,
                deleteBulkCalendarSettings,
                deleteCalendarSetting,
                isSettingsAuthorized,
                setIsSettingsAuthorized
            }}
        >
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};

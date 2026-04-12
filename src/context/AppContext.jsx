import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { HOUSES, CHANNELS, SYNC_URLS } from '../utils/constants';
import { fetchAllExternalBookings } from '../utils/syncService';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [bookings, setBookings] = useState([]);
    const [externalBookings, setExternalBookings] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const syncExternal = async () => {
        try {
            setIsSyncing(true);
            const synced = await fetchAllExternalBookings(SYNC_URLS);
            setExternalBookings(synced);
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setIsSyncing(false);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: bData, error: bError } = await supabase.from('bookings').select('*').order('check_in', { ascending: false });
            const { data: eData, error: eError } = await supabase.from('expenses').select('*').order('date', { ascending: false });

            if (bError) throw bError;
            if (eError) throw eError;

            setBookings(bData || []);
            setExpenses(eData || []);

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
                const preparedB = localB.map(({ id, ...rest }) => ({
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
                const preparedE = localE.map(({ id, ...rest }) => ({
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

    useEffect(() => {
        fetchData();
        syncExternal();
    }, []);

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
                bookings: [...adaptedBookings, ...externalBookings],
                expenses: adaptedExpenses,
                loading,
                isSyncing,
                syncExternal,
                addBooking,
                updateBooking,
                deleteBooking,
                addExpense,
                updateExpense,
                deleteExpense,
                getHouseBookings,
                houses: HOUSES,
                channels: CHANNELS
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

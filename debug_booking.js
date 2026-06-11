import { createClient } from '@supabase/supabase-js';
const c = createClient('https://bclwefmdnjtrqitokmey.supabase.co', 'sb_publishable_lkRqb-MVD02sFLmB5ZoTrw_7wrOCYNC');
const {data, error} = await c.from('bookings').select('guest_name, check_in').order('created_at', {ascending: false}).limit(5);
console.log(JSON.stringify(data, null, 2));
process.exit(0);

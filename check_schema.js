import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bclwefmdnjtrqitokmey.supabase.co';
const supabaseAnonKey = 'sb_publishable_lkRqb-MVD02sFLmB5ZoTrw_7wrOCYNC';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  try {
    const { data, error } = await supabase.from('bookings').select().limit(1);
    if (error) {
      console.error('Error fetching bookings:', error);
    } else if (data && data.length > 0) {
      console.log('Keys in bookings table:', Object.keys(data[0]));
    } else {
      console.log('Table seems empty or inaccessible, data was:', data);
    }
  } catch(e) {
    console.error('Catch error:', e);
  }
}

check();

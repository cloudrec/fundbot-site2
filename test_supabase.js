import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://scwnehuyklltcnhgychz.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjd25laHV5a2xsdGNuaGd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTM1NTg3MSwiZXhwIjoyMDQ2OTMxODcxfQ.Ej4rp7VgGbkJIcOf-VJBWBHsKJBhHJdGUoOEaQlvqbE'
);

async function testDB() {
  console.log('🔍 Тестируем подключение к Supabase...');
  
  const { data, error } = await supabase
    .from('api_keys_2025_11_12_05_30')
    .select('*')
    .eq('user_id', 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4');
    
  console.log('📊 Результат:', { data, error });
  
  if (data && data.length > 0) {
    console.log('✅ Найдено ключей:', data.length);
    data.forEach(key => {
      console.log();
    });
  } else {
    console.log('❌ Ключи не найдены');
  }
}

testDB().catch(console.error);

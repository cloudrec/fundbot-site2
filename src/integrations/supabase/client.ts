import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://scwnehuyklltcnhgychz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjd25laHV5a2xsdGNuaGd5Y2h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mjk0ODEsImV4cCI6MjA3ODAwNTQ4MX0.mWi4KCZ3V-OerEKMMee_309kVBvYHm4Nvzv3ey6PsW0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Import the supabase client like this:
// For React:
// import { supabase } from "@/integrations/supabase/client";
// For React Native:
// import { supabase } from "@/src/integrations/supabase/client";

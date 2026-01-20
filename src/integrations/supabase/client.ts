import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rnqbvurxhhxjdwarwmch.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJucWJ2dXJ4aGh4amR3YXJ3bWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MTAyMzAsImV4cCI6MjA4NDQ4NjIzMH0.ZPW3Vv29cKKTF1ecfF2Aftk85-_FpXqpbW8-5ViY5Nk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
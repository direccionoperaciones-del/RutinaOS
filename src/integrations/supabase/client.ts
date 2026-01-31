import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://lrnzxrrjcwkmwwldfdaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxybnp4cnJqY3drbXd3bGRmZGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NDExMzYsImV4cCI6MjA4NTQxNzEzNn0.zvA5k6oUQdsYTQXC3uS76CxBFkvFVjTiaRZkzl9tPPY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
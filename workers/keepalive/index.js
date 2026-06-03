export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/subjects?select=id&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
      }
    );
    console.log(`Keepalive: ${res.status} at ${new Date().toISOString()}`);
  },
};

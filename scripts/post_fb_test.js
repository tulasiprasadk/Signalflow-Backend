(async () => {
  try {
    const body = { pageId: '974834305707134', message: 'Test post from SignalFlow - please ignore.' };
    const res = await fetch('http://localhost:9001/api/social/publish/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('status:', res.status);
    console.log('body:', text);
  } catch (e) {
    console.error('error:', e);
    process.exit(1);
  }
})();

const endpoints = [
  '/api/movies/popular',
  '/api/series/popular',
  '/api/movies/search-list?s=matrix',
  '/api/series/seasons?imdbID=tt0944947',
  '/api/series/episodes?imdbID=tt0944947&season=1',
  '/api/friends',
  '/api/friends/requests/received',
  '/api/friends/requests/sent',
  '/api/friends/request',
  '/api/friends/accept',
  '/api/friends/reject',
  '/api/friends/test-id'
];

async function test() {
  for (const ep of endpoints) {
    try {
      const isPost = ep.endsWith('/request') || ep.endsWith('/accept') || ep.endsWith('/reject');
      const method = isPost ? 'POST' : 'GET';
      const body = isPost ? JSON.stringify({toUid:'test',friendshipId:'test'}) : undefined;
      const res = await fetch('http://localhost:8080' + ep, { 
        method: isPost ? 'POST' : 'GET', 
        headers: { 'Content-Type': 'application/json' }, 
        body: isPost ? JSON.stringify({toUid:'test',friendshipId:'test'}) : undefined 
      });
      const d = await res.json();
      console.log(ep, ':', res.ok ? 'OK' : 'ERROR', d.error || 'OK');
    } catch (e) { console.log('ERROR:', ep, e.message); }
  }
  console.log('Done');
}
test().then(() => console.log('Done'));
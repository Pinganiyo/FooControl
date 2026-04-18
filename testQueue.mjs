const url = 'http://127.0.0.1:8880/api/playqueue/add';
const data = { items: [{"playlistId":"p5069", "itemIndex":2}] };

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
.then(res => res.text())
.then(console.log)
.catch(console.error);

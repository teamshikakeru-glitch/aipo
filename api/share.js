export const config = { runtime: 'edge' };

const SB_URL = 'https://qjffvspnnxyykoyhnazm.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZmZ2c3Bubnh5eWtveWhuYXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTIxMzMsImV4cCI6MjA4Njg4ODEzM30.OqeeMZs73RjKY5POW-naf0dB8sFWfZDUKaKvE99EiBo';

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id  = searchParams.get('id');
  const img = searchParams.get('img'); // 株券画像URL（オプション）

  if (!id) {
    return Response.redirect('https://aipo-tau.vercel.app/', 302);
  }

  let idea = null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/ideas?id=eq.${id}&select=id,name,ticker,score,votes,genre&limit=1`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const data = await res.json();
    if (data && data.length > 0) idea = data[0];
  } catch (e) {}

  if (!idea) {
    return Response.redirect('https://aipo-tau.vercel.app/', 302);
  }

  const appUrl     = `https://aipo-tau.vercel.app/?id=${id}`;
  const score      = parseFloat(idea.score || 50).toFixed(1);
  const name       = idea.name || 'アイデア';
  const ticker     = idea.ticker || 'IDEA';
  const votes      = idea.votes || 0;
  // 株券画像があればそれを、なければロゴ画像を使用
  const ogImageUrl = img || `https://aipo-tau.vercel.app/og-image.png`;
  const title      = `「${name}」${ticker} — あいぽ`;
  const description = `📊 スコア ${score}pt ／ 応援 ${votes}票${idea.genre ? ` ／ ${idea.genre}` : ''} | アイデアIPO市場「あいぽ」`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://aipo-tau.vercel.app/api/share?id=${id}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${ogImageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@aideaipo">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImageUrl}">
</head>
<body>
<script>window.location.replace("${appUrl}");</script>
<a href="${appUrl}">あいぽでこのアイデアを見る →</a>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

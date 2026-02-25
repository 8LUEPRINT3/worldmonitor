/**
 * Cloudflare Pages Function: /api/rss-proxy
 * Adapted from Vercel Edge Function for Women's Rights Monitor
 */

const ALLOWED_DOMAINS = new Set([
  // Core news
  'feeds.bbci.co.uk', 'www.theguardian.com', 'feeds.npr.org', 'news.google.com',
  'www.aljazeera.com', 'rss.cnn.com', 'feeds.reuters.com', 'www.reuters.com',
  'www.bbc.com', 'www.france24.com', 'www.euronews.com', 'rss.dw.com',
  // Women's Rights sources
  'www.unwomen.org', 'www.hrw.org', 'www.amnesty.org', 'www.girlsnotbrides.org',
  'msmagazine.com', 'womensmediacenter.com', 'www.equalitynow.org',
  'www.girlsglobe.org', 'www.awid.org', 'giwps.georgetown.edu',
  'www.womenofcolor.net', 'www.care.org', 'www.globalfundforwomen.org',
  'www.womenslinkworldwide.org', 'www.feministmajority.org',
  'www.reproductiverights.org', 'www.plannedparenthood.org',
  'www.now.org', 'www.catalyst.org', 'www.weforum.org',
  'www.unicef.org', 'www.unfpa.org', 'www.who.int',
  'giwps.georgetown.edu', 'www.icrw.org',
  // International orgs
  'news.un.org', 'www.iaea.org', 'www.crisisgroup.org', 'worldbank.org',
  'www.imf.org', 'www.fao.org',
  // Regional & geopolitical
  'www.cfr.org', 'www.brookings.edu', 'carnegieendowment.org',
  'www.rand.org', 'www.atlanticcouncil.org',
  'english.alarabiya.net', 'www.arabnews.com', 'www.timesofisrael.com',
  'www.scmp.com', 'kyivindependent.com', 'www.thehindu.com',
  'www.premiumtimesng.com', 'www.vanguardngr.com',
  'www.channelnewsasia.com', 'www.africanews.com',
  // Tech
  'techcrunch.com', 'venturebeat.com', 'www.technologyreview.com',
  // Finance
  'finance.yahoo.com', 'www.ft.com',
  // Misc
  'hnrss.org', 'news.ycombinator.com', 'rsshub.app',
]);

function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequest({ request, env }) {
  const corsHeaders = getCorsHeaders();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestUrl = new URL(request.url);
  const feedUrl = requestUrl.searchParams.get('url');

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const parsedUrl = new URL(feedUrl);

    if (!ALLOWED_DOMAINS.has(parsedUrl.hostname)) {
      return new Response(JSON.stringify({ error: 'Domain not allowed', domain: parsedUrl.hostname }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const isGoogleNews = feedUrl.includes('news.google.com');
    const timeout = isGoogleNews ? 20000 : 12000;

    const response = await fetchWithTimeout(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    }, timeout);

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/xml',
        'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=300',
        ...corsHeaders,
      },
    });

  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    console.error('RSS proxy error:', feedUrl, error.message);
    return new Response(JSON.stringify({
      error: isTimeout ? 'Feed timeout' : 'Failed to fetch feed',
      details: error.message,
      url: feedUrl,
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

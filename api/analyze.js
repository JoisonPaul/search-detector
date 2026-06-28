export default async function handler(req, res) {
    delete req.headers['expect']
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let html = '';

  
// Step 1 — Fetch the website HTML via ScrapingBee
  try {
    const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&premium_proxy=false&block_resources=false`
    const response = await fetch(scrapingBeeUrl, {
    signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ScrapingBee error: ${response.status} - ${errText.slice(0, 200)}`);
    }
    html = await response.text();
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('aborted')) {
      return res.status(400).json({ error: 'This website took too long to respond. It may have bot protection or be temporarily down.' });
    }
    if (err.message.includes('ScrapingBee')) {
      return res.status(400).json({ error: 'Could not access this website. It may be protected against automated access.' });
    }
    return res.status(400).json({ error: 'Could not fetch the website: ' + err.message });
  }

  // Step 2 — Fingerprint detection
  const fingerprints = {
    'Algolia': [
      /algolia/i, /instantsearch/i, /algoliasearch/i,
      /cdn\.jsdelivr\.net\/npm\/instantsearch/i,
      /window\.algolia/i, /\.ais-/i
    ],
    'ExpertRec': [
  /expertrec/i, /cdn\.expertrec\.com/i,
  /window\.ExpertRec/i, /er_srch/i, /ercustomsearch/i,
  /expertrec\.com/i, /csearch\.expertrec/i,
  /ci_common\.js/i, /ci_customSearch/i,
  /customsearch\.expertrec/i, /cse\.expertrec/i
], 
    'Klevu': [
      /klevu/i, /js\.klevu\.com/i,
      /window\.klevu_settings/i, /klevu-pt-rs/i
    ],
    'Bloomreach': [
      /bloomreach/i, /braincommerce/i,
      /window\.__bloomreach/i, /br-autosuggest/i
    ],
    'Coveo': [
      /coveo/i, /window\.Coveo/i, /coveo-search/i
    ],
    'Constructor.io': [
      /constructor\.io/i, /cnstrc/i, /window\.Cnstrc/i
    ],
    'Searchspring': [
      /searchspring/i, /snapui\.searchspring\.io/i
    ],
    'Doofinder': [
      /doofinder/i, /cdn\.doofinder\.com/i
    ],
    'Klevu': [
      /klevu/i, /js\.klevu\.com/i
    ],
    'Hawksearch': [
      /hawksearch/i, /window\.HawkSearch/i
    ],
    'Yext': [
      /yext/i, /cdn\.yext\.com/i, /window\.Yext/i
    ],
    'Typesense': [
      /typesense/i, /window\.Typesense/i
    ],
    'Searchanise': [
      /searchanise/i, /cdn\.searchanise\.io/i
    ],
    'Boost Commerce': [
      /boost-sd__/i, /boostcommerce/i,
      /boost-pfs/i, /boostcommerce\.com/i,
      /boost-pfs-filter/i
    ],
    'Doofinder': [
      /doofinder/i, /cdn\.doofinder\.com/i,
      /window\.doofinder/i, /doofinderLayer/i,
      /\.df-search/i
    ],
    'Searchanise': [
      /searchanise/i, /cdn\.searchanise\.io/i,
      /window\.Searchanise/i, /snize/i,
      /searchanise\.com/i
    ],
    'Klevu': [
      /klevu/i, /js\.klevu\.com/i,
      /window\.klevu_settings/i, /klevu-pt-rs/i,
      /klevu\.com/i, /klevusearch/i
    ],
    'Fast Simon': [
      /fastsimon/i, /fast\.a\.cloudflarestorage/i, /window\.FastSimon/i
    ],
    'Shopify Native Search': [
      /shopify/i, /myshopify\.com/i, /Shopify\.theme/i
    ],
    'Elasticsearch': [
      /elasticsearch/i, /elastic\.co/i, /window\._elk/i
    ],
    'Solr': [
      /solr/i, /apache\.solr/i
    ],
  };

  const scores = {};
  for (const [provider, patterns] of Object.entries(fingerprints)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(html)) score += 1;
    }
    if (score > 0) scores[provider] = score;
  }

  // Step 3 — If we have a strong fingerprint match, return it directly
  if (Object.keys(scores).length > 0) {
    const topProvider = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const [provider, score] = topProvider;
    const confidence = Math.min(95, 50 + score * 15);

    return res.status(200).json({
      provider,
      confidence,
      category: getCategory(provider),
      signals: [`${score} fingerprint pattern(s) matched in page source`],
      description: getDescription(provider),
      note: 'Detected via static HTML fingerprinting.',
      website: getWebsite(provider),
      found: true,
    });
  }

  // Step 4 — Fall back to Gemini AI for ambiguous cases
  try {
    const snippet = html.slice(0, 8000);
    const prompt = `You are an expert at identifying which search technology ecommerce websites use.

Analyze this HTML snippet from ${url} and identify the search provider.

HTML:
${snippet}

Common providers: Algolia, Elasticsearch, Searchspring, Bloomreach, Coveo, Constructor.io, Klevu, Hawksearch, Yext, Typesense, Solr, ExpertRec, Doofinder, Fast Simon, Shopify Native Search, or custom/proprietary.

Respond ONLY in this exact JSON format, no markdown, no backticks:
{"provider":"Name","confidence":70,"found":true,"category":"Enterprise SaaS","description":"1-2 sentences about why this site uses this provider.","signals":["signal 1","signal 2"],"note":"How this was determined","website":"https://provider.com"}

If unknown set found:false, provider:"Unknown", confidence:0.`;
    console.log('Gemini API key exists:', !!process.env.GEMINI_API_KEY)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) throw new Error('Gemini API error: ' + geminiData.error.message)
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in Gemini response: ' + text.slice(0, 200));
    const result = JSON.parse(match[0]);

  } catch (err) {
    console.error('Gemini error:', err.message)
    return res.status(200).json({
      provider: 'Unknown',
      confidence: 0,
      found: false,
      category: 'Unknown',
      description: 'Could not determine the search provider for this site.',
      signals: [],
      note: 'No fingerprints matched and AI analysis failed.',
      website: ''
    });
  }
}

function getCategory(provider) {
  const categories = {
    'Algolia': 'Enterprise SaaS',
    'ExpertRec': 'Enterprise SaaS',
    'Klevu': 'Enterprise SaaS',
    'Bloomreach': 'Enterprise SaaS',
    'Coveo': 'Enterprise SaaS',
    'Constructor.io': 'Enterprise SaaS',
    'Searchspring': 'Enterprise SaaS',
    'Doofinder': 'Enterprise SaaS',
    'Hawksearch': 'Enterprise SaaS',
    'Yext': 'Enterprise SaaS',
    'Fast Simon': 'Enterprise SaaS',
    'Typesense': 'Cloud Native',
    'Searchanise': 'Enterprise SaaS',
    'Boost Commerce': 'Enterprise SaaS',
    'Shopify Native Search': 'Proprietary/Custom',
    'Elasticsearch': 'Open Source',
    'Solr': 'Open Source',
  };
  return categories[provider] || 'Unknown';
}

function getDescription(provider) {
  const descriptions = {
    'Algolia': 'Algolia is a leading hosted search API known for its speed and relevance, widely used by large ecommerce sites.',
    'ExpertRec': 'ExpertRec is an AI-powered site search platform that replaces default CMS search with fast, relevant results.',
    'Klevu': 'Klevu is an AI-powered search and discovery platform built specifically for ecommerce.',
    'Bloomreach': 'Bloomreach is an enterprise digital experience platform with powerful product discovery and search capabilities.',
    'Coveo': 'Coveo is an AI-powered relevance platform used by large enterprises for search and recommendations.',
    'Constructor.io': 'Constructor.io is a product discovery platform focused on conversion optimization for ecommerce.',
    'Searchspring': 'Searchspring is an ecommerce search and merchandising platform for mid-market retailers.',
    'Doofinder': 'Doofinder is a fast site search solution popular with small to mid-size ecommerce stores.',
    'Hawksearch': 'Hawksearch is an enterprise search and recommendations platform for ecommerce and B2B.',
    'Yext': 'Yext is a search experience platform that powers both site search and listings management.',
    'Typesense': 'Typesense is an open-source, typo-tolerant search engine designed as a simpler Algolia alternative.',
    'Searchanise': 'Searchanise is a search app popular with Shopify and other ecommerce platforms.',
    'Boost Commerce': 'Boost Commerce is a product filter and search app widely used on Shopify stores.',
    'Fast Simon': 'Fast Simon is an AI shopping optimization platform with search, filters, and merchandising.',
    'Shopify Native Search': 'This site uses Shopify\'s built-in search, which is the default for Shopify stores without a third-party search app.',
    'Elasticsearch': 'Elasticsearch is an open-source search engine often used by larger companies with custom-built search.',
    'Solr': 'Apache Solr is an open-source search platform often used in enterprise and custom-built search solutions.',
  };
  return descriptions[provider] || 'A search provider detected on this site.';
}

function getWebsite(provider) {
  const websites = {
    'Algolia': 'https://www.algolia.com',
    'ExpertRec': 'https://www.expertrec.com',
    'Klevu': 'https://www.klevu.com',
    'Bloomreach': 'https://www.bloomreach.com',
    'Coveo': 'https://www.coveo.com',
    'Constructor.io': 'https://constructor.io',
    'Searchspring': 'https://www.searchspring.com',
    'Doofinder': 'https://www.doofinder.com',
    'Hawksearch': 'https://www.hawksearch.com',
    'Yext': 'https://www.yext.com',
    'Typesense': 'https://typesense.org',
    'Searchanise': 'https://searchanise.io',
    'Boost Commerce': 'https://boostcommerce.net',
    'Fast Simon': 'https://fastsimon.com',
    'Shopify Native Search': 'https://apps.shopify.com/search-discovery',
    'Elasticsearch': 'https://www.elastic.co',
    'Solr': 'https://solr.apache.org',
  };
  return websites[provider] || '';
}
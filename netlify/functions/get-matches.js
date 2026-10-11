const https = require('https');

exports.handler = async (event, context) => {
  try {
    console.log('Fetching Club Brugge matches...');
    const html = await fetchPage('https://www.clubbrugge.be/nl/competition/a-kern/all-matches');

    if (!html || html.length < 1000) {
      throw new Error('Invalid HTML response');
    }

    // Check if we got the security checkpoint instead of real content
    if (html.includes('Vercel Security Checkpoint') || html.includes('Security Challenge')) {
      console.error('Got security checkpoint page instead of real content');
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Website blocked our request - security checkpoint' })
      };
    }

    const matches = parseMatches(html);
    console.log(`Parsed ${matches.length} matches`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        matches,
        count: matches.length,
        lastFetch: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Pragma': 'no-cache'
      }
    };

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(new Error(`Failed to fetch: ${err.message}`));
    });
  });
}

function parseMatches(html) {
  const matches = [];
  let matchId = 1;
  const now = new Date();
  const currentYear = now.getFullYear();

  // Try to find "CLUB BRUGGE VS" patterns with date/time
  const pattern1 = /(\d{1,2})\/(\d{2})\s+(\d{1,2})u(\d{2})\s+(?:[^]*?)CLUB\s+BRUGGE\s+VS\s+([^<\n]+?)(?=\s+TICKETS|\s+VERSLAG|<)/gi;
  const pattern2 = /(\d{1,2})\/(\d{2})\s+(\d{2}):(\d{2})\s+(?:[^]*?)CLUB\s+BRUGGE\s+VS\s+([^<\n]+?)(?=<)/gi;

  const patterns = [pattern1, pattern2];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const hour = parseInt(match[3]);
        const minute = parseInt(match[4]);
        const opponent = match[5].trim();

        if (!opponent || opponent.length < 3 || opponent.includes('CLUB')) continue;

        const date = new Date(currentYear, month - 1, day);
        if (date < now) {
          date.setFullYear(currentYear + 1);
        }

        const dateStr = date.toISOString().split('T')[0];
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        matches.push({
          id: matchId++,
          date: dateStr,
          opponent: opponent.toUpperCase(),
          time: timeStr
        });
      } catch (e) {
        console.error('Parse error:', e.message);
      }
    }

    if (matches.length > 0) {
      console.log(`Pattern matched, found ${matches.length} matches`);
      break;
    }
  }

  if (matches.length === 0) {
    const sampleStart = html.indexOf('CLUB BRUGGE');
    if (sampleStart > -1) {
      const sample = html.substring(Math.max(0, sampleStart - 200), sampleStart + 300);
      console.log('Sample around "CLUB BRUGGE":', sample);
    } else {
      console.log('CLUB BRUGGE not found in HTML');
    }
  }

  return matches;
}

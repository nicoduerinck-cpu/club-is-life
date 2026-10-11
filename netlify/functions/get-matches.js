const https = require('https');

exports.handler = async (event, context) => {
  try {
    console.log('Fetching Club Brugge matches...');
    const html = await fetchPage('https://www.clubbrugge.be/nl/competition/a-kern/all-matches');

    if (!html || html.length < 1000) {
      throw new Error('Invalid HTML response');
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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

  // Search for match patterns: date time ... CLUB BRUGGE VS opponent
  // Pattern: DD/MM HH:MM or DDuHH format
  const pattern = /(\d{1,2})\/(\d{2})\s+(\d{1,2})(?:u|:)(\d{2})[^]*?CLUB\s+BRUGGE\s+VS\s+([A-Z\s]+?)(?=\s+TICKETS|\s+VERSLAG|<|$)/gi;

  let match;

  while ((match = pattern.exec(html)) !== null) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const hour = parseInt(match[3]);
    const minute = parseInt(match[4]);
    const opponent = match[5].trim();

    // Skip if opponent is empty or looks like junk
    if (!opponent || opponent.length < 3) continue;

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
  }

  return matches;
}

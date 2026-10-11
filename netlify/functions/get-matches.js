const https = require('https');
const zlib = require('zlib');

exports.handler = async (event, context) => {
  try {
    console.log('Fetching FotMob Club Brugge matches...');
    const html = await fetchPage('https://www.fotmob.com/teams/8342/fixtures/club-brugge');

    if (!html || html.length < 5000) {
      console.error('Invalid or empty response, length:', html.length);
      throw new Error('Invalid HTML response');
    }

    console.log('HTML received, length:', html.length);

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
        lastFetch: new Date().toISOString(),
        source: 'FotMob'
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
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };

    https.get(url, options, (res) => {
      let chunks = [];

      res.on('data', chunk => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        try {
          let buffer = Buffer.concat(chunks);

          // Handle gzip compression
          if (res.headers['content-encoding'] === 'gzip') {
            zlib.gunzip(buffer, (err, decompressed) => {
              if (err) {
                reject(new Error(`Decompression failed: ${err.message}`));
              } else {
                resolve(decompressed.toString('utf-8'));
              }
            });
          } else {
            resolve(buffer.toString('utf-8'));
          }
        } catch (e) {
          reject(new Error(`Buffer processing failed: ${e.message}`));
        }
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

  // FotMob likely has JSON data embedded in HTML
  // Look for fixture data in JSON format
  const jsonMatch = html.match(/"fixtures":\s*\[(.*?)\]/s);

  if (jsonMatch) {
    try {
      console.log('Found JSON fixtures data, extracting...');
      const jsonStr = '[' + jsonMatch[1] + ']';
      console.log('JSON sample:', jsonStr.substring(0, 200));

      const fixtures = JSON.parse(jsonStr);
      console.log('Parsed fixtures count:', fixtures.length);

      fixtures.forEach((fixture, idx) => {
        try {
          if (fixture.homeTeam && fixture.awayTeam) {
            const isHome = fixture.homeTeam.name && fixture.homeTeam.name.includes('Brugge');
            if (isHome) {
              const date = new Date(fixture.date);
              if (date > now) {
                matches.push({
                  id: matchId++,
                  date: date.toISOString().split('T')[0],
                  opponent: fixture.awayTeam.name || 'Unknown',
                  time: String(date.getHours()).padStart(2, '0') + ':' +
                        String(date.getMinutes()).padStart(2, '0')
                });
              }
            }
          }
        } catch (e) {
          console.log('Fixture error at', idx, ':', e.message);
        }
      });
      console.log('JSON parsing complete, found', matches.length, 'matches');
    } catch (e) {
      console.log('JSON parse error:', e.message);
    }
  }

  // Fallback: regex patterns
  if (matches.length === 0) {
    const pattern = /Club Brugge.*?(\d{2})\/(\d{2}).*?(\d{2}):(\d{2})/gi;
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const hour = parseInt(match[3]);
      const minute = parseInt(match[4]);

      const date = new Date(currentYear, month - 1, day, hour, minute);
      if (date > now) {
        matches.push({
          id: matchId++,
          date: date.toISOString().split('T')[0],
          opponent: 'TBD',
          time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        });
      }
    }
  }

  console.log(`Final: ${matches.length} matches parsed`);
  if (matches.length === 0) {
    console.log('HTML preview:', html.substring(0, 1000));
  }

  return matches;
}

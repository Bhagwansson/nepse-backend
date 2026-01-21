const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const fetchSymbols = async () => {
    console.log("🔍 Scanning for all listed companies...");
    
    try {
        // We hit the live data page because it lists EVERY active company
        const { data } = await axios.get('https://www.sharesansar.com/today-share-price', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });

        const $ = cheerio.load(data);
        const symbols = [];

        // Scrape the table to find symbols
        let tableRows = $('#headFixed tbody tr');
        if (tableRows.length === 0) tableRows = $('table tbody tr');

        tableRows.each((index, element) => {
            const tds = $(element).find('td');
            if (tds.length > 2) {
                // Symbol is usually in the 2nd column (index 1)
                const symbol = $(tds[1]).text().trim();
                
                // Only save if it looks like a real symbol (not empty)
                if (symbol && symbol.length > 1) {
                    symbols.push(symbol);
                }
            }
        });

        // Remove duplicates just in case
        const uniqueSymbols = [...new Set(symbols)];

        console.log(`✅ Found ${uniqueSymbols.length} active companies.`);
        
        // Save to a file so we can use it later
        fs.writeFileSync('symbols.json', JSON.stringify(uniqueSymbols, null, 2));
        console.log("💾 Saved list to 'symbols.json'");

    } catch (error) {
        console.error("❌ Error fetching symbols:", error.message);
    }
};

fetchSymbols();
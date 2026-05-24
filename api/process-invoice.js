// Vercel Serverless Function - Invoice Processing
// This handles the Claude API calls securely from the backend

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { base64Data, mimeType, isExcel, excelText } = req.body;

    if (!base64Data && !excelText) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Get API key from environment variable
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Build the prompt based on file type
    let prompt;
    let content = [];

    if (isExcel) {
      // Excel processing
      prompt = `You are an expert invoice data extractor. Analyze this Excel invoice data carefully and extract ALL information accurately.

Return ONLY a JSON object (no markdown, no backticks, no preamble) with this exact structure:
{
  "vendor": "vendor name",
  "invoiceNumber": "invoice number",
  "date": "YYYY-MM-DD",
  "total": 0.00,
  "items": [
    {
      "name": "product name",
      "quantity": 0,
      "price": 0.00,
      "category": "category"
    }
  ]
}

CRITICAL INSTRUCTIONS:

1. VENDOR NAME:
   - Look at the top of the data for company/business name
   - Common vendors: "Rave Distribution", "Texas Wholesale", "Greenleaf Wholesale", "Frontline Wholesale"
   - DO NOT use "Bill To" or "Ship To" as vendor
   - If not clear, use "Unknown Vendor"

2. INVOICE NUMBER:
   - Look for "Invoice", "Invoice #", "INV", "Order #"
   - For Rave Distribution: format is "INVOICE : 56198"
   - Extract just the number (e.g., "56198")
   - If not found, use null

3. TOTAL AMOUNT (CRITICAL):
   - Find GRAND TOTAL or TOTAL DUE
   - DO NOT use subtotal
   - Look for: "Total", "Grand Total", "Amount Due", "Balance Due"
   - This is the final amount including tax/shipping
   - Use the LARGEST dollar amount at the bottom
   - If no total found, sum all item prices

4. DATE:
   - Look for date field
   - Format as YYYY-MM-DD
   - If missing, use today's date

5. LINE ITEMS:
   - Extract every product line
   - Each needs: name, quantity, unit price
   - Skip header rows
   - Include ALL items

6. CATEGORIZATION (VERY IMPORTANT):
   - **IF VENDOR IS "Texas Wholesale"**: ALL items = "tobacco"
   - For other vendors:
     * "vapes" - vape, e-cig, disposable, juice, pod, JUUL, VUSE, elf bar, puff bar
     * "flowers" - flower, bud, cannabis, marijuana, hemp flower
     * "pre-roll" - pre-roll, preroll, joint
     * "kratom" - kratom
     * "novelties" - lighter, torch, grinder, pipe, paper, wrap
     * "hookah" - hookah, shisha, charcoal
     * "gummies" - gummy, edible, CBD gummy, delta gummy
     * "nitrous" - nitrous, whippet, cream charger
     * "tobacco" - cigarette, cigar, tobacco, dip, snuff
     * "other" - anything else

Excel data:
${excelText}

Extract carefully. Make sure to use GRAND TOTAL not subtotal.`;

      content = [{ type: 'text', text: prompt }];
    } else {
      // Image/PDF processing
      prompt = `You are an expert invoice data extractor. Analyze this smoke shop invoice image carefully and extract ALL information accurately.

Return ONLY a JSON object (no markdown, no backticks, no preamble) with this exact structure:
{
  "vendor": "vendor name",
  "invoiceNumber": "invoice number",
  "date": "YYYY-MM-DD",
  "total": 0.00,
  "items": [
    {
      "name": "product name",
      "quantity": 0,
      "price": 0.00,
      "category": "category"
    }
  ]
}

CRITICAL INSTRUCTIONS:

1. VENDOR NAME DETECTION:
   - Look at the VERY TOP of the invoice for the company name
   - It's usually the LARGEST text at the top
   - Common vendors: "Rave Distribution", "Texas Wholesale", "Greenleaf Wholesale", "Frontline Wholesale"
   - Look in the header/logo area
   - DO NOT use "Bill To" or "Ship To" addresses as vendor
   - The vendor is who SENT the invoice, not who received it

2. INVOICE NUMBER:
   - Look for labels: "Invoice #", "Invoice Number", "INV #", "Order #", "Invoice:", "INVOICE :"
   - For Rave Distribution: format is "INVOICE : 56198" (with spaces and colon)
   - For Texas Wholesale: Look for "Invoice" then the number below it
   - Extract just the number portion (e.g., "56198" not "INVOICE : 56198")
   - If not found, use null

3. TOTAL AMOUNT (MOST IMPORTANT):
   - Find the GRAND TOTAL or TOTAL DUE
   - DO NOT use subtotal
   - Look for labels: "Total", "Grand Total", "Amount Due", "Balance Due", "Total Due"
   - This is usually at the BOTTOM of the invoice
   - This is the LARGEST amount (after tax/shipping)
   - Include tax and shipping in the total
   - Make sure it's the final amount to be paid

4. DATE:
   - Look for "Invoice Date", "Date", "Order Date"
   - Format as YYYY-MM-DD
   - If month is written as name (e.g., "January"), convert to number

5. LINE ITEMS:
   - Extract EVERY product line
   - Each item needs: name, quantity, price (per unit OR total for that line)
   - Look in the main body of the invoice between header and totals
   - Skip header rows (like "Description", "Qty", "Price")
   - Include ALL items, don't skip any

6. CATEGORIZATION (VERY IMPORTANT):
   - **IF VENDOR IS "Texas Wholesale"**: ALL items MUST be "tobacco"
   - For other vendors, categorize based on product name:
     * "vapes" - vape, e-cig, disposable vape, vape juice, pod, JUUL, VUSE, elf bar, puff bar, mod, tank, coil
     * "flowers" - flower, bud, cannabis flower, marijuana flower, hemp flower
     * "pre-roll" - pre-roll, preroll, joint, pre-rolled
     * "kratom" - kratom, mitragyna
     * "novelties" - lighter, torch, grinder, pipe, bong, paper, wrap, accessory
     * "hookah" - hookah, shisha, charcoal, hookah tobacco
     * "gummies" - gummy, gummies, edible, CBD gummy, delta gummy
     * "nitrous" - nitrous, whippet, cream charger, N2O
     * "tobacco" - cigarette, cigar, tobacco, chewing tobacco, dip, snuff, snus
     * "other" - anything that doesn't clearly fit above

   - Use the product NAME to determine category
   - If unsure, use "other"

EXAMPLES OF GOOD EXTRACTION:

Example 1 - Rave Distribution:
- Top of invoice shows "RAVE DISTRIBUTION" in large letters
- Shows "INVOICE : 56198"
- Shows "Subtotal: $450.00", "Tax: $45.00", "TOTAL: $495.00"
- Extract: vendor="Rave Distribution", invoiceNumber="56198", total=495.00 (NOT 450.00)

Example 2 - Texas Wholesale:
- Top shows "Texas Wholesale" 
- All items should be category "tobacco" regardless of product name
- If it says "Grand Total: $800.00", use 800.00 not the subtotal

Example 3 - Line items:
- Invoice shows:
  "Elf Bar 5000 Puff - Blue Razz | Qty: 10 | $8.00 | $80.00"
  Extract: {name: "Elf Bar 5000 Puff - Blue Razz", quantity: 10, price: 8.00, category: "vapes"}

Now extract from this invoice:`;

      const documentType = mimeType.includes('pdf') ? 'document' : 'image';
      
      content = [
        {
          type: documentType,
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ];
    }

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: content
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Claude API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    // Log the raw response for debugging
    console.log('Claude API Response:', JSON.stringify(data, null, 2));
    
    // Extract text from response
    const textContent = data.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');

    console.log('Extracted text content:', textContent);

    // Parse JSON response - try to extract JSON even if there's extra text
    let jsonMatch = textContent.match(/\{[\s\S]*\}/);
    
    // If wrapped in markdown code blocks, remove them
    if (textContent.includes('```json') || textContent.includes('```')) {
      const cleaned = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    }
    
    if (!jsonMatch) {
      console.error('Could not parse JSON from response:', textContent);
      return res.status(500).json({ 
        error: 'Could not parse invoice data',
        rawResponse: textContent.substring(0, 500) // First 500 chars for debugging
      });
    }

    const invoiceData = JSON.parse(jsonMatch[0]);
    
    console.log('Parsed invoice data:', JSON.stringify(invoiceData, null, 2));
    
    // Validate required fields
    if (!invoiceData.vendor) {
      invoiceData.vendor = 'Unknown Vendor';
    }
    if (!invoiceData.total || invoiceData.total === 0) {
      // Calculate total from items if missing
      if (invoiceData.items && invoiceData.items.length > 0) {
        invoiceData.total = invoiceData.items.reduce((sum, item) => {
          return sum + (item.price * item.quantity);
        }, 0);
      }
    }
    if (!invoiceData.items || invoiceData.items.length === 0) {
      invoiceData.items = [];
    }
    
    // Add metadata
    invoiceData.id = Date.now();
    invoiceData.uploadedAt = new Date().toISOString();
    
    // CRITICAL: Force all Texas Wholesale items to tobacco category
    if (invoiceData.vendor && invoiceData.vendor.toLowerCase().includes('texas wholesale')) {
      console.log('Texas Wholesale detected - forcing all items to tobacco category');
      invoiceData.items.forEach(item => {
        item.category = 'tobacco';
      });
    }
    
    // Validate categories for all items
    const validCategories = ['vapes', 'flowers', 'pre-roll', 'kratom', 'novelties', 'hookah', 'gummies', 'nitrous', 'tobacco', 'other'];
    invoiceData.items.forEach(item => {
      if (!item.category || !validCategories.includes(item.category)) {
        console.log(`Invalid category "${item.category}" for item "${item.name}", defaulting to "other"`);
        item.category = 'other';
      }
    });

    console.log('Final invoice data being returned:', JSON.stringify(invoiceData, null, 2));

    // Return the processed invoice data
    return res.status(200).json(invoiceData);

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Failed to process invoice',
      message: error.message 
    });
  }
}

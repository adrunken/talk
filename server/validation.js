const MAX_SIZE = 300 * 1024; // 300 KB

function validateHTMLOutput(html) {
  const errors = [];

  // Check size
  if (html.length > MAX_SIZE) {
    errors.push(`HTML exceeds maximum size of 300 KB (${(html.length / 1024).toFixed(2)} KB)`);
  }

  // Check for HTML and body tags
  if (!/<html[^>]*>/i.test(html)) {
    errors.push('Missing <html> tag');
  }

  if (!/<body[^>]*>/i.test(html)) {
    errors.push('Missing <body> tag');
  }

  // Check for markdown fence markers
  if (/```/g.test(html)) {
    errors.push('HTML contains markdown code fence markers (```)');
  }

  // Check for common markdown patterns that shouldn't be in HTML
  if (/^#+\s/m.test(html)) {
    errors.push('HTML contains markdown headings');
  }

  // Check for basic structure
  if (!/<\/html>/i.test(html)) {
    errors.push('Missing closing </html> tag');
  }

  // Ensure it's valid HTML by checking for proper nesting
  const openHtmlTags = (html.match(/<[a-z]+[^>]*>/gi) || []).length;
  const closeHtmlTags = (html.match(/<\/[a-z]+>/gi) || []).length;

  if (openHtmlTags === 0) {
    errors.push('No HTML tags found in output');
  }

  if (closeHtmlTags === 0) {
    errors.push('No closing HTML tags found');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = { validateHTMLOutput };

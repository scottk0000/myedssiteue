export default function decorate(block) {
  let quote = '';
  let author = '';

  // First try to get from data attributes
  if (block.dataset.quote) {
    quote = block.dataset.quote;
    author = block.dataset.author || '';
  } else {
    // Fallback: parse from existing content
    const children = Array.from(block.children);
    if (children.length >= 1) {
      quote = children[0].textContent.trim();
      author = children.length >= 2 ? children[1].textContent.trim() : '';
    }
  }

  // Sanitize content to prevent XSS
  const sanitizeText = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Use fallback values if still empty
  if (!quote) {
    quote = 'Think, McFly! Think!';
    author = 'Biff Tannen';
  }

  // Build the HTML structure
  const blockquoteEl = document.createElement('blockquote');
  blockquoteEl.innerHTML = sanitizeText(quote);
  
  const citeEl = document.createElement('cite');
  citeEl.innerHTML = sanitizeText(author);

  // Clear existing content and add new elements
  block.innerHTML = '';
  block.appendChild(blockquoteEl);
  if (author) {
    block.appendChild(citeEl);
  }
}
// Enhanced quote block: supports quote and author, accessible, robust, and functional
export default function decorate(block) {
  // Find quote and author from block children
  const quoteText = block.querySelector(':scope > div:first-child')?.textContent.trim() || 'Think, McFly! Think!';
  const authorText = block.querySelector(':scope > div:nth-child(2)')?.textContent.trim();

  // Clear block
  block.innerHTML = '';

  // Create blockquote
  const blockquote = document.createElement('blockquote');
  blockquote.textContent = quoteText;
  block.appendChild(blockquote);

  // Add author if present
  if (authorText) {
    const cite = document.createElement('cite');
    cite.textContent = authorText;
    block.appendChild(cite);
  }
}
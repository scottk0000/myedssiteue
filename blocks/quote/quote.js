export default function decorate(block) {
  const [quoteWrapper] = block.children;

  const blockquote = document.createElement('blockquote');
  const quoteText = quoteWrapper.textContent.trim();
  
  // Use default text if no content is provided
  blockquote.textContent = quoteText || 'Think, McFly! Think!';
  quoteWrapper.replaceChildren(blockquote);
}
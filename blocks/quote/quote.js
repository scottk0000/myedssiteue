export default function decorate(block) {
  // Get quote and author from block dataset or fallback to default
  const quote = block.dataset.quote || 'Think, McFly! Think!';
  const author = block.dataset.author || 'Biff Tannen';

  block.innerHTML = `
    <blockquote>${quote}</blockquote>
    <cite>${author}</cite>
  `;
}
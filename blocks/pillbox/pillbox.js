export default function decorate(block) {
  // Get all pill items from the block
  const pills = [...block.children];
  
  // Wrap all pills in a container
  const pillsContainer = document.createElement('div');
  pillsContainer.className = 'pillbox-container';
  
  pills.forEach((pill) => {
    const pillDiv = document.createElement('div');
    pillDiv.className = 'pill';
    
    // Move the content from the row into the pill div
    [...pill.children].forEach((cell) => {
      const content = cell.textContent.trim();
      if (content) {
        pillDiv.textContent = content;
      }
    });
    
    pillsContainer.appendChild(pillDiv);
  });
  
  // Clear the block and add the container
  block.textContent = '';
  block.appendChild(pillsContainer);
}

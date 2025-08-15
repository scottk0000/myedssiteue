import {
  decorateBlock,
  decorateBlocks,
  decorateButtons,
  decorateIcons,
  decorateSections,
  loadBlock,
  loadScript,
  loadSections,
} from './aem.js';
import { decorateRichtext } from './editor-support-rte.js';
import { decorateMain } from './scripts.js';

async function applyChanges(event) {
  // redecorate default content and blocks on patches (in the properties rail)
  const { detail } = event;

  // Debug: Log Universal Editor events
  // eslint-disable-next-line no-console
  console.log('Universal Editor event:', event.type, detail);

  const resource = detail?.request?.target?.resource // update, patch components
    || detail?.request?.target?.container?.resource // update, patch, add to sections
    || detail?.request?.to?.container?.resource; // move in sections
  if (!resource) return false;
  const updates = detail?.response?.updates;
  if (!updates.length) return false;
  const { content } = updates[0];
  if (!content) return false;

  // Debug: Log what's being updated
  // eslint-disable-next-line no-console
  console.log('Universal Editor updating resource:', resource);
  // eslint-disable-next-line no-console
  console.log('Update content:', content);

  // load dompurify
  await loadScript(`${window.hlx.codeBasePath}/scripts/dompurify.min.js`);

  const sanitizedContent = window.DOMPurify.sanitize(content, { USE_PROFILES: { html: true } });
  const parsedUpdate = new DOMParser().parseFromString(sanitizedContent, 'text/html');
  const element = document.querySelector(`[data-aue-resource="${resource}"]`);

  // Debug: Log element detection
  // eslint-disable-next-line no-console
  console.log('Found element for resource:', resource, element);

  if (element) {
    if (element.matches('main')) {
      const newMain = parsedUpdate.querySelector(`[data-aue-resource="${resource}"]`);
      newMain.style.display = 'none';
      element.insertAdjacentElement('afterend', newMain);
      decorateMain(newMain);
      decorateRichtext(newMain);
      await loadSections(newMain);
      element.remove();
      newMain.style.display = null;
      // eslint-disable-next-line no-use-before-define
      attachEventListners(newMain);
      return true;
    }

    // The element might be the weather-container inside the block due to moveInstrumentation
    // We need to find the actual .block element that contains this element
    let block = null;
    if (element.matches('.block')) {
      // Element is the block itself
      block = element;
    } else {
      // Element is inside a block (like weather-container), find the parent block
      block = element.closest('.block');
    }

    // Debug: Log block detection
    // eslint-disable-next-line no-console
    console.log('Element matches .block:', element.matches('.block'));
    // eslint-disable-next-line no-console
    console.log('Element has data-aue-resource:', element.hasAttribute('data-aue-resource'));
    // eslint-disable-next-line no-console
    console.log('Element closest .block:', element.closest('.block'));
    // eslint-disable-next-line no-console
    console.log('Block found:', block);
    if (block) {
      // The resource might be on the element (weather-container) or the block itself
      const blockResource = block.getAttribute('data-aue-resource') || resource;
      // Debug: Log block update
      // eslint-disable-next-line no-console
      console.log('Found block to update:', blockResource, block);
      // eslint-disable-next-line no-console
      console.log('Using resource:', blockResource);

      const newBlock = parsedUpdate.querySelector(`[data-aue-resource="${blockResource}"]`);
      if (newBlock) {
        // Debug: Log block replacement
        // eslint-disable-next-line no-console
        console.log('Replacing block with new content:', newBlock);

        newBlock.style.display = 'none';
        block.insertAdjacentElement('afterend', newBlock);

        // Reset block status to force re-decoration
        delete newBlock.dataset.blockStatus;
        // Debug: Log status reset
        // eslint-disable-next-line no-console
        console.log('Reset block status, about to decorate');

        decorateButtons(newBlock);
        decorateIcons(newBlock);
        decorateBlock(newBlock);
        decorateRichtext(newBlock);
        await loadBlock(newBlock);
        block.remove();
        newBlock.style.display = null;

        // Debug: Log completion
        // eslint-disable-next-line no-console
        console.log('Block replacement complete');
        return true;
      }
      // Debug: Log if no new block found
      // eslint-disable-next-line no-console
      console.log('No new block found in parsed update for resource:', blockResource);
    } else {
      // sections and default content, may be multiple in the case of richtext
      const newElements = parsedUpdate.querySelectorAll(`[data-aue-resource="${resource}"],[data-richtext-resource="${resource}"]`);
      if (newElements.length) {
        const { parentElement } = element;
        if (element.matches('.section')) {
          const [newSection] = newElements;
          newSection.style.display = 'none';
          element.insertAdjacentElement('afterend', newSection);
          decorateButtons(newSection);
          decorateIcons(newSection);
          decorateRichtext(newSection);
          decorateSections(parentElement);
          decorateBlocks(parentElement);
          await loadSections(parentElement);
          element.remove();
          newSection.style.display = null;
        } else {
          element.replaceWith(...newElements);
          decorateButtons(parentElement);
          decorateIcons(parentElement);
          decorateRichtext(parentElement);
        }
        return true;
      }
    }
  }

  return false;
}

function attachEventListners(main) {
  [
    'aue:content-patch',
    'aue:content-update',
    'aue:content-add',
    'aue:content-move',
    'aue:content-remove',
    'aue:content-copy',
  ].forEach((eventType) => main?.addEventListener(eventType, async (event) => {
    event.stopPropagation();
    const applied = await applyChanges(event);
    if (!applied) window.location.reload();
  }));
}

attachEventListners(document.querySelector('main'));

// decorate rich text
// this has to happen after decorateMain(), and everythime decorateBlocks() is called
decorateRichtext();
// in cases where the block decoration is not done in one synchronous iteration we need to listen
// for new richtext-instrumented elements. this happens for example when using experimentation.
const observer = new MutationObserver(() => decorateRichtext());
observer.observe(document, { attributeFilter: ['data-richtext-prop'], subtree: true });

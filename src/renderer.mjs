import { marked } from 'marked';
import DOMPurify from 'dompurify';
export function render(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown), {USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','iframe'],FORBID_ATTR:['style']});
}

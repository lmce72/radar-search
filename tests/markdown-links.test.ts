import {test,expect} from 'bun:test';
import {inlineMarkdownLinks,referenceDefinitions} from '../src/search/markdown-links.ts';

test('nested link labels retain the complete label and source range',()=>{
 const text='[needle [nested]](https://example.com/a_(b))';
 expect(inlineMarkdownLinks(text,new Map())).toMatchObject([{start:0,end:text.length,label:'needle [nested]',target:'https://example.com/a_(b)'}]);
});
test('link titles and angle destinations do not become part of the target',()=>{
 for(const text of ['[needle](https://example.com (a title))','[needle](https://example.com "title ) here")','[needle](<https://example.com/a(b>)']){
  const links=inlineMarkdownLinks(text,new Map());
  expect(links).toHaveLength(1);expect(links[0].end).toBe(text.length);
  expect(links[0].target).toBe(text.includes('<')?'https://example.com/a(b':'https://example.com');
 }
});
test('reference labels normalize whitespace and the first definition wins',()=>{
 const refs=referenceDefinitions('[Some  Label]: https://example.com/first\n[some label]: https://example.com/second');
 expect(inlineMarkdownLinks('[needle][ SOME\t LABEL ]',refs)[0]?.target).toBe('https://example.com/first');
 expect(inlineMarkdownLinks('[needle][some label]',refs)[0]?.target).toBe('https://example.com/first');
});

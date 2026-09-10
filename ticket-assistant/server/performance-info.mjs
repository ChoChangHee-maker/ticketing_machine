// Read only public product metadata, never form values or account details.
export function readPerformanceInfo() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const title = clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
  let venue = '';
  for (const label of document.querySelectorAll('dt,th')) {
    if (/^(공연장|공연장소|장소)$/.test(clean(label.textContent))) {
      venue = clean(label.nextElementSibling?.textContent).replace(/\s*(바로가기|더보기)\s*$/, '');
      if (venue) break;
    }
  }
  return { title, venue };
}

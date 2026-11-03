import { useEffect, useRef } from 'react';

// Google AdSense for members who have not bought ad-free. The app is free;
// this is what pays for it, and the "Remove ads" link beside it is the one
// thing for sale. Nothing here runs for ad-free members: the script is only
// added to the page when an ad is about to be shown, so a paying member's
// browser never talks to Google's ad servers.
//
// Two ways to render, chosen at build time:
// - VITE_ADSENSE_SLOT set to an ad unit id: a responsive display unit is
//   placed here, at the bottom of the dashboard.
// - no slot: only the script loads, and AdSense Auto ads (switched on per
//   site in the AdSense console) choose placements.
// VITE_ADSENSE_CLIENT overrides the publisher id; the default is the one
// publisher every Situated Strategies site and app shares.

const CLIENT: string =
  ((import.meta as any).env?.VITE_ADSENSE_CLIENT || '').trim() || 'ca-pub-2443535982979230';
const RAW_SLOT: string = ((import.meta as any).env?.VITE_ADSENSE_SLOT || '').trim();
// Ad unit ids are digits; anything else (a placeholder, "off") means no unit.
const SLOT: string = /^\d{6,}$/.test(RAW_SLOT) ? RAW_SLOT : '';

const SCRIPT_ID = 'adsbygoogle-js';

function loadAdsScript() {
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement('script');
  s.id = SCRIPT_ID;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
  document.head.appendChild(s);
}

export default function AdBanner({
  adFree,
  onRemoveAds,
}: {
  /** True once the member has ad-free (Cherry +, bought anywhere). */
  adFree: boolean;
  onRemoveAds: () => void;
}) {
  const pushed = useRef(false);

  useEffect(() => {
    if (adFree) return;
    loadAdsScript();
    if (SLOT && !pushed.current) {
      pushed.current = true;
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {
        // The script is blocked or has not loaded; the slot stays empty.
      }
    }
  }, [adFree]);

  if (adFree) return null;

  return (
    <div className="mt-8 text-center" id="ad-banner">
      {SLOT && (
        <ins
          className="adsbygoogle block"
          style={{ display: 'block' }}
          data-ad-client={CLIENT}
          data-ad-slot={SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
      <button
        type="button"
        onClick={onRemoveAds}
        className="mt-2 text-xs font-bold text-natural-muted hover:text-natural-primary underline-offset-2 hover:underline"
      >
        Remove ads
      </button>
    </div>
  );
}

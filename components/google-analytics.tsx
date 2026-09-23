import Script from "next/script"

/**
 * GA4, when there is a property to send to, and nothing at all when there is
 * not. Today there is not: `NEXT_PUBLIC_GA_ID` is unset and the live site loads
 * no Google script.
 *
 * It is the second provider, not the one holding the data. Page views and the
 * custom events in `lib/analytics.ts` are both recorded by Vercel Web
 * Analytics, the events under Events in the project's Analytics tab and
 * exported from there as CSV, one property at a time. This was added on
 * 23 Aug 2026, while the site was on Hobby and Vercel discarded custom events,
 * as the place those would be kept; the team went Pro on 5 Sep before it was
 * ever switched on. `track()` still calls `window.gtag` when it is defined, so
 * turning this on remains the whole integration. What would justify it now is
 * analysis Vercel's panel cannot do, such as crossing two properties of one
 * event, weighed against the cookies below.
 *
 * **To turn it on**, set `NEXT_PUBLIC_GA_ID` to the `G-` measurement ID in the
 * Vercel project's environment variables and redeploy. Unset, this renders
 * `null` and not one byte is requested, which is what keeps the default build
 * free of a tracker.
 *
 * Two things to know before setting it:
 *
 * - **GA4 writes cookies.** The Vercel scripts do not, which is why the site
 *   has no consent banner today. Turning this on for EU visitors is the moment
 *   that stops being true, so it is a decision rather than a switch.
 * - **The counts will be low.** A design-tools audience blocks
 *   `googletagmanager.com` at a rate worth assuming is large, while Vercel's
 *   scripts are served first-party. GA4's figures would sit well under
 *   Vercel's for the same events: read it for proportions, never for totals.
 *
 * `afterInteractive` rather than `beforeInteractive`: nothing on the page waits
 * on it, and a 45KB tracker ahead of the app is 45KB ahead of the app. Events
 * fired before it loads queue in `dataLayer` and go out when it arrives, so
 * nothing is lost by making it wait.
 */
export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID

  if (!id) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      {/*
        The standard bootstrap, with one addition: `send_page_view` stays on, so
        GA4's own history-change measurement counts the route changes that make
        up most of this site's navigation. `gtag` has to be a `function`
        declaration and has to use `arguments`, because what it pushes is the
        arguments object itself; an arrow function with rest parameters pushes
        an array and GA reads nothing from it.
      */}
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  )
}

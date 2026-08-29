export default function EspnBridgePage() {
  return <main className="mx-auto w-full max-w-2xl px-5 py-12 text-[#dce1d6]">
    <a href="/draft" className="text-xs text-[#7f897b] hover:text-white">← Drafts</a>
    <h1 className="mt-6 text-3xl font-semibold tracking-[-.035em]">Connect an ESPN draft</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-[#7f897b]">The bridge runs locally in Chrome and relays completed picks from an open ESPN draft tab. It does not transmit ESPN cookies, passwords, or draft security tokens.</p>
    <a download href="/downloads/ff-copilot-espn-draft-bridge.zip" className="mt-7 inline-flex h-9 items-center rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#13190d]">Download bridge ZIP</a>
    <ol className="mt-9 grid gap-5 border-t border-white/[.07] pt-7 text-sm">
      <li><span className="mr-3 font-mono text-[#8daa48]">01</span>Unzip the downloaded file.</li>
      <li><span className="mr-3 font-mono text-[#8daa48]">02</span>Open <code className="rounded bg-white/[.05] px-1.5 py-0.5 text-xs">chrome://extensions</code>.</li>
      <li><span className="mr-3 font-mono text-[#8daa48]">03</span>Enable <strong>Developer mode</strong> in the upper-right corner.</li>
      <li><span className="mr-3 font-mono text-[#8daa48]">04</span>Choose <strong>Load unpacked</strong> and select the unzipped folder.</li>
      <li><span className="mr-3 font-mono text-[#8daa48]">05</span>Open or reload the ESPN draft room. Keep that tab open during the draft.</li>
    </ol>
    <div className="mt-9 border-t border-white/[.07] pt-6 text-xs leading-5 text-[#697166]">Chrome cannot directly install an unsigned ZIP. Loading the unzipped folder is required until the bridge is distributed through the Chrome Web Store.</div>
  </main>
}

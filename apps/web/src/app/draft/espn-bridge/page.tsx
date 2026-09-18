export default function EspnBridgePage() {
  return <main className="mx-auto w-full max-w-2xl px-5 py-12 text-[#e3e3e3]">
    <a href="/draft" className="text-xs text-[#898989] hover:text-white">← Drafts</a>
    <h1 className="mt-6 text-3xl font-semibold tracking-[-.035em]">Connect an ESPN draft</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-[#898989]">The bridge runs locally in Chrome and relays completed picks from an open ESPN draft tab. It does not transmit ESPN cookies, passwords, or draft security tokens.</p>
    <a download href="/downloads/ff-copilot-espn-draft-bridge.zip" className="mt-7 inline-flex h-9 items-center rounded-[6px] bg-[#c94f49] px-4 text-xs font-semibold text-[#ffffff]">Download bridge ZIP</a>
    <ol className="mt-9 grid gap-5 border-t border-white/[.07] pt-7 text-sm">
      <li><span className="mr-3 font-mono text-[#c36761]">01</span>Unzip the downloaded file.</li>
      <li><span className="mr-3 font-mono text-[#c36761]">02</span>Open <code className="rounded bg-white/[.05] px-1.5 py-0.5 text-xs">chrome://extensions</code>.</li>
      <li><span className="mr-3 font-mono text-[#c36761]">03</span>Enable <strong>Developer mode</strong> in the upper-right corner.</li>
      <li><span className="mr-3 font-mono text-[#c36761]">04</span>Choose <strong>Load unpacked</strong> and select the unzipped folder.</li>
      <li><span className="mr-3 font-mono text-[#c36761]">05</span>Open or reload the ESPN draft room. Keep that tab open during the draft.</li>
    </ol>
    <div className="mt-9 border-t border-white/[.07] pt-6 text-xs leading-5 text-[#767676]">Chrome cannot directly install an unsigned ZIP. Loading the unzipped folder is required until the bridge is distributed through the Chrome Web Store.</div>
  </main>
}

import { Fingerprint, Icon } from "./Icon";

export function HowItWorks() {
  return <section className="how-section" id="how-it-works" aria-labelledby="how-heading">
    <div className="how-intro"><Fingerprint size={58} /><h2 id="how-heading">Their taste is the thread.</h2><p>We follow it somewhere thoughtful.</p><a href="#discover" className="text-link">Find their gifts<Icon name="arrow" size={17} /></a></div>
    <div className="how-steps">
      <div><span>01</span><section><h3>Start with their world.</h3><p>A favourite musician, a beloved film, a brand they keep coming back to. A few real interests are all you need.</p></section></div>
      <div><span>02</span><section><h3>Follow the connections.</h3><p>The agent explores Qloo&apos;s cultural graph, looking across creative worlds for tastes they haven&apos;t discovered yet.</p></section></div>
      <div><span>03</span><section><h3>Give with a little more meaning.</h3><p>Get a sure thing, an unexpected find, and a thoughtful bundle. See the connection, refine the picks, and keep your favourites.</p></section></div>
    </div>
  </section>;
}
